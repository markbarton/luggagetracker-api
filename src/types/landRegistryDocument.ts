import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const landRegistryDocumentInputSchema = z.object({
  titleNumber: z.string().trim().min(1, 'titleNumber is required'),
  address: z.string().trim().min(1, 'address is required'),
  tenure: z.enum(['freehold', 'leasehold']),
  pricePaid: z.number().nonnegative().optional(),
  transferDate: z.string().optional()
})

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  titleNumber: z.string().optional()
})

export type LandRegistryDocumentInput = z.infer<typeof landRegistryDocumentInputSchema>
export type ListQuery = z.infer<typeof listQuerySchema>

export interface LandRegistryDocument extends LandRegistryDocumentInput {
  _id?: ObjectId
  createdAt: Date
  updatedAt: Date
}
