// Max delay supported by setTimeout (2^31 - 1 ms)
const MAX_DELAY = 2147483647

// Parse a --delay value (in milliseconds). Throws on invalid values.
export function parseDelay(value: string): number {
  const trimmed = value.trim()
  const delay = trimmed === '' ? NaN : Number(trimmed)

  if (!Number.isFinite(delay) || delay < 0 || delay > MAX_DELAY) {
    throw new Error(
      `Invalid --delay value "${value}", it must be a number of milliseconds between 0 and ${MAX_DELAY}`,
    )
  }

  return delay
}
