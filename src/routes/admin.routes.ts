/**
 * Admin routes.
 */

import { Router } from "express";
import * as adminController from "../controllers/admin.controller";
import * as adminSecurityController from "../controllers/admin-security.controller";
import * as portfolioController from "../controllers/portfolio.controller";
import * as reviewController from "../controllers/review.controller";
import { requireAdmin } from "../middlewares/admin.middleware";
import {
  adminReadLimiter,
  adminWriteLimiter,
  requireLiveAdminSession,
  requireStepUp,
} from "../middlewares/admin-security.middleware";
import { requireAuth } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { portfolioUpload } from "../middlewares/upload.middleware";
import { adminStepUpSchema } from "../validators/admin-security.validator";
import {
  adminBlockedSlotSchema,
  adminBookingNoteSchema,
  adminBookingScheduleSchema,
  cancelBookingSchema,
} from "../validators/booking.validator";
import { updateInquiryStatusSchema } from "../validators/inquiry.validator";
import {
  createPortfolioFormSchema,
  updatePortfolioFormSchema,
} from "../validators/portfolio.validator";

const router = Router();

router.use(requireAuth, requireAdmin, requireLiveAdminSession, adminReadLimiter, adminWriteLimiter);

router.get("/security/sessions", adminSecurityController.getSessions);
router.get("/security/audit-logs", adminSecurityController.getAuditLogs);
router.post("/security/step-up", validate(adminStepUpSchema), adminSecurityController.stepUp);
router.delete("/security/sessions/:sessionId", requireStepUp, adminSecurityController.revokeSession);
router.post("/security/logout-all", requireStepUp, adminSecurityController.logoutAll);

router.get("/users/search", adminController.searchUser);
router.get("/bookings", adminController.getAllBookings);
router.get("/bookings/:id", adminController.getBookingDetail);
router.post("/bookings/:id/notes", validate(adminBookingNoteSchema), adminController.addBookingNote);
router.patch(
  "/bookings/:id/notes/:noteId",
  validate(adminBookingNoteSchema),
  adminController.updateBookingNote
);
router.patch("/bookings/:id/confirm", requireStepUp, adminController.confirmBooking);
router.patch(
  "/bookings/:id/reject",
  validate(cancelBookingSchema),
  adminController.rejectBooking
);
router.patch(
  "/bookings/:id/cancel",
  requireStepUp,
  validate(cancelBookingSchema),
  adminController.cancelBooking
);
router.patch("/bookings/:id/complete", requireStepUp, adminController.completeBooking);
router.patch(
  "/bookings/:id/schedule",
  requireStepUp,
  validate(adminBookingScheduleSchema),
  adminController.updateBookingSchedule
);

router.get("/inquiries", adminController.getAllInquiries);
router.patch(
  "/inquiries/:id/status",
  validate(updateInquiryStatusSchema),
  adminController.updateInquiryStatus
);

router.get("/blocked-slots", adminController.getBlockedSlots);
router.post("/block-slot", requireStepUp, validate(adminBlockedSlotSchema), adminController.blockSlot);
router.delete("/blocked-slots/:id", adminController.deleteBlockedSlot);

router.get("/reviews", reviewController.getAll);
router.patch("/reviews/:id/approve", adminController.approveReview);
router.patch("/reviews/:id/reject", adminController.rejectReview);
router.patch("/reviews/:id/hide", adminController.hideReview);
router.delete("/reviews/:id", adminController.deleteReview);

router.get("/portfolio", portfolioController.getAll);
router.post(
  "/portfolio",
  portfolioUpload,
  validate(createPortfolioFormSchema),
  portfolioController.create
);
router.put(
  "/portfolio/:id",
  portfolioUpload,
  validate(updatePortfolioFormSchema),
  portfolioController.update
);
router.delete("/portfolio/:id", portfolioController.remove);
router.patch("/portfolio/reorder", portfolioController.reorder);
router.patch("/portfolio/:id/publish", requireStepUp, portfolioController.togglePublish);

export default router;