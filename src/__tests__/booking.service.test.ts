import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../helpers/email", () => ({
  sendBookingSubmittedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config/prisma", () => {
  const tx = {
    service: { findUnique: vi.fn() },
    bookingSlot: { findMany: vi.fn(), findFirst: vi.fn() },
    blockedSlot: { findMany: vi.fn(), findFirst: vi.fn() },
    booking: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    bookingHold: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  return {
    prisma: {
      ...tx,
      $transaction: vi.fn(async (cb) => cb(tx)),
    },
  };
});

import { prisma } from "../config/prisma";
import {
  cancelBooking,
  checkAvailability,
  createBooking,
  createBookingHold,
  getActiveBookingHold,
  getBookingById,
  getUserBookings,
  releaseBookingHold,
} from "../services/booking.service";

type MockFn = ReturnType<typeof vi.fn>;

const mockPrisma = prisma as unknown as {
  $transaction: MockFn;
  service: { findUnique: MockFn };
  bookingSlot: { findMany: MockFn; findFirst: MockFn };
  blockedSlot: { findMany: MockFn; findFirst: MockFn };
  booking: {
    create: MockFn;
    findUnique: MockFn;
    update: MockFn;
    findMany: MockFn;
  };
  bookingHold: {
    create: MockFn;
    findFirst: MockFn;
    findMany: MockFn;
    findUnique: MockFn;
    update: MockFn;
    updateMany: MockFn;
  };
};

const baseBookingInput = {
  serviceId: "s1",
  fullName: "Jane",
  email: "jane@test.com",
  phone: "4165551234",
  address: "123 Main Street, Toronto, ON",
  peopleCount: 1,
  bookingDate: "2026-04-10",
  startTime: "10:00",
  holdId: "hold-1",
  userId: "u1",
};

const activeService = {
  id: "s1",
  isActive: true,
  durationMinutes: 60,
};

function makeTime(hours: number, minutes = 0) {
  return new Date(Date.UTC(1970, 0, 1, hours, minutes));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.bookingHold.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.bookingHold.findMany.mockResolvedValue([]);
  mockPrisma.bookingHold.findFirst.mockResolvedValue(null);
  mockPrisma.bookingSlot.findFirst.mockResolvedValue(null);
  mockPrisma.blockedSlot.findFirst.mockResolvedValue(null);
});

describe("checkAvailability", () => {
  it("returns booked, blocked, and held slots for an active service", async () => {
    mockPrisma.service.findUnique.mockResolvedValue(activeService);
    mockPrisma.bookingSlot.findMany.mockResolvedValue([
      {
        slotStartTime: makeTime(10),
        slotEndTime: makeTime(11),
        slotType: "SERVICE",
      },
    ]);
    mockPrisma.blockedSlot.findMany.mockResolvedValue([
      {
        startTime: makeTime(12),
        endTime: makeTime(13),
        reason: "Personal appointment",
      },
    ]);
    mockPrisma.bookingHold.findMany.mockResolvedValue([
      {
        id: "hold-1",
        startTime: makeTime(14),
        endTime: makeTime(15),
        expiresAt: new Date("2026-04-01T12:02:00.000Z"),
      },
    ]);

    const result = await checkAvailability("s1", "2026-04-10");

    expect(result.serviceDurationMinutes).toBe(60);
    expect(result.bookedSlots).toHaveLength(1);
    expect(result.blockedSlots).toEqual([
      {
        start: makeTime(12),
        end: makeTime(13),
      },
    ]);
    expect(result.heldSlots).toEqual([
      {
        id: "hold-1",
        start: makeTime(14),
        end: makeTime(15),
        expiresAt: new Date("2026-04-01T12:02:00.000Z"),
      },
    ]);
  });

  it("throws 404 for inactive services", async () => {
    mockPrisma.service.findUnique.mockResolvedValue({ id: "s1", isActive: false });

    await expect(checkAvailability("s1", "2026-04-10")).rejects.toThrow(
      "Service not found or inactive"
    );
  });
});

