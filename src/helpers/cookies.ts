/**
 * Cookie Helpers — Harsh Makeovers
 *
 * Manages auth cookies (access_token and refresh_token) in the browser.
 *
 * Why cookies instead of localStorage?
 *   - Cookies with httpOnly: true CANNOT be read by JavaScript in the browser.
 *   - This means even if someone injects a script (XSS attack), they can't steal the tokens.
 *   - The browser automatically sends cookies with every request — no extra code needed on frontend.
 *
 * Security settings:
 *   - httpOnly: true  → JavaScript can't access (prevents XSS token theft)
 *   - secure: true    → only sent over HTTPS (production only, localhost uses HTTP)
 *   - sameSite: strict → cookie never sent with cross-site requests (prevents CSRF)
 *     In dev we use "lax" so the dev proxy works correctly.
 *   - path-scoping: refresh_token is scoped to /api/v1/auth so it's only sent
 *     on token-refresh requests, not on every single API call.
 */

import { Response } from "express";
import { env } from "../config/env";

const IS_PRODUCTION = env.NODE_ENV === "production";

const BASE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? "strict" as const : "lax" as const,
};

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string
): void {
  res.cookie("access_token", accessToken, {
    ...BASE_OPTIONS,
    path: "/",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refresh_token", refreshToken, {
    ...BASE_OPTIONS,
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie("access_token", { ...BASE_OPTIONS, path: "/" });
  res.clearCookie("refresh_token", { ...BASE_OPTIONS, path: "/api/v1/auth" });
}
