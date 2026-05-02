/**
 * Admin Service - Harsh Makeovers
 *
 * Business logic for admin-only operations.
 */

import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error.middleware";
import {
  BookingHoldStatus,
  BookingStatus,
  InquiryStatus,
  InquiryType,
  ReviewStatus,
  SlotType,
} from "../generated/prisma/client.js";
import { sendBookingConfirmedEmail } from "../helpers/email";
import { expireStaleBookingHolds } from "./booking.service";

interface BookingFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: string;
  skip?: number;
  take?: number;
}

interface InquiryFilters {
  status?: string;
  inquiryType?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: string;
  skip?: number;
  take?: number;
}

interface BookingScheduleUpdate {
  bookingDate: string;
  startTime: string;
  peopleCount?: number;
  overrideConflicts?: boolean;
  reason?: string;
}

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];
const INQUIRY_STATUS_VALUES = Object.values(InquiryStatus) as string[];
const INQUIRY_TYPE_VALUES = Object.values(InquiryType) as string[];

export async function getAllBookings(filters: BookingFilters = {}) {
  const where: Record<string, unknown> = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.dateFrom || filters.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (filters.dateFrom) dateFilter.gte = new Date(filters.dateFrom);
    if (filters.dateTo) dateFilter.lte = new Date(filters.dateTo);
    where.bookingDate = dateFilter;
  }

  const allowedSortFields = ["bookingDate", "createdAt", "status"];
  const sortBy = allowedSortFields.includes(filters.sortBy || "")
    ? filters.sortBy!
    : "bookingDate";
  const sortOrder = filters.sortOrder === "asc" ? ("asc" as const) : ("desc" as const);

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        service: { select: { name: true, category: true, durationMinutes: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: filters.skip,
      take: filters.take,
    }),
    prisma.booking.count({ where }),
  ]);

  return { bookings, total };
}
export async function searchUserByContact(query: string) {
  const trimmedQuery = query.trim();

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: trimmedQuery.toLowerCase() },
        { phone: trimmedQuery },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      bookings: {
        orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
        include: {
          service: { select: { name: true, category: true, durationMinutes: true } },
        },
      },
      inquiries: {
        orderBy: { createdAt: "desc" },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          rating: true,
          reviewText: true,
          status: true,
          reviewedAt: true,
          moderatedAt: true,
          createdAt: true,
          booking: {
            select: {
              id: true,
              service: { select: { name: true, category: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new AppError(404, "No user found with that email or phone number.");
  }

  return user;
}

export async function getBookingDetail(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingDetailInclude(),
  });

  if (!booking) {
    throw new AppError(404, "Booking not found");
  }

  return booking;
}

export async function addBookingNote(bookingId: string, adminId: string, noteText: string) {
  await requireBooking(bookingId);

  const note = await prisma.adminNote.create({
    data: {
      bookingId,
      adminId,
      noteText,
    },
    include: {
      admin: { select: { name: true, email: true } },
    },
  });

  await prisma.booking.update({
    where: { id: bookingId },
    data: { adminNotesSummary: summarizeNote(noteText) },
  });

  return note;
}

export async function updateBookingNote(bookingId: string, noteId: string, noteText: string) {
  const note = await prisma.adminNote.findUnique({
    where: { id: noteId },
  });

  if (!note || note.bookingId !== bookingId) {
    throw new AppError(404, "Booking note not found");
  }

  const updatedNote = await prisma.adminNote.update({
    where: { id: noteId },
    data: { noteText },
    include: {
      admin: { select: { name: true, email: true } },
    },
  });

  const latestNote = await prisma.adminNote.findFirst({
    where: { bookingId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  await prisma.booking.update({
    where: { id: bookingId },
    data: { adminNotesSummary: latestNote ? summarizeNote(latestNote.noteText) : null },
  });

  return updatedNote;
}

export async function confirmBooking(bookingId: string, adminId: string) {
  const booking = await updateBookingStatus(bookingId, BookingStatus.CONFIRMED, adminId);

  const full = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { service: { select: { name: true } } },
  });
  if (full) {
    sendBookingConfirmedEmail(full).catch(() => {});
  }

  return booking;
}

export async function rejectBooking(bookingId: string, adminId: string, reason?: string) {
  return updateBookingStatus(bookingId, BookingStatus.REJECTED, adminId, reason);
}

export async function cancelBookingAsAdmin(bookingId: string, adminId: string, reason?: string) {
  return updateBookingStatus(bookingId, BookingStatus.CANCELLED, adminId, reason);
}

export async function markBookingCompleted(bookingId: string, adminId: string) {
  return updateBookingStatus(bookingId, BookingStatus.COMPLETED, adminId);
}

export async function updateBookingSchedule(
  bookingId: string,
  adminId: string,
  data: BookingScheduleUpdate
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: { select: { name: true, durationMinutes: true } },
    },
  });

  if (!booking) {
    throw new AppError(404, "Booking not found");
  }

  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
    throw new AppError(400, `Cannot adjust schedule for a ${booking.status.toLowerCase()} booking`);
  }

  const peopleCount = data.peopleCount ?? booking.peopleCount;
  const schedule = buildBookingSchedule(
    data.bookingDate,
    data.startTime,
    booking.service.durationMinutes,
    peopleCount
  );

  if (!data.overrideConflicts) {
    await expireStaleBookingHolds();

    const hasConflict = await checkAdminSlotConflict(
      bookingId,
      schedule.bookingDate,
      schedule.startTime,
      schedule.endTime
    );

    if (hasConflict) {
      throw new AppError(409, "Selected time slot is not available");
    }
  }

  const auditNote = buildScheduleAuditNote(booking, data, peopleCount, schedule);

  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      bookingDate: schedule.bookingDate,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      bufferEndTime: schedule.bufferEndTime,
      peopleCount,
      slots: {
        deleteMany: {},
        createMany: {
          data: generateSlots(
            schedule.bookingDate,
            schedule.startTime,
            schedule.endTime
          ),
        },
      },
      adminNotesSummary: summarizeNote(auditNote),
      adminNotes: {
        create: {
          adminId,
          noteText: auditNote,
        },
      },
    },
    include: bookingDetailInclude(),
  });
}

