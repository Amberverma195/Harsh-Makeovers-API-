/**
 * Booking Validators - Harsh Makeovers
 */

import { z } from "zod";
import { strictDate, strictEmail, strictPhone, strictTime, safeString } from "./helpers";

const directBookingDateSchema = strictDate.refine((date) => {
  const bookingDate = new Date(date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() + 5);
  return bookingDate >= minDate;
}, "Booking must be at least 5 days in advance");

export const createBookingSchema = z.object({
  serviceId: z.string().uuid("Invalid service ID"),
  fullName: safeString({ min: 2, max: 100 }),
  email: strictEmail,
  phone: strictPhone,
  address: safeString({ min: 1, max: 500 }),
  holdId: z.string().uuid("Invalid hold ID"),
  peopleCount: z
    .number()
    .int()
    .min(1, "At least 1 person required")
    .max(4, "Groups of 5 or more must use the inquiry flow")
    .default(1),
  bookingDate: directBookingDateSchema,
  startTime: strictTime,
});

export const createBookingHoldSchema = z.object({
  serviceId: z.string().uuid("Invalid service ID"),
  bookingDate: directBookingDateSchema,
  startTime: strictTime,
  peopleCount: z
    .number()
    .int()
    .min(1, "At least 1 person required")
    .max(4, "Groups of 5 or more must use the inquiry flow"),
});

export const cancelBookingSchema = z.object({
  reason: safeString({ max: 500 }).optional(),
});

export const bookingHoldParamsSchema = z.object({
  id: z.string().uuid("Invalid hold ID"),
});

export const adminBookingNoteSchema = z.object({
  noteText: safeString({ min: 1, max: 2000 }),
});

export const adminBookingScheduleSchema = z.object({
  bookingDate: strictDate,
  startTime: strictTime,
  peopleCount: z
    .number()
    .int()
    .min(1, "At least 1 person required")
    .max(100, "Maximum 100 people")
    .optional(),
  overrideConflicts: z.boolean().default(false),
  reason: safeString({ max: 500 }).optional(),
});

export const adminBlockedSlotSchema = z
  .object({
    blockedDate: strictDate,
    startTime: strictTime,
    endTime: strictTime,
    reason: safeString({ max: 500 }).optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

export const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid("Invalid service ID"),
  date: strictDate,
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CreateBookingHoldInput = z.infer<typeof createBookingHoldSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type BookingHoldParamsInput = z.infer<typeof bookingHoldParamsSchema>;
export type AdminBookingNoteInput = z.infer<typeof adminBookingNoteSchema>;
export type AdminBookingScheduleInput = z.infer<typeof adminBookingScheduleSchema>;
export type AdminBlockedSlotInput = z.infer<typeof adminBlockedSlotSchema>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
