import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import {
  ensureAdminSessionActive,
} from "../services/admin-security.service";
import { getRequestMetadata } from "../helpers/request-metadata";

const ADMIN_READ_LIMIT = 1200;
const ADMIN_WRITE_LIMIT = 240;
const ADMIN_WINDOW_MS = 15 * 60 * 1000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SHOULD_RATE_LIMIT = env.NODE_ENV === "production";

export async function requireLiveAdminSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user || req.user.role !== "ADMIN") {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (!req.user.sessionId) {
    res.status(401).json({ error: "Admin session refresh required" });
    return;
  }

  try {
    const session = await ensureAdminSessionActive(
      req.user.userId,
      req.user.sessionId,
      getRequestMetadata(req)
    );

    req.adminSession = {
      id: session.id,
      userId: session.userId,
      deviceFingerprint: session.deviceFingerprint,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      lastSeenAt: session.lastSeenAt,
      elevatedUntil: session.elevatedUntil,
      isActive: session.isActive,
      revokedAt: session.revokedAt,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requireStepUp(req: Request, res: Response, next: NextFunction): void {
  const elevatedUntil = req.adminSession?.elevatedUntil;

  if (!elevatedUntil || elevatedUntil.getTime() <= Date.now()) {
    res.status(403).json({ error: "Step-up authentication required" });
    return;
  }

  next();
}

export const adminReadLimiter = rateLimit({
  windowMs: ADMIN_WINDOW_MS,
  limit: ADMIN_READ_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  statusCode: 429,
  message: { error: "Too many admin read requests, please slow down" },
  skip: (req) => !SHOULD_RATE_LIMIT || !SAFE_METHODS.has(req.method),
  keyGenerator: (req) => `${req.user?.userId || "anon"}:${req.user?.sessionId || "no-session"}:read`,
}) as unknown as express.RequestHandler;

export const adminWriteLimiter = rateLimit({
  windowMs: ADMIN_WINDOW_MS,
  limit: ADMIN_WRITE_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  statusCode: 429,
  message: { error: "Too many admin write requests, please slow down" },
  skip: (req) => !SHOULD_RATE_LIMIT || SAFE_METHODS.has(req.method),
  keyGenerator: (req) => `${req.user?.userId || "anon"}:${req.user?.sessionId || "no-session"}:write`,
}) as unknown as express.RequestHandler;