export async function getAllInquiries(filters: InquiryFilters = {}) {
  const where: Record<string, unknown> = {};

  if (filters.status) {
    if (!INQUIRY_STATUS_VALUES.includes(filters.status)) {
      throw new AppError(400, "Invalid inquiry status");
    }
    where.status = filters.status as InquiryStatus;
  }

  if (filters.inquiryType) {
    if (!INQUIRY_TYPE_VALUES.includes(filters.inquiryType)) {
      throw new AppError(400, "Invalid inquiry type");
    }
    where.inquiryType = filters.inquiryType as InquiryType;
  }

  if (filters.dateFrom || filters.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (filters.dateFrom) dateFilter.gte = new Date(filters.dateFrom);
    if (filters.dateTo) dateFilter.lte = new Date(filters.dateTo);
    where.createdAt = dateFilter;
  }

  const allowedSortFields = ["createdAt", "updatedAt", "status", "inquiryType"];
  const sortBy = allowedSortFields.includes(filters.sortBy || "")
    ? filters.sortBy!
    : "createdAt";
  const sortOrder = filters.sortOrder === "asc" ? ("asc" as const) : ("desc" as const);

  const [inquiries, total] = await Promise.all([
    prisma.contactInquiry.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: filters.skip,
      take: filters.take,
    }),
    prisma.contactInquiry.count({ where }),
  ]);

  return { inquiries, total };
}

