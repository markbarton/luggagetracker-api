import { randomBytes, createHash } from 'crypto'

export function generateEmailToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashEmailToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
