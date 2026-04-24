/*
 * Shared audit primitives — used by any domain type that needs to record
 * who created / last updated a document.
 */

export interface Actor {
  userId: string
  email: string
  name: string
}

export interface AuditStamp {
  at: Date
  by: Actor
}

export interface Audited {
  createdAt: Date
  updatedAt: Date
  createdBy?: Actor
  updatedBy?: Actor
}
