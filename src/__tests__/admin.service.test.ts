import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../helpers/email", () => ({
  sendBookingConfirmedEmail: vi.fn().mockResolvedValue(undefined),
  sendBookingSubmittedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    booking: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    bookingSlot: { findFirst: vi.fn() },
    bookingHold: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    blockedSlot: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    review: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    contactInquiry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    adminNote: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../config/prisma";
import {
  addBookingNote,
  approveReview,
  blockSlot,
  cancelBookingAsAdmin,
  confirmBooking,
  deleteReview,
  getAllBookings,
  getAllInquiries,
  getBookingDetail,
  hideReview,
  markBookingCompleted,
  rejectBooking,
  rejectReview,
  searchUserByContact,
  updateBookingNote,
  updateBookingSchedule,
  updateInquiryStatus,
} from "../services/admin.service";

type MockFn = ReturnType<typeof vi.fn>;

const mockPrisma = prisma as unknown as {
  user: { findFirst: MockFn };
  booking: {
    findMany: MockFn;
    findUnique: MockFn;
    update: MockFn;
    count: MockFn;
  };
  bookingSlot: { findFirst: MockFn };
  bookingHold: { findFirst: MockFn; updateMany: MockFn };
  blockedSlot: {
    create: MockFn;
    findUnique: MockFn;
    delete: MockFn;
    findMany: MockFn;
    count: MockFn;
    findFirst: MockFn;
  };
  review: { findUnique: MockFn; update: MockFn; delete: MockFn };
  contactInquiry: { findMany: MockFn; findUnique: MockFn; update: MockFn; count: MockFn };
  adminNote: { create: MockFn; findUnique: MockFn; findFirst: MockFn; update: MockFn };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.bookingHold.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.bookingHold.findFirst.mockResolvedValue(null);
  mockPrisma.bookingSlot.findFirst.mockResolvedValue(null);
  mockPrisma.blockedSlot.findFirst.mockResolvedValue(null);
});

describe("getAllBookings", () => {
  it("returns bookings with total count", async () => {
    mockPrisma.booking.findMany.mockResolvedValue([{ id: "b1" }, { id: "b2" }]);
    mockPrisma.booking.count.mockResolvedValue(2);

    const result = await getAllBookings();

    expect(result.bookings).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("filters by status", async () => {
    mockPrisma.booking.findMany.mockResolvedValue([{ id: "b1", status: "PENDING" }]);
    mockPrisma.booking.count.mockResolvedValue(1);

    await getAllBookings({ status: "PENDING" });

    const call = mockPrisma.booking.findMany.mock.calls[0][0];
    expect(call.where.status).toBe("PENDING");
  });
});

describe("searchUserByContact", () => {
  it("returns a user profile for an exact email match", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "u1",
      name: "Jane",
      email: "jane@test.com",
      phone: "4165551234",
      role: "USER",
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      bookings: [{ id: "b1" }],
      inquiries: [{ id: "i1" }],
      reviews: [{ id: "r1" }],
    });

    const result = await searchUserByContact(" Jane@Test.com ");

    expect(result.email).toBe("jane@test.com");
    const call = mockPrisma.user.findFirst.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { email: "jane@test.com" },
      { phone: "Jane@Test.com" },
    ]);
  });
});

describe("getBookingDetail", () => {
  it("returns a booking with notes and status history", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "b1",
      adminNotes: [{ id: "n1" }],
      statusHistory: [{ id: "h1" }],
    });

    const result = await getBookingDetail("b1");

    expect(result.id).toBe("b1");
  });
});

