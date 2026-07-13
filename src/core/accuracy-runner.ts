import { chatRequest } from './chat-request'
import {
  buildAimePrompt,
  buildAimeSystemPrompt,
  buildGpqaPrompt,
  gradeAime,
  gradeGpqa,
} from './accuracy-grade'
import { extractAssistantTextFromResponse } from './extract-assistant-text'
import { getBenchmarkMeta } from '../data/benchmark-meta'
import { randomUUID } from './random-id'
import type { AppConfig } from '../types/config'
import type {
  AccuracyQuestionResult,
  AccuracyRunReport,
  AimeQuestion,
  GpqaQuestion,
} from '../types/accuracy'

export interface AccuracyRunOptions {
  config: AppConfig
  benchmarkId: 'aime2026' | 'gpqa-diamond'
  limit?: number
  signal?: AbortSignal
  onProgress?: (result: AccuracyQuestionResult, done: number, total: number) => void
}

async function loadAime(limit?: number): Promise<AimeQuestion[]> {
  const res = await fetch('/benchmarks/aime2026.jsonl')
  const text = await res.text()
  const items = text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as AimeQuestion)
  return limit ? items.slice(0, limit) : items
}

async function loadGpqa(limit?: number): Promise<GpqaQuestion[]> {
  const res = await fetch('/benchmarks/gpqa_diamond.json')
  const items = (await res.json()) as GpqaQuestion[]
  return limit ? items.slice(0, limit) : items
}

function buildAccuracyRequestBody(
  config: AppConfig,
  benchmarkId: 'aime2026' | 'gpqa-diamond',
  prompt: string,
  maxTokens: number,
): Record<string, unknown> {
  const messages: Array<{ role: string; content: string }> = []
  if (benchmarkId === 'aime2026') {
    messages.push({ role: 'system', content: buildAimeSystemPrompt() })
  }
  messages.push({ role: 'user', content: prompt })

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: maxTokens,
    temperature: 0,
  }

  // DeepSeek V4 默认 thinking；精度评测关闭以优先拿 content 里的最终答案
  if (/deepseek/i.test(config.model)) {
    body.thinking = { type: 'disabled' }
  }

  return body
}

/** AIME 推理过程可能很长；与工程性测试一致，使用接口常见上限 32768 */
const AIME_MAX_TOKENS = 32_768
const GPQA_MAX_TOKENS = 1_024

/** 长输出评测超时（毫秒），不低于配置页 timeout */
const AIME_REQUEST_TIMEOUT_MS = 600_000

export async function runAccuracyBenchmark(
  options: AccuracyRunOptions,
): Promise<AccuracyRunReport> {
  const { config, benchmarkId, limit, signal, onProgress } = options
  const meta = getBenchmarkMeta(benchmarkId)
  const startedAt = new Date().toISOString()
  const results: AccuracyQuestionResult[] = []

  const items =
    benchmarkId === 'aime2026'
      ? await loadAime(limit)
      : await loadGpqa(limit)

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) break
    const item = items[i]
    const qid =
      benchmarkId === 'aime2026'
        ? String((item as AimeQuestion).id)
        : (item as GpqaQuestion).id

    const base: AccuracyQuestionResult = {
      id: qid,
      index: i + 1,
      status: 'running',
    }
    onProgress?.(base, i, items.length)

    const prompt =
      benchmarkId === 'aime2026'
        ? buildAimePrompt((item as AimeQuestion).problem)
        : buildGpqaPrompt((item as GpqaQuestion).question, (item as GpqaQuestion).options)

    const maxTokens = benchmarkId === 'aime2026' ? AIME_MAX_TOKENS : GPQA_MAX_TOKENS
    const requestTimeout =
      benchmarkId === 'aime2026'
        ? Math.max(config.timeoutMs, AIME_REQUEST_TIMEOUT_MS)
        : config.timeoutMs

    const res = await chatRequest({
      config,
      body: buildAccuracyRequestBody(config, benchmarkId, prompt, maxTokens),
      signal,
      timeoutMs: requestTimeout,
    })

    if (res.httpStatus < 200 || res.httpStatus >= 300) {
      const err: AccuracyQuestionResult = {
        ...base,
        status: 'error',
        durationMs: Math.round(res.durationMs),
        error: res.error ?? `HTTP ${res.httpStatus}`,
      }
      results.push(err)
      onProgress?.(err, i + 1, items.length)
      continue
    }

    const modelAnswer = extractAssistantTextFromResponse(
      res.json,
      res.bodyText,
      res.assistantContent,
    )
    if (!modelAnswer) {
      const err: AccuracyQuestionResult = {
        ...base,
        status: 'error',
        durationMs: Math.round(res.durationMs),
        error: '无法从响应中解析模型文本（请检查 API 返回格式）',
        modelAnswer: res.bodyText.slice(0, 120),
      }
      results.push(err)
      onProgress?.(err, i + 1, items.length)
      continue
    }

    if (res.finishReason === 'length') {
      const hasBoxed = /\\boxed\{/.test(modelAnswer)
      if (!hasBoxed) {
        const err: AccuracyQuestionResult = {
          ...base,
          status: 'error',
          durationMs: Math.round(res.durationMs),
          error: `输出被 max_tokens=${maxTokens} 截断，未给出 \\boxed{答案}`,
          modelAnswer: modelAnswer.slice(0, 300),
          expected:
            benchmarkId === 'aime2026'
              ? String((item as AimeQuestion).answer)
              : (item as GpqaQuestion).answer,
        }
        results.push(err)
        onProgress?.(err, i + 1, items.length)
        continue
      }
    }

    let correct = false
    let expected = ''

    if (benchmarkId === 'aime2026') {
      const q = item as AimeQuestion
      expected = String(q.answer)
      correct = gradeAime(modelAnswer, q.answer)
    } else {
      const q = item as GpqaQuestion
      expected = q.answer
      correct = gradeGpqa(modelAnswer, q.answer)
    }

    const done: AccuracyQuestionResult = {
      ...base,
      status: correct ? 'correct' : 'wrong',
      modelAnswer: modelAnswer.slice(0, 300),
      expected,
      correct,
      durationMs: Math.round(res.durationMs),
      error:
        res.finishReason === 'length' && !correct
          ? '输出可能被截断，判分结果仅供参考'
          : undefined,
    }
    results.push(done)
    onProgress?.(done, i + 1, items.length)
  }

  const graded = results.filter((r) => r.status === 'correct' || r.status === 'wrong')
  const correct = graded.filter((r) => r.correct).length
  const accuracyPct = graded.length ? (correct / graded.length) * 100 : 0
  const official = meta?.officialBaselinePct
  const diffPct = official != null ? accuracyPct - official : undefined
  const tolerance = meta?.tolerancePct ?? 2
  const pass =
    diffPct != null && graded.length > 0
      ? Math.abs(diffPct) <= tolerance
      : graded.length > 0
        ? null
        : null

  return {
    id: randomUUID(),
    benchmarkId,
    startedAt,
    finishedAt: new Date().toISOString(),
    model: config.model,
    baseUrl: config.baseUrl,
    total: graded.length,
    correct,
    accuracyPct,
    officialBaselinePct: official,
    diffPct,
    pass,
    tolerancePct: tolerance,
    results,
  }
}

export async function loadSwePreview(limit = 5): Promise<
  Array<{ instance_id: string; repo: string; problem_statement: string }>
> {
  const res = await fetch('/benchmarks/swe_bench_pro_slim.json')
  const items = await res.json()
  return items.slice(0, limit)
}
