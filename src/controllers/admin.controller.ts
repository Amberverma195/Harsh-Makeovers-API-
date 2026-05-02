/**
 * Admin Controller - Harsh Makeovers
 *
 * Handles admin-only actions. All routes require auth + admin middleware.
 */

import { NextFunction, Request, Response } from "express";
import { paginatedResponse, parsePagination } from "../helpers/pagination";
import { getRequestAuditContext } from "../helpers/request-metadata";
import { AppError } from "../middlewares/error.middleware";
import { logAdminMutation } from "../services/admin-security.service";
import * as adminService from "../services/admin.service";

interface AuditOptions {
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  riskLevel?: string;
}

async function auditAdminMutation(req: Request, options: AuditOptions) {
  if (!req.user?.userId) {
    return;
  }

  try {
    await logAdminMutation({
      adminId: req.user.userId,
      sessionId: req.user.sessionId,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId,
      details: options.details,
      riskLevel: options.riskLevel,
      audit: getRequestAuditContext(req),
    });
  } catch (error) {
    console.error("Failed to record admin audit log", error);
  }
}

export async function getAllBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as { page?: string; limit?: string });
    const { status, dateFrom, dateTo, sortBy, sortOrder } = req.query as Record<string, string | undefined>;

    const { bookings, total } = await adminService.getAllBookings({
      status,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      skip,
      take,
    });

    res.json(paginatedResponse(bookings, total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function getBookingDetail(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const booking = await adminService.getBookingDetail(req.params.id);
    res.json(booking);
  } catch (error) {
    next(error);
  }
}

export async function searchUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { q } = req.query;

    if (typeof q !== "string" || !q.trim()) {
      throw new AppError(400, "Search query (email or phone) is required");
    }

    const userProfile = await adminService.searchUserByContact(q.trim());
    res.json(userProfile);
  } catch (error) {
    next(error);
  }
}

export async function addBookingNote(
  req: Request<{ id: string }, unknown, { noteText: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const note = await adminService.addBookingNote(req.params.id, req.user!.userId, req.body.noteText);

    await auditAdminMutation(req, {
      action: "booking.note.create",
      entityType: "booking_note",
      entityId: note.id,
      details: { bookingId: req.params.id },
      riskLevel: "low",
    });

    res.status(201).json({ message: "Note added", note });
  } catch (error) {
    next(error);
  }
}

export async function updateBookingNote(
  req: Request<{ id: string; noteId: string }, unknown, { noteText: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const note = await adminService.updateBookingNote(req.params.id, req.params.noteId, req.body.noteText);

    await auditAdminMutation(req, {
      action: "booking.note.update",
      entityType: "booking_note",
      entityId: note.id,
      details: { bookingId: req.params.id },
      riskLevel: "low",
    });

    res.json({ message: "Note updated", note });
  } catch (error) {
    next(error);
  }
}

export async function confirmBooking(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const booking = await adminService.confirmBooking(req.params.id, req.user!.userId);

    await auditAdminMutation(req, {
      action: "booking.confirm",
      entityType: "booking",
      entityId: booking.id,
      details: { status: booking.status },
      riskLevel: "medium",
    });

    res.json({ message: "Booking confirmed", booking });
  } catch (error) {
    next(error);
  }
}

export async function rejectBooking(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const booking = await adminService.rejectBooking(req.params.id, req.user!.userId, req.body.reason);

    await auditAdminMutation(req, {
      action: "booking.reject",
      entityType: "booking",
      entityId: booking.id,
      details: { status: booking.status, reason: req.body.reason || null },
      riskLevel: "medium",
    });

    res.json({ message: "Booking rejected", booking });
  } catch (error) {
    next(error);
  }
}

export async function cancelBooking(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const booking = await adminService.cancelBookingAsAdmin(req.params.id, req.user!.userId, req.body.reason);

    await auditAdminMutation(req, {
      action: "booking.cancel",
      entityType: "booking",
      entityId: booking.id,
      details: { status: booking.status, reason: req.body.reason || null },
      riskLevel: "medium",
    });

    res.json({ message: "Booking cancelled", booking });
  } catch (error) {
    next(error);
  }
}

export async function completeBooking(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const booking = await adminService.markBookingCompleted(req.params.id, req.user!.userId);

    await auditAdminMutation(req, {
      action: "booking.complete",
      entityType: "booking",
      entityId: booking.id,
      details: { status: booking.status },
      riskLevel: "medium",
    });

    res.json({ message: "Booking marked as completed", booking });
  } catch (error) {
    next(error);
  }
}

