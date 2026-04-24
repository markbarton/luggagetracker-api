import { Collection, Filter, ObjectId } from 'mongodb'
import { returnClient } from '../app/dbConnect'
import {
  User,
  UserCreate,
  UserUpdate,
  UserStatus
} from '../types/user'
import { Actor } from '../types/audit'
import { escapeRegex } from '../utils/escapeRegex'

const DB_NAME = 'luggagetracker'
const COLLECTION_NAME = 'users'

function collection(): Collection<User> {
  const client = returnClient()
  if (!client) throw new Error('MongoDB client not initialised')
  return client.db(DB_NAME).collection<User>(COLLECTION_NAME)
}

export async function ensureIndexes(): Promise<void> {
  await collection().createIndex({ email: 1 }, { unique: true })
  await collection().createIndex({ clientId: 1 })
}

export interface ListOptions {
  page: number
  pageSize: number
  clientId?: string
  email?: string
  status?: UserStatus
  includeDeleted?: boolean
}

export interface ListResult {
  data: User[]
  total: number
}

export async function list(opts: ListOptions): Promise<ListResult> {
  const filter: Filter<User> = {}
  if (opts.clientId && ObjectId.isValid(opts.clientId)) {
    filter.clientId = new ObjectId(opts.clientId)
  }
  if (opts.email) {
    filter.email = { $regex: `^${escapeRegex(opts.email.toLowerCase())}`, $options: 'i' }
  }
  if (opts.status) {
    filter.status = opts.status
  } else if (!opts.includeDeleted) {
    filter.status = { $ne: 'deleted' }
  }

  const cursor = collection()
    .find(filter)
    .sort({ createdAt: -1 })
    .skip((opts.page - 1) * opts.pageSize)
    .limit(opts.pageSize)

  const [data, total] = await Promise.all([
    cursor.toArray(),
    collection().countDocuments(filter)
  ])

  return { data, total }
}

export async function findById(id: string, includeDeleted = false): Promise<User | null> {
  if (!ObjectId.isValid(id)) return null
  const filter: Filter<User> = { _id: new ObjectId(id) }
  if (!includeDeleted) filter.status = { $ne: 'deleted' }
  return collection().findOne(filter)
}

export async function findByEmail(email: string): Promise<User | null> {
  return collection().findOne({
    email: email.toLowerCase(),
    status: { $ne: 'deleted' }
  })
}

export interface CreateArgs extends Omit<UserCreate, 'password'> {
  passwordHash: string
  emailVerified?: boolean
}

export async function create(args: CreateArgs, actor?: Actor): Promise<User> {
  const now = new Date()
  const doc: User = {
    clientId: args.clientId ? new ObjectId(args.clientId) : null,
    email: args.email,
    passwordHash: args.passwordHash,
    firstName: args.firstName,
    lastName: args.lastName,
    isSystemAdmin: args.isSystemAdmin,
    roles: args.roles,
    accessMode: args.accessMode,
    tripIds: [],
    status: args.status,
    emailVerifiedAt: args.emailVerified ? now : undefined,
    createdAt: now,
    updatedAt: now
  }
  if (actor) {
    doc.createdBy = actor
    doc.updatedBy = actor
  }
  const result = await collection().insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

export async function markEmailVerified(id: ObjectId): Promise<boolean> {
  const result = await collection().updateOne(
    { _id: id, status: { $ne: 'deleted' }, emailVerifiedAt: { $exists: false } },
    { $set: { emailVerifiedAt: new Date(), updatedAt: new Date() } }
  )
  return result.matchedCount === 1
}

export async function update(
  id: string,
  input: UserUpdate,
  actor?: Actor
): Promise<User | null> {
  if (!ObjectId.isValid(id)) return null
  const $set: Partial<User> = { updatedAt: new Date() }
  if (input.email !== undefined) $set.email = input.email
  if (input.firstName !== undefined) $set.firstName = input.firstName
  if (input.lastName !== undefined) $set.lastName = input.lastName
  if (input.roles !== undefined) $set.roles = input.roles
  if (input.accessMode !== undefined) $set.accessMode = input.accessMode
  if (input.status !== undefined) $set.status = input.status
  if (actor) $set.updatedBy = actor
  return collection().findOneAndUpdate(
    { _id: new ObjectId(id), status: { $ne: 'deleted' } },
    { $set },
    { returnDocument: 'after' }
  )
}

export async function changePassword(
  id: string,
  passwordHash: string,
  actor?: Actor
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const $set: Partial<User> = { passwordHash, updatedAt: new Date() }
  if (actor) $set.updatedBy = actor
  const result = await collection().updateOne(
    { _id: new ObjectId(id), status: { $ne: 'deleted' } },
    { $set }
  )
  return result.matchedCount === 1
}

export async function setTripIds(id: string, tripIds: string[]): Promise<User | null> {
  if (!ObjectId.isValid(id)) return null
  const ids = tripIds.filter(t => ObjectId.isValid(t)).map(t => new ObjectId(t))
  return collection().findOneAndUpdate(
    { _id: new ObjectId(id), status: { $ne: 'deleted' } },
    { $set: { tripIds: ids, updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
}

export async function recordLogin(id: ObjectId): Promise<void> {
  await collection().updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } })
}

export async function softDelete(id: string, actor?: Actor): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const $set: Partial<User> = { status: 'deleted', updatedAt: new Date() }
  if (actor) $set.updatedBy = actor
  const result = await collection().updateOne(
    { _id: new ObjectId(id), status: { $ne: 'deleted' } },
    { $set }
  )
  return result.matchedCount === 1
}
