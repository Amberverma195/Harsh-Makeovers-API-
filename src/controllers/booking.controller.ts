/**
 * Booking Controller — Harsh Makeovers
 *
 * Handles booking-related requests.
 *
 * Routes:
 *   GET  /bookings/availability  → checkAvailability (public)
 *   POST /bookings               → create (requires auth)
 *   POST /bookings/:id/cancel    → cancel (requires auth, own booking only)
 *   GET  /bookings/my            → getUserBookings (requires auth)
 */

import { Request, Response, NextFunction } from "express";
import * as bookingService from "../services/booking.service";

export async function getActiveHold(req: Request, res: Response, next: NextFunction) {
  try {
    const hold = await bookingService.getActiveBookingHold(req.user!.userId);
    res.json({ hold });
  } catch (error) {
    next(error);
  }
}

export async function createHold(req: Request, res: Response, next: NextFunction) {
  try {
    const hold = await bookingService.createBookingHold(req.body, req.user!.userId);
    res.status(201).json({ message: "Slot hold created", hold });
  } catch (error) {
    next(error);
  }
}

export async function releaseHold(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    await bookingService.releaseBookingHold(req.user!.userId, req.params.id);
    res.json({ message: "Slot hold released" });
  } catch (error) {
    next(error);
  }
}

/** GET /bookings/availability?serviceId=xxx&date=YYYY-MM-DD — Check open time slots */
export async function checkAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const { serviceId, date } = req.query as { serviceId: string; date: string };
    const availability = await bookingService.checkAvailability(serviceId, date);
    res.json(availability);
  } catch (error) {
    next(error);
  }
}

/** POST /bookings — Create a new booking (requires auth) */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await bookingService.createBooking({
      ...req.body,
      userId: req.user?.userId,
    });

    res.status(201).json({ message: "Booking created", booking });
  } catch (error) {
    next(error);
  }
}

/** POST /bookings/:id/cancel — Cancel your own booking (requires auth) */
export async function cancel(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const booking = await bookingService.cancelBooking(
      req.params.id,
      req.user!.userId,
      req.body.reason
    );

    res.json({ message: "Booking cancelled", booking });
  } catch (error) {
    next(error);
  }
}

/** GET /bookings/:id — Get a single booking by ID (requires auth, own booking only) */
export async function getOne(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const booking = await bookingService.getBookingById(req.params.id, req.user!.userId);
    res.json(booking);
  } catch (error) {
    next(error);
  }
}

/** GET /bookings/my — Get all bookings for the logged-in user */
export async function getUserBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const bookings = await bookingService.getUserBookings(req.user!.userId);
    res.json(bookings);
  } catch (error) {
    next(error);
  }
}
