/** Sliding-window RPM / TPM throttle (client-side pacing). */

export class RateLimiter {
  private requestTimes: number[] = []
  private tokenEvents: { time: number; tokens: number }[] = []

  reset() {
    this.requestTimes = []
    this.tokenEvents = []
  }

  async acquire(
    estimatedTokens: number,
    rpm: number,
    tpm: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (rpm <= 0 && tpm <= 0) return

    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      const now = Date.now()
      const windowStart = now - 60_000
      this.requestTimes = this.requestTimes.filter((t) => t > windowStart)
      this.tokenEvents = this.tokenEvents.filter((e) => e.time > windowStart)

      const rpmOk = rpm <= 0 || this.requestTimes.length < rpm
      const tokensUsed = this.tokenEvents.reduce((s, e) => s + e.tokens, 0)
      const tpmOk = tpm <= 0 || tokensUsed + estimatedTokens <= tpm

      if (rpmOk && tpmOk) {
        this.requestTimes.push(now)
        if (estimatedTokens > 0) {
          this.tokenEvents.push({ time: now, tokens: estimatedTokens })
        }
        return
      }

      await sleep(250, signal)
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}
