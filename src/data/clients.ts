import { Collection, Filter, ObjectId } from 'mongodb'
import { returnClient } from '../app/dbConnect'
import {
  Client,
  ClientInput,
  ClientUpdate,
  ClientStatus
} from '../types/client'
import { Actor } from '../types/audit'
import { escapeRegex } from '../utils/escapeRegex'

const DB_NAME = 'luggagetracker'
const COLLECTION_NAME = 'clients'

function collection(): Collection<Client> {
  const client = returnClient()
  if (!client) throw new Error('MongoDB client not initialised')
  return client.db(DB_NAME).collection<Client>(COLLECTION_NAME)
}

export interface ListOptions {
  page: number
  pageSize: number
  name?: string
  status?: ClientStatus
  includeDeleted?: boolean
}

export interface ListResult {
  data: Client[]
  total: number
}

export async function list(opts: ListOptions): Promise<ListResult> {
  const filter: Filter<Client> = {}
  if (opts.name) {
    filter.name = { $regex: `^${escapeRegex(opts.name)}`, $options: 'i' }
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

export async function findById(id: string, includeDeleted = false): Promise<Client | null> {
  if (!ObjectId.isValid(id)) return null
  const filter: Filter<Client> = { _id: new ObjectId(id) }
  if (!includeDeleted) filter.status = { $ne: 'deleted' }
  return collection().findOne(filter)
}

export async function create(input: ClientInput, actor?: Actor): Promise<Client> {
  const now = new Date()
  const doc: Client = {
    name: input.name,
    features: input.features,
    status: input.status,
    createdAt: now,
    updatedAt: now
  }
  if (input.address !== undefined) doc.address = input.address
  if (input.contactEmail !== undefined) doc.contactEmail = input.contactEmail
  if (input.signedUpAt !== undefined) doc.signedUpAt = input.signedUpAt
  if (actor) {
    doc.createdBy = actor
    doc.updatedBy = actor
  }
  const result = await collection().insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

export async function update(
  id: string,
  input: ClientUpdate,
  actor?: Actor
): Promise<Client | null> {
  if (!ObjectId.isValid(id)) return null
  const $set: Partial<Client> = { updatedAt: new Date() }
  if (input.name !== undefined) $set.name = input.name
  if (input.features !== undefined) $set.features = input.features
  if (input.status !== undefined) $set.status = input.status
  if (input.address !== undefined) $set.address = input.address
  if (input.contactEmail !== undefined) $set.contactEmail = input.contactEmail
  if (input.signedUpAt !== undefined) $set.signedUpAt = input.signedUpAt
  if (actor) $set.updatedBy = actor
  return collection().findOneAndUpdate(
    { _id: new ObjectId(id), status: { $ne: 'deleted' } },
    { $set },
    { returnDocument: 'after' }
  )
}

export async function softDelete(id: string, actor?: Actor): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const $set: Partial<Client> = { status: 'deleted', updatedAt: new Date() }
  if (actor) $set.updatedBy = actor
  const result = await collection().updateOne(
    { _id: new ObjectId(id), status: { $ne: 'deleted' } },
    { $set }
  )
  return result.matchedCount === 1
}
