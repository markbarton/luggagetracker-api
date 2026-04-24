import jwt, { SignOptions } from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  sid: string
  clientId: string | null
  isSystemAdmin: boolean
  roles: string[]
  platform: 'mobile' | 'web'
  kind: 'access' | 'refresh'
}

function secret(): string {
  const s = process.env.CUSTOM_JWT_SECRET
  if (!s) throw new Error('CUSTOM_JWT_SECRET is not set')
  return s
}

export function webAccessTtl(): string {
  return process.env.CUSTOM_JWT_WEB_ACCESS_TTL || '15m'
}

export function webRefreshTtl(): string {
  return process.env.CUSTOM_JWT_WEB_REFRESH_TTL || '30d'
}

export function mobileAccessTtl(): string {
  return process.env.CUSTOM_JWT_MOBILE_ACCESS_TTL || '365d'
}

export function signToken(payload: JwtPayload, expiresIn: string): string {
  const options: SignOptions = { expiresIn: expiresIn as SignOptions['expiresIn'] }
  return jwt.sign(payload, secret(), options)
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, secret()) as JwtPayload
  } catch {
    return null
  }
}

export function ttlToMillis(ttl: string): number {
  const match = ttl.match(/^(\d+)([smhd])$/)
  if (!match) return 0
  const n = Number(match[1])
  const unit = match[2]
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000
  return n * mult
}
