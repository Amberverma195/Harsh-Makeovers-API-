/**
 * Auth Validators - Harsh Makeovers
 *
 * Defines the rules for what data is required when someone:
 *   1. Registers a new account (registerSchema)
 *   2. Logs in to an existing account (loginSchema)
 *
 * These schemas are used by the validate middleware (validate.middleware.ts)
 * to automatically check incoming request data before it reaches the controller.
 *
 * If any field is invalid, the user gets a clear error message like:
 *   { "error": "Validation failed", "details": [{ "field": "email", "message": "..." }] }
 */

import { z } from "zod";
import { strictEmail, safeString, strictPhone } from "./helpers";

/**
 * Registration Schema
 *
 * Required: name, email, phone, password
 *
 * Password must have:
 *   - At least 8 characters
 *   - At least one uppercase letter (A-Z)
 *   - At least one lowercase letter (a-z)
 *   - At least one number (0-9)
 *   - At least one special character (!@#$%^&* etc.)
 */
export const registerSchema = z.object({
  name: safeString({ min: 2, max: 100 }),
  email: strictEmail,
  phone: strictPhone,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

/**
 * Login Schema
 *
 * Just email and password - no strict password rules here
 * because we're not creating a password, just checking an existing one.
 */
export const loginSchema = z.object({
  email: strictEmail,
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
