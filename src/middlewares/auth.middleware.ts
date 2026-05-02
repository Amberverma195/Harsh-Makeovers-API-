/**
 * Auth middleware for protected routes.
 */

import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { verifyAccessToken } from "../helpers/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        sessionId?: string;
      };
      adminSession?: {
        id: string;
        userId: string;
        deviceFingerprint?: string | null;
        userAgent?: string | null;
        ipAddress?: string | null;
        lastSeenAt: Date;
        elevatedUntil?: Date | null;
        isActive: boolean;
        revokedAt?: Date | null;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.access_token;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    req.user = {
      userId: user.id,
      role: user.role,
      sessionId: payload.sessionId,
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
