import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error.middleware";
import {
  BookingHoldStatus,
  BookingStatus,
  Prisma,
  SlotType,
} from "../generated/prisma/client.js";
import { sendBookingSubmittedEmail } from "../helpers/email";

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];
const HOLD_TTL_MS = 2 * 60 * 1000;
const LARGE_GROUP_THRESHOLD = 5;

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

interface CreateBookingData {
  serviceId: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  peopleCount: number;
  bookingDate: string;
  startTime: string;
  holdId: string;
  userId?: string;
}

interface CreateBookingHoldData {
  serviceId: string;
  bookingDate: string;
  startTime: string;
  peopleCount: number;
}

interface BookingWindow {
  bookingDate: Date;
  startTime: Date;
  endTime: Date;
  bufferEndTime: Date;
  totalMinutes: number;
}

interface SlotConflictOptions {
  excludeHoldId?: string;
  now?: Date;
}

export async function checkAvailability(serviceId: string, date: string) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.isActive) {
    throw new AppError(404, "Service not found or inactive");
  }

  const queryDate = new Date(date);
  const now = new Date();

  await expireStaleBookingHolds(prisma, now);

  const [bookedSlots, blockedSlots, heldSlots] = await Promise.all([
    prisma.bookingSlot.findMany({
      where: {
        slotDate: queryDate,
        slotType: SlotType.SERVICE,
        booking: {
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
      },
      select: { slotStartTime: true, slotEndTime: true, slotType: true },
      orderBy: { slotStartTime: "asc" },
    }),
    prisma.blockedSlot.findMany({
      where: { blockedDate: queryDate },
      select: { startTime: true, endTime: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.bookingHold.findMany({
      where: {
        bookingDate: queryDate,
        status: BookingHoldStatus.ACTIVE,
        expiresAt: { gt: now },
      },
      select: { id: true, startTime: true, endTime: true, expiresAt: true },
      orderBy: { startTime: "asc" },
    }),
  ]);

  return {
    date,
    serviceDurationMinutes: service.durationMinutes,
    bookedSlots: bookedSlots.map((slot) => ({
      start: slot.slotStartTime,
      end: slot.slotEndTime,
      type: slot.slotType,
    })),
    blockedSlots: blockedSlots.map((slot) => ({
      start: slot.startTime,
      end: slot.endTime,
    })),
    heldSlots: heldSlots.map((slot) => ({
      id: slot.id,
      start: slot.startTime,
      end: slot.endTime,
      expiresAt: slot.expiresAt,
    })),
  };
}

export async function createBookingHold(data: CreateBookingHoldData, userId: string) {
  if (!userId) {
    throw new AppError(401, "Please sign in to hold a time slot");
  }

  if (data.peopleCount >= LARGE_GROUP_THRESHOLD) {
    throw new AppError(400, "Groups of 5 or more must use the inquiry flow");
  }

  const service = await prisma.service.findUnique({
    where: { id: data.serviceId },
  });

  if (!service || !service.isActive) {
    throw new AppError(404, "Service not found or inactive");
  }

  const now = new Date();
  const schedule = buildBookingWindow(
    data.bookingDate,
    data.startTime,
    service.durationMinutes,
    data.peopleCount
  );

  return prisma.$transaction(
    async (tx) => {
      await expireStaleBookingHolds(tx, now);

      const activeHolds = await tx.bookingHold.findMany({
        where: {
          userId,
          status: BookingHoldStatus.ACTIVE,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
      });

      const matchingHold = activeHolds.find(
        (hold) =>
          hold.serviceId === data.serviceId &&
          hold.peopleCount === data.peopleCount &&
          sameDateValue(hold.bookingDate, schedule.bookingDate) &&
          sameTimeValue(hold.startTime, schedule.startTime) &&
          sameTimeValue(hold.endTime, schedule.endTime)
      );

      if (matchingHold) {
        const otherHoldIds = activeHolds
          .filter((hold) => hold.id !== matchingHold.id)
          .map((hold) => hold.id);

        if (otherHoldIds.length > 0) {
          await tx.bookingHold.updateMany({
            where: { id: { in: otherHoldIds } },
            data: { status: BookingHoldStatus.RELEASED },
          });
        }

        return matchingHold;
      }

      if (activeHolds.length > 0) {
        await tx.bookingHold.updateMany({
          where: {
            id: { in: activeHolds.map((hold) => hold.id) },
          },
          data: { status: BookingHoldStatus.RELEASED },
        });
      }

      const hasConflict = await checkSlotConflict(
        schedule.bookingDate,
        schedule.startTime,
        schedule.endTime,
        tx,
        { now }
      );

      if (hasConflict) {
        throw new AppError(409, "Selected time slot is not available");
      }

      return tx.bookingHold.create({
        data: {
          userId,
          serviceId: data.serviceId,
          bookingDate: schedule.bookingDate,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          peopleCount: data.peopleCount,
          expiresAt: new Date(now.getTime() + HOLD_TTL_MS),
          status: BookingHoldStatus.ACTIVE,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function getActiveBookingHold(userId: string) {
  const now = new Date();
  await expireStaleBookingHolds(prisma, now);

  return prisma.bookingHold.findFirst({
    where: {
      userId,
      status: BookingHoldStatus.ACTIVE,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function releaseBookingHold(userId: string, holdId: string) {
  const now = new Date();
  await expireStaleBookingHolds(prisma, now);

  await prisma.bookingHold.updateMany({
    where: {
      id: holdId,
      userId,
      status: BookingHoldStatus.ACTIVE,
      expiresAt: { gt: now },
    },
    data: { status: BookingHoldStatus.RELEASED },
  });
}

export async function createBooking(data: CreateBookingData) {
  if (!data.userId) {
    throw new AppError(401, "Please sign in before booking");
  }

  if (data.peopleCount >= LARGE_GROUP_THRESHOLD) {
    throw new AppError(400, "Groups of 5 or more must use the inquiry flow");
  }

  const service = await prisma.service.findUnique({
    where: { id: data.serviceId },
  });

  if (!service || !service.isActive) {
    throw new AppError(404, "Service not found or inactive");
  }

  const now = new Date();
  const schedule = buildBookingWindow(
    data.bookingDate,
    data.startTime,
    service.durationMinutes,
    data.peopleCount
  );

  const booking = await prisma.$transaction(
    async (tx) => {
      await expireStaleBookingHolds(tx, now);

      const hold = await tx.bookingHold.findUnique({
        where: { id: data.holdId },
      });

      if (!hold) {
        throw new AppError(409, "Your selected slot hold is no longer available");
      }

      if (hold.userId !== data.userId) {
        throw new AppError(403, "You can only use your own slot hold");
      }

      if (hold.status !== BookingHoldStatus.ACTIVE || hold.expiresAt <= now) {
        if (hold.status === BookingHoldStatus.ACTIVE && hold.expiresAt <= now) {
          await tx.bookingHold.updateMany({
            where: { id: hold.id, status: BookingHoldStatus.ACTIVE },
            data: { status: BookingHoldStatus.EXPIRED },
          });
        }
        throw new AppError(409, "Your selected slot hold has expired. Please choose a new time.");
      }

      if (
        hold.serviceId !== data.serviceId ||
        hold.peopleCount !== data.peopleCount ||
        !sameDateValue(hold.bookingDate, schedule.bookingDate) ||
        !sameTimeValue(hold.startTime, schedule.startTime) ||
        !sameTimeValue(hold.endTime, schedule.endTime)
      ) {
        throw new AppError(
          409,
          "Your selected slot hold no longer matches this booking. Please choose the slot again."
        );
      }

      const hasConflict = await checkSlotConflict(
        schedule.bookingDate,
        schedule.startTime,
        schedule.endTime,
        tx,
        { excludeHoldId: hold.id, now }
      );

      if (hasConflict) {
        await tx.bookingHold.updateMany({
          where: { id: hold.id, status: BookingHoldStatus.ACTIVE },
          data: { status: BookingHoldStatus.RELEASED },
        });
        throw new AppError(409, "Selected time slot is no longer available");
      }

      const bookingRecord = await tx.booking.create({
        data: {
          userId: data.userId,
          serviceId: data.serviceId,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          address: data.address,
          peopleCount: data.peopleCount,
          bookingDate: schedule.bookingDate,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          bufferEndTime: schedule.bufferEndTime,
          status: BookingStatus.PENDING,
          slots: {
            createMany: {
              data: generateSlots(
                schedule.bookingDate,
                schedule.startTime,
                schedule.endTime
              ),
            },
          },
          statusHistory: {
            create: {
              newStatus: BookingStatus.PENDING,
              changedById: data.userId,
            },
          },
        },
        include: { service: true, slots: true },
      });

      await tx.bookingHold.update({
        where: { id: hold.id },
        data: {
          status: BookingHoldStatus.CONVERTED,
          bookingId: bookingRecord.id,
        },
      });

      return bookingRecord;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  sendBookingSubmittedEmail(booking).catch(() => {});

  return booking;
}

export async function cancelBooking(bookingId: string, userId: string, reason?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new AppError(404, "Booking not found");
  }

  if (booking.userId !== userId) {
    throw new AppError(403, "You can only cancel your own bookings");
  }

  if (
    booking.status === BookingStatus.CANCELLED ||
    booking.status === BookingStatus.COMPLETED ||
    booking.status === BookingStatus.REJECTED
  ) {
    throw new AppError(400, `Cannot cancel a ${booking.status.toLowerCase()} booking`);
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.CANCELLED,
      statusHistory: {
        create: {
          oldStatus: booking.status,
          newStatus: BookingStatus.CANCELLED,
          changedById: userId,
          changeReason: reason,
        },
      },
    },
  });
}

export async function getBookingById(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: { select: { name: true, category: true, durationMinutes: true } },
      slots: true,
    },
  });

  if (!booking) {
    throw new AppError(404, "Booking not found");
  }

  if (booking.userId !== userId) {
    throw new AppError(403, "You can only view your own bookings");
  }

  return booking;
}

export async function getUserBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    include: {
      service: { select: { name: true, category: true, durationMinutes: true } },
    },
    orderBy: { bookingDate: "desc" },
  });
}

export async function expireStaleBookingHolds(
  tx: PrismaClientLike = prisma,
  now = new Date()
) {
  await tx.bookingHold.updateMany({
    where: {
      status: BookingHoldStatus.ACTIVE,
      expiresAt: { lte: now },
    },
    data: { status: BookingHoldStatus.EXPIRED },
  });
}

async function checkSlotConflict(
  date: Date,
  start: Date,
  end: Date,
  tx: PrismaClientLike = prisma,
  options: SlotConflictOptions = {}
) {
  const now = options.now ?? new Date();

  const conflictingBooking = await tx.bookingSlot.findFirst({
    where: {
      slotDate: date,
      slotType: SlotType.SERVICE,
      slotStartTime: { lt: end },
      slotEndTime: { gt: start },
      booking: {
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
    },
  });

  if (conflictingBooking) {
    return true;
  }

  const conflictingBlock = await tx.blockedSlot.findFirst({
    where: {
      blockedDate: date,
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });

  if (conflictingBlock) {
    return true;
  }

  const conflictingHold = await tx.bookingHold.findFirst({
    where: {
      bookingDate: date,
      status: BookingHoldStatus.ACTIVE,
      expiresAt: { gt: now },
      ...(options.excludeHoldId ? { id: { not: options.excludeHoldId } } : {}),
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });

  return Boolean(conflictingHold);
}

function buildBookingWindow(
  bookingDateValue: string,
  startTimeValue: string,
  serviceDurationMinutes: number,
  peopleCount: number
): BookingWindow {
  const bookingDate = new Date(bookingDateValue);
  const [startHour, startMinute] = startTimeValue.split(":").map(Number);
  const startTime = new Date(Date.UTC(1970, 0, 1, startHour, startMinute));
  const totalMinutes = serviceDurationMinutes * peopleCount;
  const endTime = new Date(startTime.getTime() + totalMinutes * 60_000);
  const bufferEndTime = endTime;

  return {
    bookingDate,
    startTime,
    endTime,
    bufferEndTime,
    totalMinutes,
  };
}

function generateSlots(date: Date, start: Date, end: Date) {
  return [
    {
      slotDate: date,
      slotStartTime: start,
      slotEndTime: end,
      slotType: SlotType.SERVICE,
    },
  ];
}

function sameDateValue(left: Date, right: Date) {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

function sameTimeValue(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}
