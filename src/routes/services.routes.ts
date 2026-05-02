/**
 * Service Routes — Harsh Makeovers
 *
 * All routes are prefixed with /services (set in server.ts).
 * Both routes are public — no login needed.
 *
 *   GET /services     → list all active services
 *   GET /services/:id → get a single service by ID
 */

import { Router } from "express";
import * as serviceController from "../controllers/service.controller";

const router = Router();

router.get("/", serviceController.getAll);
router.get("/:id", serviceController.getOne);

export default router;