export async function updateInquiryStatus(inquiryId: string, status: string) {
  if (!INQUIRY_STATUS_VALUES.includes(status)) {
    throw new AppError(400, "Invalid inquiry status");
  }

  const inquiry = await prisma.contactInquiry.findUnique({
    where: { id: inquiryId },
    include: {
      user: { select: { name: true, email: true } },
    },
  });

  if (!inquiry) {
    throw new AppError(404, "Inquiry not found");
  }

  if (inquiry.status === status) {
    return inquiry;
  }

  return prisma.contactInquiry.update({
    where: { id: inquiryId },
    data: { status: status as InquiryStatus },
    include: {
      user: { select: { name: true, email: true } },
    },
  });
}

export async function blockSlot(
  adminId: string,
  data: { blockedDate: string; startTime: string; endTime: string; reason?: string }
) {
  const date = new Date(data.blockedDate);
  const [startH, startM] = data.startTime.split(":").map(Number);
  const [endH, endM] = data.endTime.split(":").map(Number);
  const startTime = new Date(Date.UTC(1970, 0, 1, startH, startM));
  const endTime = new Date(Date.UTC(1970, 0, 1, endH, endM));

  if (endTime.getTime() <= startTime.getTime()) {
    throw new AppError(400, "End time must be after start time");
  }

  await expireStaleBookingHolds();

  const hasConflict = await checkAdminSlotConflict(
    null,
    date,
    startTime,
    endTime
  );

  if (hasConflict) {
    throw new AppError(409, "Selected time slot is not available");
  }

  return prisma.blockedSlot.create({
    data: {
      blockedDate: date,
      startTime,
      endTime,
      reason: data.reason,
      createdById: adminId,
    },
  });
}

export async function deleteBlockedSlot(slotId: string) {
  const slot = await prisma.blockedSlot.findUnique({ where: { id: slotId } });
  if (!slot) throw new AppError(404, "Blocked slot not found");
  return prisma.blockedSlot.delete({ where: { id: slotId } });
}

export async function getBlockedSlots(skip?: number, take?: number) {
  const [slots, total] = await Promise.all([
    prisma.blockedSlot.findMany({
      orderBy: { blockedDate: "desc" },
      skip,
      take,
    }),
    prisma.blockedSlot.count(),
  ]);
  return { slots, total };
}

export async function approveReview(reviewId: string, adminId: string) {
  return moderateReview(reviewId, ReviewStatus.APPROVED, adminId);
}

export async function hideReview(reviewId: string, adminId: string) {
  return moderateReview(reviewId, ReviewStatus.REJECTED, adminId);
}

export async function rejectReview(reviewId: string, adminId: string) {
  return hideReview(reviewId, adminId);
}

export async function deleteReview(reviewId: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    throw new AppError(404, "Review not found");
  }

  return prisma.review.delete({
    where: { id: reviewId },
  });
}

function bookingDetailInclude() {
  return {
    service: { select: { name: true, category: true, durationMinutes: true } },
    user: { select: { name: true, email: true } },
    adminNotes: {
      orderBy: { updatedAt: "desc" as const },
      include: {
        admin: { select: { name: true, email: true } },
      },
    },
    statusHistory: {
      orderBy: { createdAt: "desc" as const },
      include: {
        changedBy: { select: { name: true, email: true } },
      },
    },
  };
}

async function requireBooking(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new AppError(404, "Booking not found");
  }
  return booking;
}

async function updateBookingStatus(
  bookingId: string,
  newStatus: BookingStatus,
  adminId: string,
  reason?: string
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new AppError(404, "Booking not found");
  }

  const allowed = getAllowedTransitions(booking.status);
  if (!allowed.includes(newStatus)) {
    throw new AppError(400, `Cannot transition from ${booking.status} to ${newStatus}`);
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: newStatus,
      statusHistory: {
        create: {
          oldStatus: booking.status,
          newStatus,
          changedById: adminId,
          changeReason: reason,
        },
      },
    },
    include: { statusHistory: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
}