describe("booking notes", () => {
  it("adds a note and updates the booking summary", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: "b1" });
    mockPrisma.adminNote.create.mockResolvedValue({
      id: "n1",
      noteText: "Client requested soft glam and earlier arrival.",
    });
    mockPrisma.booking.update.mockResolvedValue({ id: "b1" });

    const result = await addBookingNote(
      "b1",
      "admin1",
      "Client requested soft glam and earlier arrival."
    );

    expect(result.id).toBe("n1");
    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { adminNotesSummary: "Client requested soft glam and earlier arrival." },
      })
    );
  });

  it("updates an existing note and refreshes the booking summary", async () => {
    mockPrisma.adminNote.findUnique.mockResolvedValue({ id: "n1", bookingId: "b1" });
    mockPrisma.adminNote.update.mockResolvedValue({ id: "n1", noteText: "Updated note" });
    mockPrisma.adminNote.findFirst.mockResolvedValue({ id: "n1", noteText: "Updated note" });
    mockPrisma.booking.update.mockResolvedValue({ id: "b1" });

    const result = await updateBookingNote("b1", "n1", "Updated note");

    expect(result.id).toBe("n1");
  });
});

describe("booking status transitions", () => {
  const adminId = "admin1";

  it("confirms a pending booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: "b1", status: "PENDING" });
    mockPrisma.booking.update.mockResolvedValue({ id: "b1", status: "CONFIRMED" });

    const result = await confirmBooking("b1", adminId);
    expect(result.status).toBe("CONFIRMED");
  });

  it("rejects invalid transitions", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: "b1", status: "COMPLETED" });

    await expect(confirmBooking("b1", adminId)).rejects.toThrow(
      "Cannot transition from COMPLETED to CONFIRMED"
    );
  });

  it("cancels a confirmed booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: "b1", status: "CONFIRMED" });
    mockPrisma.booking.update.mockResolvedValue({ id: "b1", status: "CANCELLED" });

    const result = await cancelBookingAsAdmin("b1", adminId, "Client requested new date");

    expect(result.status).toBe("CANCELLED");
  });

  it("marks a confirmed booking complete", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: "b1", status: "CONFIRMED" });
    mockPrisma.booking.update.mockResolvedValue({ id: "b1", status: "COMPLETED" });

    const result = await markBookingCompleted("b1", adminId);

    expect(result.status).toBe("COMPLETED");
  });

  it("rejects bookings from invalid status updates", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ id: "b1", status: "PENDING" });
    mockPrisma.booking.update.mockResolvedValue({ id: "b1", status: "REJECTED" });

    const result = await rejectBooking("b1", adminId, "Fully booked");
    expect(result.status).toBe("REJECTED");
  });
});

describe("updateBookingSchedule", () => {
  const baseBooking = {
    id: "b1",
    status: "PENDING",
    bookingDate: new Date("2026-04-01T00:00:00.000Z"),
    startTime: new Date(Date.UTC(1970, 0, 1, 10, 0)),
    endTime: new Date(Date.UTC(1970, 0, 1, 11, 0)),
    peopleCount: 1,
    service: { name: "Bridal Glam", durationMinutes: 60 },
  };

  it("updates the schedule when there are no conflicts", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
    mockPrisma.booking.update.mockResolvedValue({ id: "b1", peopleCount: 2 });

    const result = await updateBookingSchedule("b1", "admin1", {
      bookingDate: "2026-04-03",
      startTime: "13:30",
      peopleCount: 2,
      reason: "Vendor timing changed",
    });

    expect(result.id).toBe("b1");
    const updateCall = mockPrisma.booking.update.mock.calls[0][0];
    expect(updateCall.data.peopleCount).toBe(2);
    expect(updateCall.data.adminNotes.create.noteText).toContain("Vendor timing changed");
  });

  it("rejects conflicts with another booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
    mockPrisma.bookingSlot.findFirst.mockResolvedValue({ id: "conflict" });

    await expect(
      updateBookingSchedule("b1", "admin1", {
        bookingDate: "2026-04-03",
        startTime: "13:30",
      })
    ).rejects.toThrow("Selected time slot is not available");
  });

  it("rejects conflicts with an active hold", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
    mockPrisma.bookingHold.findFirst.mockResolvedValue({ id: "hold-1" });

    await expect(
      updateBookingSchedule("b1", "admin1", {
        bookingDate: "2026-04-03",
        startTime: "13:30",
      })
    ).rejects.toThrow("Selected time slot is not available");
  });

  it("bypasses conflict checks when overrideConflicts is true", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
    mockPrisma.booking.update.mockResolvedValue({ id: "b1" });

    await updateBookingSchedule("b1", "admin1", {
      bookingDate: "2026-04-03",
      startTime: "13:30",
      overrideConflicts: true,
    });

    expect(mockPrisma.bookingSlot.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.bookingHold.findFirst).not.toHaveBeenCalled();
  });
});

