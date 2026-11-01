// Parse the --delay option value (milliseconds). Throws if it's not a non-negative number.
export function parseDelay(value: string): number {
  const trimmed = value.trim()
  const delay = trimmed === '' ? NaN : Number(trimmed)
  if (!Number.isFinite(delay) || delay < 0) {
    throw new RangeError(`Invalid --delay value "${value}", expected a non-negative number of milliseconds`)
  }
  return delay
}
