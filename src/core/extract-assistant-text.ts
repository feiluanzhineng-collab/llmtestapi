type MessageLike = Record<string, unknown>

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const block = part as Record<string, unknown>
    if (typeof block.text === 'string') parts.push(block.text)
    else if (typeof block.content === 'string') parts.push(block.content)
  }
  return parts.join('\n').trim()
}

function textFromMessage(msg: MessageLike | undefined): string {
  if (!msg) return ''

  const content = textFromContent(msg.content)
  if (content) return content

  for (const key of ['reasoning_content', 'reasoning', 'thinking'] as const) {
    const v = msg[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }

  return ''
}

/** 从 OpenAI 兼容 chat completion JSON 中提取助手文本 */
export function extractAssistantText(json: unknown): string {
  if (!json || typeof json !== 'object') return ''

  const root = json as Record<string, unknown>

  if (root.data && typeof root.data === 'object') {
    const nested = extractAssistantText(root.data)
    if (nested) return nested
  }

  const choices = root.choices as Array<{ message?: MessageLike; delta?: MessageLike }> | undefined
  const choice = choices?.[0]
  const fromMessage = textFromMessage(choice?.message)
  if (fromMessage) return fromMessage

  const fromDelta = textFromMessage(choice?.delta)
  if (fromDelta) return fromDelta

  const outputText = root.output_text
  if (typeof outputText === 'string' && outputText.trim()) return outputText.trim()

  return ''
}

export function extractAssistantTextFromResponse(
  json: unknown | null,
  bodyText: string,
  assistantContent?: string | null,
): string {
  if (typeof assistantContent === 'string' && assistantContent.trim()) {
    return assistantContent.trim()
  }

  const fromJson = extractAssistantText(json)
  if (fromJson) return fromJson

  const trimmed = bodyText.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const reparsed = JSON.parse(trimmed) as unknown
      const fromReparsed = extractAssistantText(reparsed)
      if (fromReparsed) return fromReparsed
    } catch {
      // not JSON
    }
    return ''
  }

  return trimmed
}
