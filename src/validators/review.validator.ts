/**
 * Review Validator — Harsh Makeovers
 *
 * Defines the rules for submitting a review after a completed booking.
 *
 * The service layer (review.service.ts) handles additional checks like:
 *   - Does this booking exist?
 *   - Is it actually completed?
 *   - Has the user already reviewed it?
 *
 * This validator only checks the DATA FORMAT is correct.
 */

import { z } from "zod";
import { safeString } from "./helpers";

/**
 * Create Review Schema
 *
 *   - bookingId: which booking this review is for (must be a valid UUID)
 *   - rating: 1 to 5 stars (whole numbers only)
 *   - reviewText: optional written review (max 1000 chars, HTML stripped)
 */
export const createReviewSchema = z.object({
  bookingId: z
    .string()
    .uuid("Invalid booking ID"),

  rating: z
    .number()
    .int()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5"),

  reviewText: safeString({ max: 1000 }).optional(),
});

// Auto-generated TypeScript type from the schema
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
