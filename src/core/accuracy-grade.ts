function normalizeInteger(s: string): string {
  const n = s.replace(/^0+/, '')
  return n || '0'
}

export function gradeAime(modelText: string, expected: number | string): boolean {
  const exp = normalizeInteger(String(expected).trim())
  const text = modelText.trim()

  const boxedAll = [...text.matchAll(/\\boxed\{([^}]+)\}/g)]
  if (boxedAll.length) {
    const num = boxedAll[boxedAll.length - 1][1].match(/-?\d+/)?.[0]
    if (num && normalizeInteger(num) === exp) return true
  }

  const answerPatterns = [
    /(?:final answer|the answer is|answer)\s*[:：=]\s*(\d+)/gi,
    /(?:find|so)\s+\$?(\d+)\s*\.?\s*$/i,
    /m\s*\+\s*n\s*=\s*(\d+)/i,
  ]
  for (const pat of answerPatterns) {
    const matches = [...text.matchAll(pat)]
    if (matches.length) {
      const n = matches[matches.length - 1][1]
      if (normalizeInteger(n) === exp) return true
    }
  }

  if (/^\d+$/.test(text)) return normalizeInteger(text) === exp

  const numbers = text.match(/-?\d+/g)
  if (!numbers?.length) return false
  const last = numbers[numbers.length - 1]
  return normalizeInteger(last) === exp
}

export function gradeGpqa(modelText: string, expectedLetter: string): boolean {
  const exp = expectedLetter.trim().toUpperCase()
  const text = modelText.trim().toUpperCase()

  const explicit = text.match(/\b([A-D])\b/g)
  if (explicit?.length) {
    return explicit[explicit.length - 1] === exp
  }

  const answerLine = text.match(/ANSWER\s*[:：]\s*([A-D])/)
  if (answerLine) return answerLine[1] === exp

  return text.startsWith(exp) || text.endsWith(exp)
}

export function buildAimeSystemPrompt(): string {
  return (
    'You solve AIME competition math problems. ' +
    'You may show work, but you MUST end with exactly one final line: \\boxed{integer} ' +
    'where integer is the non-negative integer answer. Never stop before writing \\boxed{...}.'
  )
}

export function buildAimePrompt(problem: string): string {
  return (
    `${problem}\n\n` +
    'Solve this problem. The final answer is a non-negative integer. ' +
    'End your response with \\boxed{your_answer} on the last line.'
  )
}

export function buildGpqaPrompt(question: string, options: string[]): string {
  const opts = options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
  return `${question}\n\n${opts}\n\nReply with only the letter of the correct option (A, B, C, or D).`
}
