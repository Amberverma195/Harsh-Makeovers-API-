/**
 * User Validators — Harsh Makeovers
 *
 * Defines rules for updating user profile (name, phone).
 * Email cannot be changed via this endpoint.
 */

import { z } from "zod";
import { safeString, strictPhone } from "./helpers";

export const updateProfileSchema = z.object({
  name: safeString({ min: 2, max: 100 }).optional(),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? null : v))
    .refine(
      (v) => v === null || v === undefined || strictPhone.safeParse(v).success,
      "Phone must be exactly 10 digits"
    ),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

