import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { Actor, Audited } from './audit'

/*
 * Trip lifecycle:
 *   planned             - created, not yet open for check-in
 *   passenger_check_in  - check-in open; passengers registering
 *   trip_started        - trip underway
 *   completed           - trip finished
 *   cancelled           - trip cancelled before / during
 *   deleted             - soft-deleted; never shown unless includeDeleted
 */
export const tripStatuses = [
  'planned',
  'passenger_check_in',
  'trip_started',
  'completed',
  'cancelled',
  'deleted'
] as const
export type TripStatus = typeof tripStatuses[number]

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  planned: 'Planned',
  passenger_check_in: 'Passenger check-in',
  trip_started: 'Trip started',
  completed: 'Completed',
  cancelled: 'Cancelled',
  deleted: 'Deleted'
}

const objectIdString = z.string().regex(/^[a-f0-9]{24}$/i, 'must be a 24-char hex ObjectId')

export const tripInputSchema = z.object({
  clientId: objectIdString,
  name: z.string().trim().min(1, 'name is required'),
  status: z.enum(tripStatuses).default('planned'),
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

export const tripUpdateSchema = tripInputSchema.partial().omit({ clientId: true })

export const tripListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  clientId: objectIdString.optional(),
  status: z.enum(tripStatuses).optional(),
  name: z.string().optional()
})

export type TripInput = z.infer<typeof tripInputSchema>
export type TripUpdate = z.infer<typeof tripUpdateSchema>
export type TripListQuery = z.infer<typeof tripListQuerySchema>

export interface Trip extends Audited {
  _id?: ObjectId
  clientId: ObjectId
  name: string
  status: TripStatus
  startDate?: string
  endDate?: string
  createdBy?: Actor
  updatedBy?: Actor
}
