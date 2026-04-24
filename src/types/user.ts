import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { Actor, Audited } from './audit'

export const userRoles = ['clientAdmin', 'user'] as const
export type UserRole = typeof userRoles[number]

export const userStatuses = ['active', 'disabled', 'deleted'] as const
export type UserStatus = typeof userStatuses[number]

export const accessModes = ['mobile', 'web', 'both'] as const
export type AccessMode = typeof accessModes[number]

const objectIdString = z.string().regex(/^[a-f0-9]{24}$/i, 'must be a 24-char hex ObjectId')

export const userCreateSchema = z.object({
  clientId: objectIdString.nullable(),
  email: z.string().trim().toLowerCase().email('invalid email'),
  password: z.string().min(8, 'password must be at least 8 chars').max(128),
  firstName: z.string().trim().min(1, 'firstName is required'),
  lastName: z.string().trim().min(1, 'lastName is required'),
  isSystemAdmin: z.boolean().default(false),
  roles: z.array(z.enum(userRoles)).default([]),
  accessMode: z.enum(accessModes).default('web'),
  status: z.enum(userStatuses).default('active')
})

export const userUpdateSchema = z.object({
  email: z.string().trim().toLowerCase().email('invalid email').optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  roles: z.array(z.enum(userRoles)).optional(),
  accessMode: z.enum(accessModes).optional(),
  status: z.enum(userStatuses).optional()
})

export const userPasswordChangeSchema = z.object({
  password: z.string().min(8).max(128)
})

export const userTripsUpdateSchema = z.object({
  tripIds: z.array(objectIdString)
})

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  clientId: objectIdString.optional(),
  email: z.string().optional(),
  status: z.enum(userStatuses).optional()
})

export type UserCreate = z.infer<typeof userCreateSchema>
export type UserUpdate = z.infer<typeof userUpdateSchema>
export type UserPasswordChange = z.infer<typeof userPasswordChangeSchema>
export type UserTripsUpdate = z.infer<typeof userTripsUpdateSchema>
export type UserListQuery = z.infer<typeof userListQuerySchema>

export interface User extends Audited {
  _id?: ObjectId
  clientId: ObjectId | null
  email: string
  passwordHash: string
  firstName: string
  lastName: string
  isSystemAdmin: boolean
  roles: UserRole[]
  accessMode: AccessMode
  tripIds: ObjectId[]
  status: UserStatus
  emailVerifiedAt?: Date
  lastLoginAt?: Date
  createdBy?: Actor
  updatedBy?: Actor
}

export interface PublicUser {
  _id: ObjectId
  clientId: ObjectId | null
  email: string
  firstName: string
  lastName: string
  isSystemAdmin: boolean
  roles: UserRole[]
  accessMode: AccessMode
  tripIds: ObjectId[]
  status: UserStatus
  emailVerifiedAt?: Date
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date
  createdBy?: Actor
  updatedBy?: Actor
}

export function toPublicUser(u: User): PublicUser {
  const { passwordHash, ...rest } = u
  return rest as PublicUser
}
