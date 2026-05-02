/**
 * Shared Validation Helpers - Harsh Makeovers
 *
 * Reusable validation rules used across all validator files.
 */

import { z } from "zod";

export const strictEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .email("Email must be a valid address (e.g. name@gmail.com)")
  .refine(
    (val) => {
      if (
        val.endsWith("@gmai.com") ||
        val.endsWith("@gmal.com") ||
        val.endsWith("@gmail.co")
      ) {
        return false;
      }
      return true;
    },
    "Did you mean @gmail.com?"
  );

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

export const safeString = (opts?: { min?: number; max?: number }) => {
  const blockedExt = /\.(php|js)\b/i;
  return z
    .string()
    .trim()
    .min(opts?.min ?? 0)
    .max(opts?.max ?? 1000)
    .transform(stripHtml)
    .refine((v) => !blockedExt.test(v), "Input cannot contain .php or .js");
};

export const strictTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format")
  .refine((t) => {
    const [h, m] = t.split(":").map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }, "Invalid time - hours must be 00-23, minutes 00-59");

export const strictDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((d) => {
    const date = new Date(d + "T00:00:00");
    return !isNaN(date.getTime()) && date.toISOString().startsWith(d);
  }, "Invalid calendar date");

/**
 * Strict Phone Number Validator
 *
 * Accepts only 10 digits.
 *
 * Valid:   "4165551234", "9876543210"
 * Invalid: "123" (too short), "1234567890123" (too long), "+14165551234" (plus not allowed)
 */
export const strictPhone = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "Phone must be exactly 10 digits");

export const phoneField = strictPhone.optional();