export async function updateBookingSchedule(
  req: Request<
    { id: string },
    unknown,
    {
      bookingDate: string;
      startTime: string;
      peopleCount?: number;
      overrideConflicts?: boolean;
      reason?: string;
    }
  >,
  res: Response,
  next: NextFunction
) {
  try {
    const booking = await adminService.updateBookingSchedule(req.params.id, req.user!.userId, req.body);

    await auditAdminMutation(req, {
      action: "booking.schedule.update",
      entityType: "booking",
      entityId: booking.id,
      details: {
        bookingDate: req.body.bookingDate,
        startTime: req.body.startTime,
        peopleCount: req.body.peopleCount,
        overrideConflicts: !!req.body.overrideConflicts,
        reason: req.body.reason || null,
      },
      riskLevel: "medium",
    });

    res.json({ message: "Booking schedule updated", booking });
  } catch (error) {
    next(error);
  }
}

export async function getAllInquiries(req: Request, res: Response, next: NextFunction) {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as { page?: string; limit?: string });
    const { status, inquiryType, dateFrom, dateTo, sortBy, sortOrder } = req.query as Record<string, string | undefined>;

    const { inquiries, total } = await adminService.getAllInquiries({
      status,
      inquiryType,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      skip,
      take,
    });

    res.json(paginatedResponse(inquiries, total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function updateInquiryStatus(
  req: Request<{ id: string }, unknown, { status: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const inquiry = await adminService.updateInquiryStatus(req.params.id, req.body.status);

    await auditAdminMutation(req, {
      action: "inquiry.status.update",
      entityType: "inquiry",
      entityId: inquiry.id,
      details: { status: inquiry.status },
      riskLevel: "low",
    });

    res.json({ message: "Inquiry status updated", inquiry });
  } catch (error) {
    next(error);
  }
}

export async function blockSlot(req: Request, res: Response, next: NextFunction) {
  try {
    const slot = await adminService.blockSlot(req.user!.userId, req.body);

    await auditAdminMutation(req, {
      action: "blocked_slot.create",
      entityType: "blocked_slot",
      entityId: slot.id,
      details: {
        blockedDate: slot.blockedDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
      },
      riskLevel: "medium",
    });

    res.status(201).json({ message: "Slot blocked", slot });
  } catch (error) {
    next(error);
  }
}

export async function approveReview(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const review = await adminService.approveReview(req.params.id, req.user!.userId);

    await auditAdminMutation(req, {
      action: "review.approve",
      entityType: "review",
      entityId: review.id,
      details: { status: review.status },
      riskLevel: "low",
    });

    res.json({ message: "Review approved", review });
  } catch (error) {
    next(error);
  }
}

export async function rejectReview(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const review = await adminService.rejectReview(req.params.id, req.user!.userId);

    await auditAdminMutation(req, {
      action: "review.reject",
      entityType: "review",
      entityId: review.id,
      details: { status: review.status },
      riskLevel: "medium",
    });

    res.json({ message: "Review rejected", review });
  } catch (error) {
    next(error);
  }
}

export async function hideReview(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const review = await adminService.hideReview(req.params.id, req.user!.userId);

    await auditAdminMutation(req, {
      action: "review.hide",
      entityType: "review",
      entityId: review.id,
      details: { status: review.status },
      riskLevel: "medium",
    });

    res.json({ message: "Review hidden", review });
  } catch (error) {
    next(error);
  }
}

export async function deleteReview(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    await adminService.deleteReview(req.params.id);

    await auditAdminMutation(req, {
      action: "review.delete",
      entityType: "review",
      entityId: req.params.id,
      riskLevel: "high",
    });

    res.json({ message: "Review deleted" });
  } catch (error) {
    next(error);
  }
}

export async function getBlockedSlots(req: Request, res: Response, next: NextFunction) {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as { page?: string; limit?: string });
    const { slots, total } = await adminService.getBlockedSlots(skip, take);
    res.json(paginatedResponse(slots, total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function deleteBlockedSlot(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    await adminService.deleteBlockedSlot(req.params.id);

    await auditAdminMutation(req, {
      action: "blocked_slot.delete",
      entityType: "blocked_slot",
      entityId: req.params.id,
      riskLevel: "medium",
    });

    res.json({ message: "Blocked slot removed" });
  } catch (error) {
    next(error);
  }
}
