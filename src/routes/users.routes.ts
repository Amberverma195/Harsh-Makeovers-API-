/**
 * User Routes — Harsh Makeovers
 *
 * All routes are prefixed with /users (set in server.ts).
 * Both routes require authentication.
 *
 *   GET /users/me     → get the logged-in user's profile
 *   PUT /users/update → update own profile (name, phone)
 */

import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { updateProfileSchema } from "../validators/user.validator";

const router = Router();

router.get("/me", requireAuth, userController.getMe);
router.put("/update", requireAuth, validate(updateProfileSchema), userController.updateMe);

export default router;