function getAllowedTransitions(current: BookingStatus): BookingStatus[] {
  const map: Record<BookingStatus, BookingStatus[]> = {
    PENDING: [BookingStatus.CONFIRMED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
    CONFIRMED: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
    COMPLETED: [],
    CANCELLED: [],
    REJECTED: [],
  };
  return map[current];
}

async function moderateReview(
  reviewId: string,
  status: ReviewStatus,
  adminId: string
) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    throw new AppError(404, "Review not found");
  }

  if (review.status === status) {
    const stateLabel = status === ReviewStatus.APPROVED ? "visible" : "hidden";
    throw new AppError(400, `Review is already ${stateLabel}`);
  }

  return prisma.review.update({
    where: { id: reviewId },
    data: {
      status,
      moderatedById: adminId,
      moderatedAt: new Date(),
    },
  });
}

function summarizeNote(noteText: string) {
  return noteText.length <= 160 ? noteText : `${noteText.slice(0, 157)}...`;
}

function buildBookingSchedule(
  bookingDateValue: string,
  startTimeValue: string,
  serviceDurationMinutes: number,
  peopleCount: number
) {
  const bookingDate = new Date(bookingDateValue);
  const [startH, startM] = startTimeValue.split(":").map(Number);
  const startTime = new Date(Date.UTC(1970, 0, 1, startH, startM));
  const totalMinutes = serviceDurationMinutes * peopleCount;
  const endTime = new Date(startTime.getTime() + totalMinutes * 60_000);
  const bufferEndTime = endTime;

  return { bookingDate, startTime, endTime, bufferEndTime };
}

async function checkAdminSlotConflict(
  bookingId: string | null,
  bookingDate: Date,
  startTime: Date,
  endTime: Date
) {
  const conflictingBooking = await prisma.bookingSlot.findFirst({
    where: {
      bookingId: { not: bookingId },
      slotDate: bookingDate,
      slotType: SlotType.SERVICE,
      slotStartTime: { lt: endTime },
      slotEndTime: { gt: startTime },
      booking: {
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
    },
  });

  if (conflictingBooking) {
    return true;
  }

  const conflictingBlock = await prisma.blockedSlot.findFirst({
    where: {
      blockedDate: bookingDate,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  if (conflictingBlock) {
    return true;
  }

  const conflictingHold = await prisma.bookingHold.findFirst({
    where: {
      bookingDate,
      status: BookingHoldStatus.ACTIVE,
      expiresAt: { gt: new Date() },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  return !!conflictingHold;
}

function generateSlots(
  date: Date,
  start: Date,
  end: Date
) {
  return [
    {
      slotDate: date,
      slotStartTime: start,
      slotEndTime: end,
      slotType: SlotType.SERVICE,
    },
  ];
}

function formatDateForNote(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeForNote(date: Date) {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildScheduleAuditNote(
  booking: {
    bookingDate: Date;
    startTime: Date;
    endTime: Date;
    peopleCount: number;
    service: { name: string };
  },
  data: BookingScheduleUpdate,
  peopleCount: number,
  schedule: { bookingDate: Date; startTime: Date; endTime: Date }
) {
  const parts = [
    `Schedule adjusted for ${booking.service.name}`,
    `from ${formatDateForNote(booking.bookingDate)} ${formatTimeForNote(booking.startTime)}-${formatTimeForNote(booking.endTime)}`,
    `to ${formatDateForNote(schedule.bookingDate)} ${formatTimeForNote(schedule.startTime)}-${formatTimeForNote(schedule.endTime)}`,
    `for ${peopleCount} ${peopleCount === 1 ? "person" : "people"}.`,
  ];

  if (peopleCount !== booking.peopleCount) {
    parts.push(`People count changed from ${booking.peopleCount} to ${peopleCount}.`);
  }

  if (data.overrideConflicts) {
    parts.push("Conflict override applied.");
  }

  if (data.reason) {
    parts.push(`Reason: ${data.reason}`);
  }

  return parts.join(" ");
}
