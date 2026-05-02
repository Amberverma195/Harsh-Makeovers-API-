/**
 * Auth service for register, login, logout, and refresh flows.
 */

import crypto from "crypto";
import { prisma } from "../config/prisma";
import { hashPassword, comparePassword } from "../helpers/hash";
import { createAccessToken, createRefreshToken, verifyRefreshToken } from "../helpers/jwt";
import type { RequestMetadata } from "../helpers/request-metadata";
import { AppError } from "../middlewares/error.middleware";
import {
  createAdminSession,
  ensureAdminSessionActive,
  revokeAdminSession,
} from "./admin-security.service";

interface RegisterData {
  name: string;
  email: string;
  phone: string;
  password: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface TokenOptions {
  sessionId?: string;
  metadata?: RequestMetadata;
}

const DUPLICATE_ACCOUNT_MESSAGE = "An account with those details already exists";

export async function registerUser(data: RegisterData, metadata?: RequestMetadata) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existing) {
    throw new AppError(409, DUPLICATE_ACCOUNT_MESSAGE);
  }

  const phoneExists = await prisma.user.findUnique({
    where: { phone: data.phone },
  });

  if (phoneExists) {
    throw new AppError(409, DUPLICATE_ACCOUNT_MESSAGE);
  }

  const passwordHash = await hashPassword(data.password);
  const createUser = () => prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash,
    },
    select: { id: true, name: true, email: true, phone: true, role: true },
  });

  let user: Awaited<ReturnType<typeof createUser>>;
  try {
    user = await createUser();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, DUPLICATE_ACCOUNT_MESSAGE);
    }
    throw error;
  }

  const tokens = await generateAndStoreTokens(user.id, user.role, { metadata });
  return { user, tokens };
}

export async function loginUser(email: string, password: string, metadata?: RequestMetadata) {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  const tokens = await generateAndStoreTokens(user.id, user.role, { metadata });

  return {
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
    tokens,
  };
}

export async function logoutUser(userId: string, sessionId?: string): Promise<void> {
  if (sessionId) {
    await revokeAdminSession(userId, sessionId, sessionId);
    return;
  }

  await prisma.refreshToken.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });
}

export async function refreshTokens(
  oldRefreshToken: string,
  metadata?: RequestMetadata
): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(oldRefreshToken);
  } catch {
    throw new AppError(401, "Invalid or expired refresh token");
  }

  const tokenHash = hashToken(oldRefreshToken);
  const revokeResult = await prisma.refreshToken.updateMany({
    where: {
      tokenHash,
      userId: payload.userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
    data: { isRevoked: true },
  });

  if (revokeResult.count < 1) {
    throw new AppError(401, "Refresh token is revoked or expired");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, "User account is inactive");
  }

  let sessionId = payload.sessionId;
  if (user.role === "ADMIN") {
    if (sessionId) {
      await ensureAdminSessionActive(user.id, sessionId, metadata ?? emptyMetadata());
    } else {
      sessionId = (await createAdminSession(user.id, metadata ?? emptyMetadata())).id;
    }
  }

  return generateAndStoreTokens(user.id, user.role, {
    sessionId,
    metadata,
  });
}

async function generateAndStoreTokens(
  userId: string,
  role: string,
  options: TokenOptions = {}
): Promise<AuthTokens> {
  let sessionId = options.sessionId;

  if (role === "ADMIN" && !sessionId) {
    sessionId = (await createAdminSession(userId, options.metadata ?? emptyMetadata())).id;
  }

  const accessToken = createAccessToken({ userId, role, sessionId });
  const refreshToken = createRefreshToken({ userId, role, sessionId });
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      adminSessionId: sessionId,
      tokenHash,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function emptyMetadata(): RequestMetadata {
  return {
    ipAddress: null,
    userAgent: null,
    deviceFingerprint: null,
  };
}