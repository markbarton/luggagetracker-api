import { Collection, Filter, ObjectId } from 'mongodb'
import { returnClient } from '../app/dbConnect'
import {
  LandRegistryDocument,
  LandRegistryDocumentInput
} from '../types/landRegistryDocument'

const DB_NAME = 'land-registry'
const COLLECTION_NAME = 'landregistrydocuments'

function collection(): Collection<LandRegistryDocument> {
  const client = returnClient()
  if (!client) {
    throw new Error('MongoDB client not initialised')
  }
  return client.db(DB_NAME).collection<LandRegistryDocument>(COLLECTION_NAME)
}

export interface ListOptions {
  page: number
  pageSize: number
  titleNumber?: string
}

export interface ListResult {
  data: LandRegistryDocument[]
  total: number
}

export async function list({ page, pageSize, titleNumber }: ListOptions): Promise<ListResult> {
  const filter: Filter<LandRegistryDocument> = {}
  if (titleNumber) {
    filter.titleNumber = { $regex: `^${escapeRegex(titleNumber)}`, $options: 'i' }
  }

  const cursor = collection()
    .find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)

  const [data, total] = await Promise.all([
    cursor.toArray(),
    collection().countDocuments(filter)
  ])

  return { data, total }
}

export async function findById(id: string): Promise<LandRegistryDocument | null> {
  if (!ObjectId.isValid(id)) return null
  return collection().findOne({ _id: new ObjectId(id) })
}

export async function create(input: LandRegistryDocumentInput): Promise<LandRegistryDocument> {
  const now = new Date()
  const doc: LandRegistryDocument = { ...input, createdAt: now, updatedAt: now }
  const result = await collection().insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

export async function update(
  id: string,
  input: LandRegistryDocumentInput
): Promise<LandRegistryDocument | null> {
  if (!ObjectId.isValid(id)) return null
  const result = await collection().findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  return result
}

export async function remove(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const result = await collection().deleteOne({ _id: new ObjectId(id) })
  return result.deletedCount === 1
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
