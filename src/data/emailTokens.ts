import { Collection, ObjectId } from 'mongodb'
import { returnClient } from '../app/dbConnect'
import { EmailToken, EmailTokenPurpose } from '../types/emailToken'

const DB_NAME = 'luggagetracker'
const COLLECTION_NAME = 'emailTokens'

function collection(): Collection<EmailToken> {
  const client = returnClient()
  if (!client) throw new Error('MongoDB client not initialised')
  return client.db(DB_NAME).collection<EmailToken>(COLLECTION_NAME)
}

export async function ensureIndexes(): Promise<void> {
  await collection().createIndex({ tokenHash: 1 }, { unique: true })
  await collection().createIndex({ userId: 1, purpose: 1 })
  await collection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
}

export interface CreateArgs {
  userId: ObjectId
  purpose: EmailTokenPurpose
  tokenHash: string
  expiresAt: Date
}

export async function create(args: CreateArgs): Promise<EmailToken> {
  const doc: EmailToken = {
    userId: args.userId,
    purpose: args.purpose,
    tokenHash: args.tokenHash,
    expiresAt: args.expiresAt,
    createdAt: new Date()
  }
  const result = await collection().insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

export async function findByHash(
  tokenHash: string,
  purpose: EmailTokenPurpose
): Promise<EmailToken | null> {
  return collection().findOne({ tokenHash, purpose })
}

export async function markUsed(id: ObjectId): Promise<boolean> {
  const result = await collection().updateOne(
    { _id: id, usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } }
  )
  return result.matchedCount === 1
}
