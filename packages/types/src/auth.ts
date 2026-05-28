import { z } from 'zod';

// ─── Login ───────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Change Password ─────────────────────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .regex(/[a-zA-Z]/, 'Must contain at least one letter')
    .regex(/\d/, 'Must contain at least one digit')
    .regex(/[^a-zA-Z0-9]/, 'Must contain at least one symbol'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ─── Create User ─────────────────────────────────────────────────

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(10)
    .regex(/[a-zA-Z]/, 'Must contain at least one letter')
    .regex(/\d/, 'Must contain at least one digit')
    .regex(/[^a-zA-Z0-9]/, 'Must contain at least one symbol'),
  role: z.enum(['ADMIN', 'STAFF']),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ─── Update User ─────────────────────────────────────────────────

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
