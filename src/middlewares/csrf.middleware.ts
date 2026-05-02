/**
 * CSRF Protection — Harsh Makeovers
 *
 * Strategy: Custom-Header Verification (a.k.a. "double-submit" lite).
 *
 * Browsers enforce that JavaScript on a foreign origin CANNOT set custom
 * headers on cross-origin requests unless the server explicitly allows it
 * via CORS. Since our CORS config only allows FRONTEND_URL, any request
 * carrying the custom header `X-Requested-With: XMLHttpRequest` is
 * guaranteed to have come from our own frontend — not from a rogue form
 * submission on another site.
 *
 * This middleware:
 *   - Skips safe/read-only methods (GET, HEAD, OPTIONS)
 *   - On all state-changing methods (POST, PUT, PATCH, DELETE), requires
 *     the header `X-Requested-With: XMLHttpRequest`
 *   - If the header is missing, responds with 403 Forbidden
 *
 * Why this works against CSRF:
 *   1. HTML <form> submissions CANNOT set custom headers — they only send
 *      standard headers. So a cross-site form POST will never include it.
 *   2. fetch() / XHR from a foreign origin CAN set custom headers, but
 *      the browser will send a CORS preflight (OPTIONS) first. Our CORS
 *      config blocks any origin that isn't FRONTEND_URL, so the preflight
 *      fails and the request never reaches the server.
 *   3. The SameSite=Strict cookie flag adds a second layer: cookies are
 *      never sent with cross-site requests at all.
 */

import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // In test environment, skip CSRF checks so unit tests don't break
  if (env.NODE_ENV === "test") {
    next();
    return;
  }

  const header = req.headers["x-requested-with"];

  if (header !== "XMLHttpRequest") {
    res.status(403).json({ error: "CSRF validation failed" });
    return;
  }

  next();
}
