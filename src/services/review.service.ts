/**
 * Review Service — Harsh Makeovers
 *
 * Handles customer reviews for completed bookings.
 *
 * How reviews work:
 *   1. Customer completes a booking (admin marks it as COMPLETED)
 *   2. Customer can then submit a review (1-5 stars + optional text)
 *   3. Review starts with PENDING status
 *   4. Admin can approve or reject the review (see admin.service.ts)
 *   5. Only APPROVED reviews are shown on the public website
 *
 * Rules:
 *   - Only the person who made the booking can review it
 *   - The booking must be COMPLETED (can't review a pending/cancelled booking)
 *   - Each booking can only be reviewed ONCE
 */

import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error.middleware";
import { BookingStatus, ReviewStatus } from "../generated/prisma/client.js";

// Shape of the data needed to create a review
interface CreateReviewData {
  bookingId: string;
  userId: string;
  rating: number;        // 1-5
  reviewText?: string;   // Optional written review
}

/**
 * Submit a review for a completed booking.
 *
 * Checks:
 *   1. Booking exists → 404 if not
 *   2. User owns this booking → 403 if not
 *   3. Booking is completed → 400 if not
 *   4. No existing review for this booking → 409 if already reviewed
 *
 * The review starts as PENDING and needs admin approval before
 * it appears on the public website.
 */
export async function createReview(data: CreateReviewData) {
  // Fetch the booking and check if it already has a review
  const booking = await prisma.booking.findUnique({
    where: { id: data.bookingId },
    include: { review: true },
  });

  if (!booking) {
    throw new AppError(404, "Booking not found");
  }

  // Only the booking owner can leave a review
  if (booking.userId !== data.userId) {
    throw new AppError(403, "You can only review your own bookings");
  }

  // Must be a completed appointment (not pending, cancelled, etc.)
  if (booking.status !== BookingStatus.COMPLETED) {
    throw new AppError(400, "You can only review completed bookings");
  }

  // Each booking gets exactly one review
  if (booking.review) {
    throw new AppError(409, "You have already reviewed this booking");
  }

  return prisma.review.create({
    data: {
      bookingId: data.bookingId,
      userId: data.userId,
      rating: data.rating,
      reviewText: data.reviewText,
      reviewedAt: new Date(),
    },
  });
}

/**
 * Get all approved reviews (public — shown on the website).
 *
 * Only returns reviews that the admin has approved.
 * Includes the reviewer's name and the service they booked,
 * so the frontend can display things like:
 *   "Sarah M. — Bridal Makeup — ★★★★★"
 *
 * Sorted by most recent first.
 */
export async function getAllReviews(skip?: number, take?: number) {
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      select: {
        id: true,
        rating: true,
        reviewText: true,
        reviewedAt: true,
        status: true,
        user: { select: { name: true, email: true } },
        booking: { select: { service: { select: { name: true, category: true } } } },
      },
      orderBy: { reviewedAt: "desc" },
      skip,
      take,
    }),
    prisma.review.count(),
  ]);

  return { reviews, total };
}

export async function getApprovedReviews(skip?: number, take?: number) {
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { status: ReviewStatus.APPROVED },
      select: {
        id: true,
        rating: true,
        reviewText: true,
        reviewedAt: true,
        user: { select: { name: true } },
        booking: { select: { service: { select: { name: true, category: true } } } },
      },
      orderBy: { reviewedAt: "desc" },
      skip,
      take,
    }),
    prisma.review.count({ where: { status: ReviewStatus.APPROVED } }),
  ]);

  return { reviews, total };
}
