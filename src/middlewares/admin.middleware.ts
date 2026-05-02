/**
 * Admin Middleware — Harsh Makeovers
 *
 * This middleware protects routes that ONLY admins should access
 * (e.g. confirming bookings, managing portfolio, moderating reviews).
 *
 * IMPORTANT: This must ALWAYS be used AFTER requireAuth in the middleware chain.
 * requireAuth sets req.user, and this middleware checks if that user is an admin.
 *
 * Usage in routes:
 *   router.patch("/bookings/:id/confirm", requireAuth, requireAdmin, confirmBookingController);
 *   // First requireAuth checks login, then requireAdmin checks admin role
 *
 * What happens:
 *   - If req.user doesn't exist → 401 (requireAuth should have caught this, but just in case)
 *   - If req.user.role is not "ADMIN" → 403 Forbidden
 *   - If req.user.role IS "ADMIN" → let the request through
 */

import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // Safety check: requireAuth should have already set req.user
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Check if the logged-in user has admin privileges
  if (req.user.role !== "ADMIN") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  // User is an admin — let the request continue
  next();
}
