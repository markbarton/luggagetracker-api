import { Collection, Filter, ObjectId } from 'mongodb'
import { returnClient } from '../app/dbConnect'
import { Trip, TripInput, TripUpdate, TripStatus } from '../types/trip'
import { Actor } from '../types/audit'
import { escapeRegex } from '../utils/escapeRegex'

const DB_NAME = 'luggagetracker'
const COLLECTION_NAME = 'trips'

function collection(): Collection<Trip> {
  const client = returnClient()
  if (!client) throw new Error('MongoDB client not initialised')
  return client.db(DB_NAME).collection<Trip>(COLLECTION_NAME)
}

export async function ensureIndexes(): Promise<void> {
  await collection().createIndex({ clientId: 1 })
}

export interface ListOptions {
  page: number
  pageSize: number
  clientId?: string
  tripIds?: ObjectId[]
  status?: TripStatus
  name?: string
  includeDeleted?: boolean
}

export interface ListResult {
  data: Trip[]
  total: number
}

export async function list(opts: ListOptions): Promise<ListResult> {
  const filter: Filter<Trip> = {}
  if (opts.clientId && ObjectId.isValid(opts.clientId)) {
    filter.clientId = new ObjectId(opts.clientId)
  }
  if (opts.tripIds) {
    filter._id = { $in: opts.tripIds }
  }
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

export async function findById(id: string, includeDeleted = false): Promise<Trip | null> {
  if (!ObjectId.isValid(id)) return null
  const filter: Filter<Trip> = { _id: new ObjectId(id) }
  if (!includeDeleted) filter.status = { $ne: 'deleted' }
  return collection().findOne(filter)
}

export async function create(input: TripInput, actor?: Actor): Promise<Trip> {
  const now = new Date()
  const doc: Trip = {
    clientId: new ObjectId(input.clientId),
    name: input.name,
    status: input.status,
    startDate: input.startDate,
    endDate: input.endDate,
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

export async function update(
  id: string,
  input: TripUpdate,
  actor?: Actor
): Promise<Trip | null> {
  if (!ObjectId.isValid(id)) return null
  const $set: Partial<Trip> = { updatedAt: new Date() }
  if (input.name !== undefined) $set.name = input.name
  if (input.status !== undefined) $set.status = input.status
  if (input.startDate !== undefined) $set.startDate = input.startDate
  if (input.endDate !== undefined) $set.endDate = input.endDate
  if (actor) $set.updatedBy = actor
  return collection().findOneAndUpdate(
    { _id: new ObjectId(id), status: { $ne: 'deleted' } },
    { $set },
    { returnDocument: 'after' }
  )
}

export async function softDelete(id: string, actor?: Actor): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const $set: Partial<Trip> = { status: 'deleted', updatedAt: new Date() }
  if (actor) $set.updatedBy = actor
  const result = await collection().updateOne(
    { _id: new ObjectId(id), status: { $ne: 'deleted' } },
    { $set }
  )
  return result.matchedCount === 1
}
