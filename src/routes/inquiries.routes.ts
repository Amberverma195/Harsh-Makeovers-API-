/**
 * Inquiry Routes — Harsh Makeovers
 *
 * All routes are prefixed with /inquiries (set in server.ts).
 *
 * All 3 POST routes use the same controller + validator.
 * The validator's discriminated union handles type-specific rules
 * (e.g. CLASS requires peopleCount, CONTACT doesn't).
 * The inquiryType is set in the request body by the frontend.
 *
 *   POST /inquiries/contact     → general contact inquiry (requires auth)
 *   POST /inquiries/class       → makeup class inquiry (requires auth)
 *   POST /inquiries/large-group → large group booking inquiry (requires auth)
 *   GET  /inquiries/my          → get logged-in user's inquiries (requires auth)
 */

import { Router } from "express";
import * as inquiryController from "../controllers/inquiry.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createInquirySchema } from "../validators/inquiry.validator";

const router = Router();

router.post("/contact", requireAuth, validate(createInquirySchema), inquiryController.create);
router.post("/class", requireAuth, validate(createInquirySchema), inquiryController.create);
router.post("/large-group", requireAuth, validate(createInquirySchema), inquiryController.create);
router.get("/my", requireAuth, inquiryController.getUserInquiries);

export default router;