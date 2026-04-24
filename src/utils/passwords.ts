import bcrypt from 'bcryptjs'

const DEFAULT_ROUNDS = 12

function rounds(): number {
  const raw = process.env.CUSTOM_BCRYPT_ROUNDS
  if (!raw) return DEFAULT_ROUNDS
  const n = Number(raw)
  return Number.isInteger(n) && n >= 4 && n <= 15 ? n : DEFAULT_ROUNDS
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, rounds())
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
