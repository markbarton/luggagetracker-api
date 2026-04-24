export function parsePositiveInt(
  value: unknown,
  fallback: number,
  max?: number
): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return fallback
  if (max !== undefined && n > max) return max
  return n
}
