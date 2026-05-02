/**
 * JWT (JSON Web Token) helpers for auth cookies.
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

const ACCESS_SECRET = env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

interface BaseTokenPayload {
  userId: string;
  role: string;
  sessionId?: string;
}

export interface AccessTokenPayload extends BaseTokenPayload {}

export interface RefreshTokenPayload extends BaseTokenPayload {
  tokenId: string;
}

export function createAccessToken(payload: BaseTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function createRefreshToken(payload: BaseTokenPayload): string {
  return jwt.sign(
    {
      ...payload,
      tokenId: crypto.randomUUID(),
    },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, ACCESS_SECRET);

  if (!isBaseTokenPayload(payload)) {
    throw new Error("Invalid access token payload");
  }

  return {
    userId: payload.userId,
    role: payload.role,
    sessionId: typeof payload.sessionId === "string" ? payload.sessionId : undefined,
  };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, REFRESH_SECRET);

  if (!isBaseTokenPayload(payload) || typeof payload.tokenId !== "string" || !payload.tokenId) {
    throw new Error("Invalid refresh token payload");
  }

  return {
    userId: payload.userId,
    role: payload.role,
    tokenId: payload.tokenId,
    sessionId: typeof payload.sessionId === "string" ? payload.sessionId : undefined,
  };
}

function isBaseTokenPayload(value: unknown): value is BaseTokenPayload & { tokenId?: unknown } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  const sessionId = payload.sessionId;

  return (
    typeof payload.userId === "string" &&
    typeof payload.role === "string" &&
    (sessionId === undefined || typeof sessionId === "string")
  );
}