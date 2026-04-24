import { ObjectId } from 'mongodb'

export type SessionPlatform = 'mobile' | 'web'
export type SessionKind = 'access' | 'refresh'

export interface Session {
  _id?: ObjectId
  userId: ObjectId
  platform: SessionPlatform
  kind: SessionKind
  expiresAt: Date
  revokedAt?: Date
  lastUsedAt?: Date
  deviceLabel?: string
  createdAt: Date
}