describe("getAllInquiries", () => {
  it("returns inquiries with total count", async () => {
    mockPrisma.contactInquiry.findMany.mockResolvedValue([{ id: "i1" }, { id: "i2" }]);
    mockPrisma.contactInquiry.count.mockResolvedValue(2);

    const result = await getAllInquiries();

    expect(result.inquiries).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});

describe("updateInquiryStatus", () => {
  it("updates an inquiry status", async () => {
    mockPrisma.contactInquiry.findUnique.mockResolvedValue({
      id: "i1",
      status: "OPEN",
      user: { name: "Test User", email: "user@example.com" },
    });
    mockPrisma.contactInquiry.update.mockResolvedValue({
      id: "i1",
      status: "IN_PROGRESS",
      user: { name: "Test User", email: "user@example.com" },
    });

    const result = await updateInquiryStatus("i1", "IN_PROGRESS");

    expect(result.status).toBe("IN_PROGRESS");
  });
});

describe("blockSlot", () => {
  it("creates a blocked slot when there is no conflict", async () => {
    mockPrisma.blockedSlot.create.mockResolvedValue({ id: "bs1" });

    const result = await blockSlot("admin1", {
      blockedDate: "2026-04-01",
      startTime: "12:00",
      endTime: "13:00",
      reason: "Lunch",
    });

    expect(result.id).toBe("bs1");
    expect(mockPrisma.blockedSlot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "Lunch",
          createdById: "admin1",
        }),
      })
    );
  });

  it("rejects overlapping active holds", async () => {
    mockPrisma.bookingHold.findFirst.mockResolvedValue({ id: "hold-1" });

    await expect(
      blockSlot("admin1", {
        blockedDate: "2026-04-01",
        startTime: "12:00",
        endTime: "13:00",
      })
    ).rejects.toThrow("Selected time slot is not available");
  });
});

describe("review moderation", () => {
  const adminId = "admin1";

  it("approves a pending review", async () => {
    mockPrisma.review.findUnique.mockResolvedValue({ id: "r1", status: "PENDING" });
    mockPrisma.review.update.mockResolvedValue({ id: "r1", status: "APPROVED" });

    const result = await approveReview("r1", adminId);
    expect(result.status).toBe("APPROVED");
  });

  it("hides an approved review", async () => {
    mockPrisma.review.findUnique.mockResolvedValue({ id: "r1", status: "APPROVED" });
    mockPrisma.review.update.mockResolvedValue({ id: "r1", status: "REJECTED" });

    const result = await hideReview("r1", adminId);
    expect(result.status).toBe("REJECTED");
  });

  it("keeps rejectReview backward-compatible", async () => {
    mockPrisma.review.findUnique.mockResolvedValue({ id: "r1", status: "PENDING" });
    mockPrisma.review.update.mockResolvedValue({ id: "r1", status: "REJECTED" });

    const result = await rejectReview("r1", adminId);
    expect(result.status).toBe("REJECTED");
  });

  it("deletes an existing review", async () => {
    mockPrisma.review.findUnique.mockResolvedValue({ id: "r1", status: "APPROVED" });
    mockPrisma.review.delete.mockResolvedValue({ id: "r1" });

    const result = await deleteReview("r1");
    expect(result.id).toBe("r1");
  });
});
