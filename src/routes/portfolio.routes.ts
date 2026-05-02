/**
 * Portfolio Routes (Public) — Harsh Makeovers
 *
 * All routes are prefixed with /portfolio (set in server.ts).
 * These are the public-facing routes — no login needed.
 * Admin portfolio management routes are in admin.routes.ts.
 *
 *   GET /portfolio     → get all published portfolio items (website gallery)
 *   GET /portfolio/:id → get a single published portfolio item
 */

import { Router } from "express";
import * as portfolioController from "../controllers/portfolio.controller";

const router = Router();

router.get("/", portfolioController.getPublished);
router.get("/:id", portfolioController.getOne);

export default router;
