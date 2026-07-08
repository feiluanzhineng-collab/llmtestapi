import type { CompatCaseDef } from '../types/compat'

const baseUser = (content: string) => [{ role: 'user', content }]

export function buildLongInput(chars: number): string {
  const chunk = '兼容性测试输入长度填充文本。Database indexing improves query performance. '
  return chunk.repeat(Math.ceil(chars / chunk.length)).slice(0, chars)
}

export function getCompatibilityCases(model: string): CompatCaseDef[] {
  return [
    {
      id: 'messages',
      subject: 'messages',
      testPoints: 'role/content 必填；缺 role 返回 400；content 支持 string',
      risk: '基础功能不可用',
      steps: [
        {
          id: 'messages-ok',
          label: '正常 messages',
          body: { model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 8 },
          expect: { status: 200 },
        },
        {
          id: 'messages-missing-role',
          label: '缺失 role',
          body: { model, messages: [{ content: 'hi' } as unknown as Record<string, unknown>], max_tokens: 8 },
          expect: { status: [400, 422] },
        },
      ],
    },
    {
      id: 'messages-array',
      subject: 'messages-元素',
      testPoints: '空数组 400；非法类型 422；null 拒绝',
      risk: '请求解析失败',
      steps: [
        {
          id: 'messages-empty',
          label: '空数组',
          body: { model, messages: [], max_tokens: 8 },
          expect: { status: 400 },
        },
        {
          id: 'messages-null',
          label: 'null 元素',
          body: { model, messages: [null], max_tokens: 8 },
          expect: { status: [400, 422] },
        },
      ],
    },
    {
      id: 'top-p',
      subject: 'top_p',
      testPoints: '[0,1] 边界；超范围 400',
      risk: '采样行为异常',
      steps: [
        {
          id: 'top-p-zero',
          label: 'top_p=0',
          body: { model, messages: baseUser('Say OK'), top_p: 0, max_tokens: 8 },
          expect: { status: 200 },
        },
        {
          id: 'top-p-one',
          label: 'top_p=1',
          body: { model, messages: baseUser('Say OK'), top_p: 1, max_tokens: 8 },
          expect: { status: 200 },
        },
        {
          id: 'top-p-over',
          label: 'top_p=1.5',
          body: { model, messages: baseUser('Say OK'), top_p: 1.5, max_tokens: 8 },
          expect: { status: [400, 422] },
        },
      ],
    },
    {
      id: 'temperature',
      subject: 'temperature',
      testPoints: '[0,2] 边界；temperature=0 确定性',
      risk: '生成多样性失控',
      steps: [
        {
          id: 'temp-zero',
          label: 'temperature=0',
          body: { model, messages: baseUser('Reply: 7'), temperature: 0, max_tokens: 8 },
          expect: { status: 200 },
        },
        {
          id: 'temp-two',
          label: 'temperature=2',
          body: { model, messages: baseUser('Say hi'), temperature: 2, max_tokens: 8 },
          expect: { status: 200 },
        },
        {
          id: 'temp-over',
          label: 'temperature=3',
          body: { model, messages: baseUser('Say hi'), temperature: 3, max_tokens: 8 },
          expect: { status: [400, 422] },
        },
      ],
    },
    {
      id: 'frequency-penalty',
      subject: 'frequency_penalty',
      testPoints: '[-2,2] 边界与异常值',
      risk: '重复抑制失效',
      steps: [
        {
          id: 'freq-valid',
          label: 'frequency_penalty=1',
          body: { model, messages: baseUser('Say OK'), frequency_penalty: 1, max_tokens: 8 },
          expect: { status: 200 },
        },
        {
          id: 'freq-over',
          label: 'frequency_penalty=3',
          body: { model, messages: baseUser('Say OK'), frequency_penalty: 3, max_tokens: 8 },
          expect: { status: [400, 422] },
        },
      ],
    },
    {
      id: 'presence-penalty',
      subject: 'presence_penalty',
      testPoints: '[-2,2] 边界',
      risk: '话题多样性失控',
      steps: [
        {
          id: 'pres-valid',
          label: 'presence_penalty=1',
          body: { model, messages: baseUser('Say OK'), presence_penalty: 1, max_tokens: 8 },
          expect: { status: 200 },
        },
        {
          id: 'pres-over',
          label: 'presence_penalty=3',
          body: { model, messages: baseUser('Say OK'), presence_penalty: 3, max_tokens: 8 },
          expect: { status: [400, 422] },
        },
      ],
    },
    {
      id: 'max-tokens',
      subject: 'max_tokens',
      testPoints: '0/负数/极大值；max_completion_tokens 兼容',
      risk: '输出截断 / 资源滥用',
      steps: [
        {
          id: 'max-zero',
          label: 'max_tokens=0',
          body: { model, messages: baseUser('Say OK'), max_tokens: 0 },
          expect: { status: [200, 400] },
        },
        {
          id: 'max-negative',
          label: 'max_tokens=-1',
          body: { model, messages: baseUser('Say OK'), max_tokens: -1 },
          expect: { status: [400, 422] },
        },
        {
          id: 'max-completion',
          label: 'max_completion_tokens',
          body: {
            model,
            messages: baseUser('Say OK'),
            max_completion_tokens: 8,
          },
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'stream',
      subject: 'stream',
      testPoints: 'SSE 格式；末 chunk 含 usage',
      risk: '计费不准 / 流式不可用',
      steps: [
        {
          id: 'stream-sse',
          label: '流式 + usage',
          stream: true,
          body: { model, messages: baseUser('Say OK'), max_tokens: 16 },
          expect: { status: 200, sseUsageInLastChunk: true },
        },
      ],
    },
    {
      id: 'stop',
      subject: 'stop',
      testPoints: '单个/多个 stop 词',
      risk: '输出无法终止',
      steps: [
        {
          id: 'stop-single',
          label: 'stop=END',
          body: {
            model,
            messages: baseUser('Reply with: Hello END world'),
            stop: ['END'],
            max_tokens: 32,
          },
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'json-object',
      subject: 'json_object',
      testPoints: 'response_format json_object 输出合法 JSON',
      risk: '结构化输出不可用',
      steps: [
        {
          id: 'json-ok',
          label: 'json_object',
          body: {
            model,
            messages: baseUser('Return JSON: {"answer":42}'),
            response_format: { type: 'json_object' },
            max_tokens: 64,
          },
          expect: { status: 200, jsonValid: true },
        },
      ],
    },
    {
      id: 'auth',
      subject: '鉴权与安全',
      testPoints: '无效 Key 401；缺失 Authorization 401',
      risk: '安全事故',
      steps: [
        {
          id: 'auth-invalid',
          label: '无效 API Key',
          auth: 'invalid',
          body: { model, messages: baseUser('hi'), max_tokens: 8 },
          expect: { status: 401 },
        },
        {
          id: 'auth-missing',
          label: '缺失 Authorization',
          auth: 'none',
          body: { model, messages: baseUser('hi'), max_tokens: 8 },
          expect: { status: 401 },
        },
      ],
    },
    {
      id: 'encoding',
      subject: '编码与特殊字符',
      testPoints: '中文/emoji/\\n 正确传递',
      risk: '乱码 / 解析失败',
      steps: [
        {
          id: 'encoding-mix',
          label: '中日文 emoji',
          body: {
            model,
            messages: baseUser('请回复：你好🎵テスト\n\t'),
            max_tokens: 32,
          },
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'system-prompt',
      subject: 'system prompt 行为',
      testPoints: 'system 消息正常处理',
      risk: '模型行为不可控',
      steps: [
        {
          id: 'system-ok',
          label: 'system + user',
          body: {
            model,
            messages: [
              { role: 'system', content: 'You always reply in one word.' },
              { role: 'user', content: 'Say hello' },
            ],
            max_tokens: 16,
          },
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'input-length',
      subject: '输入长度-云API',
      testPoints: '超长输入返回 413/400',
      risk: '请求失败无法感知',
      steps: [
        {
          id: 'input-too-long',
          label: '超长输入 (~500K chars)',
          body: {
            model,
            messages: baseUser('build-long-input'),
            max_tokens: 8,
          },
          expect: { status: [400, 413, 422] },
        },
      ],
      optional: true,
    },
    {
      id: 'idempotency',
      subject: '幂等性验证',
      testPoints: '相同 seed 输出一致',
      risk: '重试逻辑异常',
      steps: [
        {
          id: 'seed-stable',
          label: 'seed 稳定性 (3次)',
          body: {
            model,
            messages: baseUser('Reply with exactly: STABLE'),
            max_tokens: 16,
            seed: 42,
            temperature: 0,
          },
          expect: { status: 200, seedStable: { runs: 3 } },
        },
      ],
      optional: true,
    },
    {
      id: 'web-search',
      subject: '联网搜索',
      testPoints: '联网开关（模型支持时）',
      risk: '功能不可用',
      optional: true,
      steps: [
        {
          id: 'web-search-off',
          label: '联网参数（可选）',
          skip: true,
          skipReason: '需模型支持联网参数，手动确认',
          body: { model, messages: baseUser('今天天气'), max_tokens: 32 },
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'multimodal',
      subject: '多模态输入',
      testPoints: '图片 URL/base64（需视觉模型）',
      risk: '多模态不可用',
      optional: true,
      steps: [
        {
          id: 'multimodal-skip',
          label: '多模态',
          skip: true,
          skipReason: '需视觉模型，后续版本支持',
          body: { model, messages: baseUser('describe'), max_tokens: 8 },
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'deepseek-v3',
      subject: 'deepseek_v3',
      testPoints: '模型特有参数',
      risk: '模型特性失效',
      optional: true,
      steps: [
        {
          id: 'ds-skip',
          label: 'DeepSeek V3 参数',
          skip: true,
          skipReason: '仅适用于 DeepSeek V3',
          body: { model, messages: baseUser('hi'), max_tokens: 8 },
          expect: { status: 200 },
        },
      ],
    },
    {
      id: 'badcase',
      subject: '线上 badcase',
      testPoints: '历史问题回归',
      risk: '历史 Bug 复现',
      optional: true,
      steps: [
        {
          id: 'badcase-skip',
          label: 'badcase 回归',
          skip: true,
          skipReason: '需维护 badcase 用例库',
          body: { model, messages: baseUser('hi'), max_tokens: 8 },
          expect: { status: 200 },
        },
      ],
    },
  ]
}