describe("createBookingHold", () => {
  const baseHoldInput = {
    serviceId: "s1",
    bookingDate: "2026-04-10",
    startTime: "10:00",
    peopleCount: 2,
  };

  it("creates a new active hold when the slot is free", async () => {
    mockPrisma.service.findUnique.mockResolvedValue(activeService);
    mockPrisma.bookingHold.create.mockResolvedValue({
      id: "hold-1",
      serviceId: "s1",
      peopleCount: 2,
      status: "ACTIVE",
    });

    const result = await createBookingHold(baseHoldInput, "u1");

    expect(result.id).toBe("hold-1");
    const createCall = mockPrisma.bookingHold.create.mock.calls[0][0];
    const expiresAt = createCall.data.expiresAt as Date;
    expect(createCall.data.userId).toBe("u1");
    expect(createCall.data.peopleCount).toBe(2);
    expect(createCall.data.status).toBe("ACTIVE");
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns the caller's existing matching hold without renewing it", async () => {
    const existingHold = {
      id: "hold-1",
      userId: "u1",
      serviceId: "s1",
      bookingDate: new Date("2026-04-10T00:00:00.000Z"),
      startTime: makeTime(10),
      endTime: makeTime(12),
      peopleCount: 2,
      expiresAt: new Date("2026-04-01T12:02:00.000Z"),
      status: "ACTIVE",
      createdAt: new Date("2026-04-01T12:00:00.000Z"),
    };

    mockPrisma.service.findUnique.mockResolvedValue(activeService);
    mockPrisma.bookingHold.findMany.mockResolvedValue([
      existingHold,
      { ...existingHold, id: "hold-2", startTime: makeTime(14), endTime: makeTime(16) },
    ]);

    const result = await createBookingHold(baseHoldInput, "u1");

    expect(result.id).toBe("hold-1");
    expect(mockPrisma.bookingHold.create).not.toHaveBeenCalled();
    expect(mockPrisma.bookingHold.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["hold-2"] } },
        data: { status: "RELEASED" },
      })
    );
  });

  it("rejects holds that overlap another active hold", async () => {
    mockPrisma.service.findUnique.mockResolvedValue(activeService);
    mockPrisma.bookingHold.findFirst.mockResolvedValue({ id: "other-hold" });

    await expect(createBookingHold(baseHoldInput, "u1")).rejects.toThrow(
      "Selected time slot is not available"
    );
  });

  it("rejects groups of 5 or more", async () => {
    await expect(
      createBookingHold({ ...baseHoldInput, peopleCount: 5 }, "u1")
    ).rejects.toThrow("Groups of 5 or more must use the inquiry flow");
  });
});

describe("getActiveBookingHold", () => {
  it("returns the caller's active hold after expiring stale rows", async () => {
    mockPrisma.bookingHold.findFirst.mockResolvedValue({ id: "hold-1", userId: "u1" });

    const result = await getActiveBookingHold("u1");

    expect(result).toEqual({ id: "hold-1", userId: "u1" });
    expect(mockPrisma.bookingHold.updateMany).toHaveBeenCalled();
  });
});

describe("releaseBookingHold", () => {
  it("releases the caller's active hold idempotently", async () => {
    await releaseBookingHold("u1", "hold-1");

    expect(mockPrisma.bookingHold.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        id: "hold-1",
        userId: "u1",
        status: "ACTIVE",
      }),
      data: { status: "RELEASED" },
    });
  });
});

