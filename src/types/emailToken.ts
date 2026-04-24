import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const emailTokenPurposes = ['passwordReset', 'emailVerify', 'magicLink'] as const
export type EmailTokenPurpose = typeof emailTokenPurposes[number]

export interface EmailToken {
  _id?: ObjectId
  userId: ObjectId
  purpose: EmailTokenPurpose
  tokenHash: string
  expiresAt: Date
  usedAt?: Date
  createdAt: Date
}

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email('invalid email')
})

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(128)
})

export const emailVerifyConfirmSchema = z.object({
  token: z.string().min(10)
})

export const magicLinkRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email('invalid email')
})

export const magicLinkConfirmSchema = z.object({
  token: z.string().min(10)
})

export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>
export type EmailVerifyConfirm = z.infer<typeof emailVerifyConfirmSchema>
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>
export type MagicLinkConfirm = z.infer<typeof magicLinkConfirmSchema>
