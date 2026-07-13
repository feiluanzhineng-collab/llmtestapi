import type { EngCaseDef } from '../types/engineering'
import {
  detBody,
  ENG_BEHAVIOR_VERIFY_RUNS,
  ENG_JSON_VERIFY_RUNS,
} from './engineering-deterministic'

const WEATHER_TOOL = {
  type: 'function' as const,
  function: {
    name: 'get_weather',
    description: 'Get current weather for a city',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  },
}

function cachePrefix(seed: string): string {
  const chunk =
    '工程验收 Cache 前缀填充。Database indexing improves query performance. Distributed systems require careful design. '
  return `[cache-${seed}] ${chunk.repeat(80)}`
}

export function getEngineeringCases(model: string): EngCaseDef[] {
  return [
    {
      id: 'thinking-toggle',
      subject: 'Thinking 控制',
      requirement:
        'Anthropic 风格：request body 中 {"thinking":{"type":"enabled"}} 与 {"thinking":{"type":"disabled"}} 可控制思考开关',
      mode: 'auto',
      steps: [
        {
          id: 'thinking-on',
          label: 'thinking enabled',
          body: {
            model,
            thinking: { type: 'enabled' },
            messages: [{ role: 'user', content: 'What is 2+2? Reply briefly.' }],
            max_tokens: 64,
          },
          expect: { status: [200, 400] },
        },
        {
          id: 'thinking-off',
          label: 'thinking disabled',
          body: {
            model,
            thinking: { type: 'disabled' },
            messages: [{ role: 'user', content: 'What is 2+2? Reply briefly.' }],
            max_tokens: 64,
          },
          expect: { status: [200, 400] },
        },
      ],
    },
    {
      id: 'param-defaults',
      subject: '参数默认值',
      requirement:
        '默认 thinking 开时 temperature=1.0，关时 temperature=0.6；top_p=0.95；presence_penalty=0；frequency_penalty=0；n=1',
      mode: 'semi',
      steps: [
        {
          id: 'defaults-thinking-on',
          label: '不传 temperature（thinking on）',
          body: {
            model,
            thinking: { type: 'enabled' },
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 8,
          },
          expect: { status: [200, 400] },
        },
        {
          id: 'defaults-thinking-off',
          label: '不传 temperature（thinking off）',
          body: {
            model,
            thinking: { type: 'disabled' },
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 8,
          },
          expect: { status: [200, 400] },
        },
      ],
    },
    {
      id: 'max-tokens-default',
      subject: 'max_tokens 默认值',
      requirement: 'max_tokens 默认 32768，允许用户修改',
      mode: 'semi',
      steps: [
        {
          id: 'no-max-tokens',
          label: '不传 max_tokens',
          body: {
            model,
            messages: [{ role: 'user', content: 'Reply with one word: OK' }],
          },
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'no-system-prompt',
      subject: '不注入 System Prompt',
      requirement: '供应商默认不添加任何 System Prompt',
      mode: 'semi',
      steps: [
        {
          id: 'bare-user',
          label: '仅 user 消息',
          body: {
            model,
            messages: [{ role: 'user', content: 'Reply OK' }],
            max_tokens: 8,
          },
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'interleaved-thinking-toolcall',
      subject: 'Interleaved thinking + Tool Call',
      requirement: 'toolcall 前 interleaved thinking 必须传回，否则 400',
      mode: 'auto',
      optional: true,
      steps: [
        {
          id: 'tool-with-thinking',
          label: 'tools + thinking',
          body: detBody({
            model,
            thinking: { type: 'enabled' },
            messages: [
              {
                role: 'user',
                content: 'What is the weather in Beijing? Use get_weather.',
              },
            ],
            tools: [WEATHER_TOOL],
            tool_choice: 'auto',
            max_tokens: 256,
          }),
          handler: 'majority-repeat',
          handlerOptions: { repeatCount: ENG_BEHAVIOR_VERIFY_RUNS, minPassCount: ENG_BEHAVIOR_VERIFY_RUNS },
          expect: { status: [200, 400], hasToolCalls: true },
        },
      ],
    },
    {
      id: 'eos-suppress',
      subject: '思考过程 EOS 抑制',
      requirement:
        '推理请求中 finish_reason=stop 且 content 为空的比例应极低（文档标准：1000 次压测）',
      mode: 'auto',
      steps: [
        {
          id: 'eos-batch',
          label: 'EOS 统计压测',
          handler: 'eos-batch',
          body: detBody({
            model,
            thinking: { type: 'enabled' },
            messages: [
              {
                role: 'user',
                content: 'Why is the sky blue? Answer in 2-3 sentences.',
              },
            ],
            max_tokens: 32,
          }),
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'stream-usage',
      subject: '流式累计 token 用量',
      requirement: '流式输出时每个 chunk 或末 chunk 返回累计 usage（input + output tokens）',
      mode: 'auto',
      steps: [
        {
          id: 'stream-usage-chunk',
          label: 'SSE 末 chunk usage',
          stream: true,
          body: detBody({
            model,
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 16,
          }),
          expect: { status: 200, sseUsageInLastChunk: true },
        },
      ],
    },
    {
      id: 'rate-limit',
      subject: '频控容忍',
      requirement: 'RPM/TPM/并发限流规则，超限返回 429 或排队',
      mode: 'semi',
      optional: true,
      steps: [
        {
          id: 'burst-requests',
          label: '短时 burst（检测 429）',
          skip: true,
          skipReason: '默认跳过 burst 压测，避免干扰账号；可在高级设置开启',
          body: { model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 4 },
          expect: { status: [200, 429] },
        },
      ],
    },
    {
      id: 'cache',
      subject: 'Cache 能力',
      requirement: 'Prompt Cache/KV Cache；有 cached_tokens 或延迟显著下降即通过，否则跳过',
      mode: 'semi',
      steps: [
        {
          id: 'cache-compare',
          label: '同前缀两次请求',
          handler: 'cache-compare',
          body: detBody({
            model,
            messages: [{ role: 'user', content: cachePrefix('eng-test') }],
            max_tokens: 16,
          }),
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'structured-output',
      subject: '结构化输出',
      requirement:
        '支持 json_object 与 json_schema；固定 temperature=0 + seed，json_object 连续 5 次均合法 JSON',
      mode: 'auto',
      steps: [
        {
          id: 'json-object',
          label: 'json_object',
          body: detBody({
            model,
            messages: [{ role: 'user', content: 'Return {"answer":42}' }],
            response_format: { type: 'json_object' },
            max_tokens: 64,
          }),
          expect: { status: [200, 400], jsonValid: true },
        },
        {
          id: 'json-schema',
          label: 'json_schema',
          body: detBody({
            model,
            messages: [{ role: 'user', content: 'Return answer as integer 42' }],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'answer_schema',
                strict: true,
                schema: {
                  type: 'object',
                  properties: { answer: { type: 'integer' } },
                  required: ['answer'],
                  additionalProperties: false,
                },
              },
            },
            max_tokens: 64,
          }),
          expect: { status: [200, 400], jsonSchemaKeys: ['answer'] },
        },
        {
          id: 'json-repeat',
          label: 'json_object 合规率',
          handler: 'json-repeat',
          handlerOptions: { repeatCount: ENG_JSON_VERIFY_RUNS, minPassRate: 1 },
          body: detBody({
            model,
            messages: [{ role: 'user', content: 'Return JSON: {"ok":true}' }],
            response_format: { type: 'json_object' },
            max_tokens: 64,
          }),
          expect: { status: [200, 400], jsonValid: true },
        },
      ],
    },
    {
      id: 'tool-call',
      subject: 'Function Calling',
      requirement: '兼容 OpenAI Tool Use，支持 tools 定义与函数调用',
      mode: 'auto',
      steps: [
        {
          id: 'single-tool',
          label: '单工具调用',
          body: detBody({
            model,
            messages: [
              {
                role: 'user',
                content: 'What is the weather in Tokyo? Use the get_weather tool.',
              },
            ],
            tools: [WEATHER_TOOL],
            tool_choice: 'auto',
            max_tokens: 128,
          }),
          handler: 'majority-repeat',
          handlerOptions: { repeatCount: ENG_BEHAVIOR_VERIFY_RUNS, minPassCount: ENG_BEHAVIOR_VERIFY_RUNS },
          expect: { status: [200, 400], hasToolCalls: true, minToolCalls: 1 },
        },
        {
          id: 'parallel-tools',
          label: '并行工具调用',
          body: detBody({
            model,
            messages: [
              {
                role: 'user',
                content:
                  'Get weather for Beijing and Shanghai using get_weather. Call the tool for both cities.',
              },
            ],
            tools: [WEATHER_TOOL],
            tool_choice: 'auto',
            max_tokens: 256,
          }),
          handler: 'majority-repeat',
          handlerOptions: { repeatCount: ENG_BEHAVIOR_VERIFY_RUNS, minPassCount: ENG_BEHAVIOR_VERIFY_RUNS },
          expect: { status: [200, 400], hasToolCalls: true, minToolCalls: 1 },
        },
      ],
    },
    {
      id: 'multi-turn',
      subject: '多轮对话',
      requirement: '携带历史消息多轮对话；temperature=0 + seed，3 次复验均命中上下文',
      mode: 'auto',
      steps: [
        {
          id: 'multi-turn-3',
          label: '3 轮上下文',
          body: detBody({
            model,
            messages: [
              { role: 'user', content: 'My favorite color is blue. Remember this.' },
              { role: 'assistant', content: 'Got it, your favorite color is blue.' },
              { role: 'user', content: 'What is my favorite color? Reply with just the color.' },
            ],
            max_tokens: 64,
          }),
          handler: 'majority-repeat',
          handlerOptions: { repeatCount: ENG_BEHAVIOR_VERIFY_RUNS, minPassCount: ENG_BEHAVIOR_VERIFY_RUNS },
          expect: { status: 200, contentIncludesAny: ['blue', '蓝色'] },
        },
      ],
    },
    {
      id: 'stream-sse',
      subject: '流式 SSE',
      requirement: 'SSE 逐 chunk 返回，协议格式合规',
      mode: 'auto',
      steps: [
        {
          id: 'sse-basic',
          label: 'SSE 流式',
          stream: true,
          body: detBody({
            model,
            messages: [{ role: 'user', content: 'Count from 1 to 3' }],
            max_tokens: 32,
          }),
          expect: { status: 200 },
        },
      ],
    },
  ]
}

export function listEngineeringCases(includeOptional = false): EngCaseDef[] {
  return getEngineeringCases('').filter((c) => includeOptional || !c.optional)
}
