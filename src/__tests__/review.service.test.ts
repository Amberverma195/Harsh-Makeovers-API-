import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  prisma: {
    booking: { findUnique: vi.fn() },
    review: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from "../config/prisma";
import { createReview, getApprovedReviews } from "../services/review.service";

const mockPrisma = prisma as unknown as {
  booking: { findUnique: ReturnType<typeof vi.fn> };
  review: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createReview", () => {
  const input = {
    bookingId: "b1",
    userId: "u1",
    rating: 5,
    reviewText: "Great experience!",
  };

  it("creates review for a completed booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "b1",
      userId: "u1",
      status: "COMPLETED",
      review: null,
    });
    mockPrisma.review.create.mockResolvedValue({
      id: "r1",
      rating: 5,
      status: "PENDING",
    });

    const result = await createReview(input);

    expect(result.status).toBe("PENDING");
    expect(result.rating).toBe(5);
  });

  it("throws 404 when booking does not exist", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    await expect(createReview(input)).rejects.toThrow("Booking not found");
  });

  it("throws 403 when user does not own the booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "b1",
      userId: "other_user",
      status: "COMPLETED",
      review: null,
    });

    await expect(createReview(input)).rejects.toThrow(
      "You can only review your own bookings"
    );
  });

  it("throws 400 for a pending booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "b1",
      userId: "u1",
      status: "PENDING",
      review: null,
    });

    await expect(createReview(input)).rejects.toThrow(
      "You can only review completed bookings"
    );
  });

  it("throws 400 for a confirmed booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "b1",
      userId: "u1",
      status: "CONFIRMED",
      review: null,
    });

    await expect(createReview(input)).rejects.toThrow(
      "You can only review completed bookings"
    );
  });

  it("throws 400 for a cancelled booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "b1",
      userId: "u1",
      status: "CANCELLED",
      review: null,
    });

    await expect(createReview(input)).rejects.toThrow(
      "You can only review completed bookings"
    );
  });

  it("throws 409 when booking already has a review", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "b1",
      userId: "u1",
      status: "COMPLETED",
      review: { id: "existing_review" },
    });

    await expect(createReview(input)).rejects.toThrow(
      "You have already reviewed this booking"
    );
  });
});

describe("getApprovedReviews", () => {
  it("returns only approved reviews with total", async () => {
    mockPrisma.review.findMany.mockResolvedValue([
      { id: "r1", rating: 5, status: "APPROVED" },
      { id: "r2", rating: 4, status: "APPROVED" },
    ]);
    mockPrisma.review.count.mockResolvedValue(2);

    const result = await getApprovedReviews();

    expect(result.reviews).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(mockPrisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "APPROVED" } })
    );
  });
});