describe("createBooking", () => {
  it("creates a booking and converts the hold when the slot is still free", async () => {
    mockPrisma.service.findUnique.mockResolvedValue(activeService);
    mockPrisma.bookingHold.findUnique.mockResolvedValue({
      id: "hold-1",
      userId: "u1",
      serviceId: "s1",
      bookingDate: new Date("2026-04-10T00:00:00.000Z"),
      startTime: makeTime(10),
      endTime: makeTime(11),
      peopleCount: 1,
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
      status: "ACTIVE",
    });
    mockPrisma.booking.create.mockResolvedValue({ id: "b1", status: "PENDING" });
    mockPrisma.bookingHold.update.mockResolvedValue({ id: "hold-1", status: "CONVERTED" });

    const result = await createBooking(baseBookingInput);

    expect(result.id).toBe("b1");
    expect(mockPrisma.booking.create).toHaveBeenCalled();
    expect(mockPrisma.bookingHold.update).toHaveBeenCalledWith({
      where: { id: "hold-1" },
      data: {
        status: "CONVERTED",
        bookingId: "b1",
      },
    });
  });

  it("rejects expired holds", async () => {
    mockPrisma.service.findUnique.mockResolvedValue(activeService);
    mockPrisma.bookingHold.findUnique.mockResolvedValue({
      id: "hold-1",
      userId: "u1",
      serviceId: "s1",
      bookingDate: new Date("2026-04-10T00:00:00.000Z"),
      startTime: makeTime(10),
      endTime: makeTime(11),
      peopleCount: 1,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      status: "ACTIVE",
    });

    await expect(createBooking(baseBookingInput)).rejects.toThrow(
      "Your selected slot hold has expired. Please choose a new time."
    );

    expect(mockPrisma.bookingHold.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "hold-1", status: "ACTIVE" },
        data: { status: "EXPIRED" },
      })
    );
  });

  it("rejects holds owned by another user", async () => {
    mockPrisma.service.findUnique.mockResolvedValue(activeService);
    mockPrisma.bookingHold.findUnique.mockResolvedValue({
      id: "hold-1",
      userId: "u2",
      serviceId: "s1",
      bookingDate: new Date("2026-04-10T00:00:00.000Z"),
      startTime: makeTime(10),
      endTime: makeTime(11),
      peopleCount: 1,
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
      status: "ACTIVE",
    });

    await expect(createBooking(baseBookingInput)).rejects.toThrow(
      "You can only use your own slot hold"
    );
  });

  it("rejects mismatched hold details", async () => {
    mockPrisma.service.findUnique.mockResolvedValue(activeService);
    mockPrisma.bookingHold.findUnique.mockResolvedValue({
      id: "hold-1",
      userId: "u1",
      serviceId: "s1",
      bookingDate: new Date("2026-04-10T00:00:00.000Z"),
      startTime: makeTime(12),
      endTime: makeTime(13),
      peopleCount: 1,
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
      status: "ACTIVE",
    });

    await expect(createBooking(baseBookingInput)).rejects.toThrow(
      "Your selected slot hold no longer matches this booking. Please choose the slot again."
    );
  });

  it("releases the hold when a final conflict appears before insert", async () => {
    mockPrisma.service.findUnique.mockResolvedValue(activeService);
    mockPrisma.bookingHold.findUnique.mockResolvedValue({
      id: "hold-1",
      userId: "u1",
      serviceId: "s1",
      bookingDate: new Date("2026-04-10T00:00:00.000Z"),
      startTime: makeTime(10),
      endTime: makeTime(11),
      peopleCount: 1,
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
      status: "ACTIVE",
    });
    mockPrisma.bookingSlot.findFirst.mockResolvedValue({ id: "existing-booking" });

    await expect(createBooking(baseBookingInput)).rejects.toThrow(
      "Selected time slot is no longer available"
    );

    expect(mockPrisma.bookingHold.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "hold-1", status: "ACTIVE" },
        data: { status: "RELEASED" },
      })
    );
  });
});

describe("cancelBooking", () => {
  it("cancels a pending booking by owner", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "b1",
      userId: "u1",
      status: "PENDING",
    });
    mockPrisma.booking.update.mockResolvedValue({ id: "b1", status: "CANCELLED" });

    const result = await cancelBooking("b1", "u1", "Changed plans");
    expect(result.status).toBe("CANCELLED");
  });

  it("throws 404 for nonexistent bookings", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    await expect(cancelBooking("missing", "u1")).rejects.toThrow("Booking not found");
  });
});

describe("getBookingById", () => {
  it("returns the booking for its owner", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: "b1",
      userId: "u1",
      service: { name: "Bridal" },
    });

    const result = await getBookingById("b1", "u1");

    expect(result.id).toBe("b1");
  });
});

describe("getUserBookings", () => {
  it("returns a user's bookings newest first", async () => {
    mockPrisma.booking.findMany.mockResolvedValue([{ id: "b1" }, { id: "b2" }]);

    const result = await getUserBookings("u1");

    expect(result).toHaveLength(2);
    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        orderBy: { bookingDate: "desc" },
      })
    );
  });
});
