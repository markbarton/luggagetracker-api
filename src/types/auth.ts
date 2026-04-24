import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('invalid email'),
  password: z.string().min(1, 'password is required'),
  platform: z.enum(['mobile', 'web']),
  deviceLabel: z.string().trim().max(100).optional()
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(10)
})

export const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional()
})

export type LoginInput = z.infer<typeof loginSchema>
export type RefreshInput = z.infer<typeof refreshSchema>
export type LogoutInput = z.infer<typeof logoutSchema>
