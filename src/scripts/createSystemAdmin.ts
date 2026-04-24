import dotenv from 'dotenv'

const NODE_ENV = process.env.NODE_ENV || 'development'
dotenv.config({ path: NODE_ENV === 'production' ? '.env' : `.env.${NODE_ENV}` })

import { dbConnect, returnClient } from '../app/dbConnect'
import { ensureIndexes } from '../app/ensureIndexes'
import * as users from '../data/users'
import { hashPassword } from '../utils/passwords'

async function main(): Promise<void> {
  const [, , emailArg, passwordArg, firstNameArg, lastNameArg] = process.argv
  if (!emailArg || !passwordArg) {
    console.error('Usage: ts-node src/scripts/createSystemAdmin.ts <email> <password> [firstName] [lastName]')
    process.exit(1)
  }

  const email = emailArg.trim().toLowerCase()
  const password = passwordArg
  const firstName = firstNameArg || 'System'
  const lastName = lastNameArg || 'Admin'

  if (password.length < 8) {
    console.error('Password must be at least 8 characters')
    process.exit(1)
  }

  await dbConnect()
  await ensureIndexes()

  const existing = await users.findByEmail(email)
  if (existing) {
    console.error(`User ${email} already exists (id=${existing._id})`)
    await returnClient()?.close()
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)
  const created = await users.create({
    clientId: null,
    email,
    firstName,
    lastName,
    isSystemAdmin: true,
    roles: [],
    accessMode: 'both',
    status: 'active',
    passwordHash,
    emailVerified: true
  })

  console.log(`Created system admin id=${created._id} email=${created.email}`)
  await returnClient()?.close()
  process.exit(0)
}

main().catch(err => {
  console.error('createSystemAdmin failed:', err)
  process.exit(1)
})
