/**
 * Booking routes.
 */

import { Router } from "express";
import * as bookingController from "../controllers/booking.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validate, validateParams, validateQuery } from "../middlewares/validate.middleware";
import {
  availabilityQuerySchema,
  bookingHoldParamsSchema,
  cancelBookingSchema,
  createBookingSchema,
  createBookingHoldSchema,
} from "../validators/booking.validator";

const router = Router();

router.get("/availability", validateQuery(availabilityQuerySchema), bookingController.checkAvailability);
router.get("/holds/active", requireAuth, bookingController.getActiveHold);
router.post("/holds", requireAuth, validate(createBookingHoldSchema), bookingController.createHold);
router.delete(
  "/holds/:id",
  requireAuth,
  validateParams(bookingHoldParamsSchema),
  bookingController.releaseHold
);
router.get("/my", requireAuth, bookingController.getUserBookings);
router.get("/:id", requireAuth, bookingController.getOne);
router.post("/", requireAuth, validate(createBookingSchema), bookingController.create);
router.patch("/:id/cancel", requireAuth, validate(cancelBookingSchema), bookingController.cancel);

export default router;
