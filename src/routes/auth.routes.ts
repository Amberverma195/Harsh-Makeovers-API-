/**
 * Auth Routes — Harsh Makeovers
 *
 * All routes are prefixed with /auth (set in server.ts).
 *
 *   POST /auth/register → create account + auto-login  (registerLimiter)
 *   POST /auth/login    → log in with email + password  (loginLimiter)
 *   POST /auth/logout   → revoke tokens + clear cookies (global limiter only)
 *   POST /auth/refresh  → get new tokens using refresh  (global limiter only)
 */

import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { registerSchema, loginSchema } from "../validators/auth.validator";
import { env } from "../config/env";
import rateLimit from "express-rate-limit";
import express from "express";

const SHOULD_RATE_LIMIT = env.NODE_ENV === "production";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  statusCode: 429,
  skip: () => !SHOULD_RATE_LIMIT,
  message: { error: "Too many login attempts, please try again later" },
}) as unknown as express.RequestHandler;

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  statusCode: 429,
  skip: () => !SHOULD_RATE_LIMIT,
  message: { error: "Too many registration attempts, please try again later" },
}) as unknown as express.RequestHandler;

const router = Router();

router.post("/register", registerLimiter, validate(registerSchema), authController.register);
router.post("/login", loginLimiter, validate(loginSchema), authController.login);
router.post("/logout", requireAuth, authController.logout);
router.post("/refresh", authController.refresh);

export default router;
