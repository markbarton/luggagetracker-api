import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { Actor, Audited } from './audit'

export const clientStatuses = ['active', 'disabled', 'deleted'] as const
export type ClientStatus = typeof clientStatuses[number]

export const clientFeaturesSchema = z.object({
  nfc: z.boolean().default(false),
  rfid: z.boolean().default(false),
  barcode: z.boolean().default(false),
  documentRepository: z.boolean().default(false)
})

export const clientInputSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  features: clientFeaturesSchema.default({
    nfc: false,
    rfid: false,
    barcode: false,
    documentRepository: false
  }),
  status: z.enum(clientStatuses).default('active'),
  address: z.string().trim().max(500).optional(),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('invalid email')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // Accepts ISO date string (YYYY-MM-DD or full ISO) and coerces to Date.
  signedUpAt: z
    .union([z.string(), z.date()])
    .transform((v) => (v instanceof Date ? v : new Date(v)))
    .refine((d) => !Number.isNaN(d.getTime()), 'signedUpAt must be a valid date')
    .optional()
})

export const clientUpdateSchema = clientInputSchema.partial()

export const clientListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  name: z.string().optional(),
  status: z.enum(clientStatuses).optional()
})

export type ClientFeatures = z.infer<typeof clientFeaturesSchema>
export type ClientInput = z.infer<typeof clientInputSchema>
export type ClientUpdate = z.infer<typeof clientUpdateSchema>
export type ClientListQuery = z.infer<typeof clientListQuerySchema>

export interface Client extends Audited {
  _id?: ObjectId
  name: string
  features: ClientFeatures
  status: ClientStatus
  address?: string
  contactEmail?: string
  signedUpAt?: Date
  createdBy?: Actor
  updatedBy?: Actor
}
