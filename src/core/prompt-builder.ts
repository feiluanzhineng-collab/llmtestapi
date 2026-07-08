const CORPUS =
  'Database indexing improves query performance on large tables. ' +
  'API rate limiting protects upstream services from overload. ' +
  'Go concurrency patterns include worker pools and errgroup. ' +
  'SQL optimization often starts with EXPLAIN ANALYZE. ' +
  'Error handling should preserve context for debugging. '

export function buildPromptForTargetTokens(target: number, seed: number): string {
  if (target <= 64) {
    const shorts = [
      'Say OK.',
      'Reply: hi',
      'One word: yes',
      '2+2=?',
      'Capital of France?',
    ]
    return shorts[seed % shorts.length]
  }

  if (target <= 512) {
    const topic = ['indexing', 'caching', 'auth', 'logging'][seed % 4]
    const chunk = CORPUS.repeat(3).slice(0, 200 + (seed % 100))
    return `[p${seed}] Briefly note one ${topic} tip in one sentence.\n\n\`\`\`\n${chunk}\n\`\`\``
  }

  const charsNeeded = Math.max(target * 3, 200)
  let body = ''
  while (estimateInline(body) < target) {
    body += CORPUS
  }
  const intro = `Analyze the following reference text (seed ${seed}). Reply with one short sentence only.\n\n`
  return intro + body.slice(0, charsNeeded)
}

function estimateInline(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3))
}
