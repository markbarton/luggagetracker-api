import { Collection, ObjectId } from 'mongodb'
import { returnClient } from '../app/dbConnect'
import { Session, SessionKind, SessionPlatform } from '../types/session'

const DB_NAME = 'luggagetracker'
const COLLECTION_NAME = 'sessions'

function collection(): Collection<Session> {
  const client = returnClient()
  if (!client) throw new Error('MongoDB client not initialised')
  return client.db(DB_NAME).collection<Session>(COLLECTION_NAME)
}

export async function ensureIndexes(): Promise<void> {
  await collection().createIndex({ userId: 1 })
  await collection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
}

export interface CreateArgs {
  userId: ObjectId
  platform: SessionPlatform
  kind: SessionKind
  expiresAt: Date
  deviceLabel?: string
}

export async function create(args: CreateArgs): Promise<Session> {
  const doc: Session = {
    userId: args.userId,
    platform: args.platform,
    kind: args.kind,
    expiresAt: args.expiresAt,
    deviceLabel: args.deviceLabel,
    createdAt: new Date()
  }
  const result = await collection().insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

export async function findActiveById(id: string): Promise<Session | null> {
  if (!ObjectId.isValid(id)) return null
  const session = await collection().findOne({ _id: new ObjectId(id) })
  if (!session) return null
  if (session.revokedAt) return null
  if (session.expiresAt.getTime() <= Date.now()) return null
  return session
}

export async function touch(id: ObjectId): Promise<void> {
  await collection().updateOne({ _id: id }, { $set: { lastUsedAt: new Date() } })
}

export async function revoke(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const result = await collection().updateOne(
    { _id: new ObjectId(id), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  )
  return result.matchedCount === 1
}

export async function revokeAllForUser(userId: ObjectId): Promise<void> {
  await collection().updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  )
}

export async function listActiveForUser(userId: ObjectId): Promise<Session[]> {
  return collection()
    .find({
      userId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() }
    })
    .sort({ createdAt: -1 })
    .toArray()
}
