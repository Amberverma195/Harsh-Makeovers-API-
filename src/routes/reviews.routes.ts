/**
 * Review Routes — Harsh Makeovers
 *
 * All routes are prefixed with /reviews (set in server.ts).
 *
 *   POST /reviews          → submit a review for a completed booking (requires auth)
 *   GET  /reviews/approved → get all approved reviews (public — shown on website)
 */

import { Router } from "express";
import * as reviewController from "../controllers/review.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createReviewSchema } from "../validators/review.validator";

const router = Router();

router.get("/approved", reviewController.getApproved);
router.post("/", requireAuth, validate(createReviewSchema), reviewController.create);

export default router;
