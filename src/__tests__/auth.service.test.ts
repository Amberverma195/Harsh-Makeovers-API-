import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    refreshToken: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../helpers/hash", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed_pw"),
  comparePassword: vi.fn(),
}));

vi.mock("../helpers/jwt", () => ({
  createAccessToken: vi.fn().mockReturnValue("access_tok"),
  createRefreshToken: vi.fn().mockReturnValue("refresh_tok"),
  verifyRefreshToken: vi.fn(),
}));

vi.mock("../services/admin-security.service", () => ({
  createAdminSession: vi.fn(),
  ensureAdminSessionActive: vi.fn(),
  revokeAdminSession: vi.fn(),
}));

import { prisma } from "../config/prisma";
import { hashPassword, comparePassword } from "../helpers/hash";
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../helpers/jwt";
import {
  createAdminSession,
  ensureAdminSessionActive,
  revokeAdminSession,
} from "../services/admin-security.service";
import {
  loginUser,
  logoutUser,
  refreshTokens,
  registerUser,
} from "../services/auth.service";

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  refreshToken: {
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};
const mockComparePassword = comparePassword as ReturnType<typeof vi.fn>;
const mockCreateAccessToken = createAccessToken as ReturnType<typeof vi.fn>;
const mockCreateRefreshToken = createRefreshToken as ReturnType<typeof vi.fn>;
const mockVerifyRefreshToken = verifyRefreshToken as ReturnType<typeof vi.fn>;
const mockCreateAdminSession = createAdminSession as ReturnType<typeof vi.fn>;
const mockEnsureAdminSessionActive = ensureAdminSessionActive as ReturnType<typeof vi.fn>;
const mockRevokeAdminSession = revokeAdminSession as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateAdminSession.mockResolvedValue({ id: "session-1" });
  mockEnsureAdminSessionActive.mockResolvedValue({ id: "session-1" });
  mockRevokeAdminSession.mockResolvedValue({ loggedOutCurrent: true });
});

describe("registerUser", () => {
  const input = {
    name: "Jane",
    email: "jane@test.com",
    phone: "4165551234",
    password: "Pass123!",
  };

  it("registers a new user and returns tokens", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: "u1",
      name: "Jane",
      email: "jane@test.com",
      phone: "4165551234",
      role: "USER",
    });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const result = await registerUser(input);

    expect(result.user.email).toBe("jane@test.com");
    expect(result.user.phone).toBe("4165551234");
    expect(result.tokens.accessToken).toBe("access_tok");
    expect(result.tokens.refreshToken).toBe("refresh_tok");
    expect(hashPassword).toHaveBeenCalledWith("Pass123!");
    expect(mockCreateAdminSession).not.toHaveBeenCalled();
  });

  it("throws a generic duplicate message for duplicate email", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" });

    await expect(registerUser(input)).rejects.toThrow(
      "An account with those details already exists"
    );
  });
});

describe("loginUser", () => {
  it("returns user and tokens on valid user credentials", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      name: "Jane",
      email: "jane@test.com",
      phone: "4165551234",
      role: "USER",
      isActive: true,
      passwordHash: "hashed",
    });
    mockComparePassword.mockResolvedValue(true);
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const result = await loginUser("jane@test.com", "Pass123!");

    expect(result.user.id).toBe("u1");
    expect(result.user.phone).toBe("4165551234");
    expect(result.tokens.accessToken).toBe("access_tok");
    expect(mockCreateAdminSession).not.toHaveBeenCalled();
  });

  it("creates a tracked admin session for admin logins", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      name: "Harsh",
      email: "admin@test.com",
      phone: "4165550000",
      role: "ADMIN",
      isActive: true,
      passwordHash: "hashed",
    });
    mockComparePassword.mockResolvedValue(true);
    mockPrisma.refreshToken.create.mockResolvedValue({});
    mockCreateAdminSession.mockResolvedValue({ id: "admin-session-1" });

    const result = await loginUser("admin@test.com", "Pass123!", {
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
      deviceFingerprint: "device-1",
    });

    expect(result.user.role).toBe("ADMIN");
    expect(result.user.phone).toBe("4165550000");
    expect(mockCreateAdminSession).toHaveBeenCalledWith("admin-1", {
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
      deviceFingerprint: "device-1",
    });
    expect(mockCreateAccessToken).toHaveBeenCalledWith({
      userId: "admin-1",
      role: "ADMIN",
      sessionId: "admin-session-1",
    });
    expect(mockCreateRefreshToken).toHaveBeenCalledWith({
      userId: "admin-1",
      role: "ADMIN",
      sessionId: "admin-session-1",
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin-1",
        adminSessionId: "admin-session-1",
      }),
    });
  });
});

describe("logoutUser", () => {
  it("revokes all refresh tokens for a normal user", async () => {
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    await logoutUser("u1");

    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", isRevoked: false },
      data: { isRevoked: true },
    });
    expect(mockRevokeAdminSession).not.toHaveBeenCalled();
  });

  it("revokes the active admin session when a session id is present", async () => {
    await logoutUser("admin-1", "session-1");

    expect(mockRevokeAdminSession).toHaveBeenCalledWith(
      "admin-1",
      "session-1",
      "session-1"
    );
    expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe("refreshTokens", () => {
  it("rotates tokens successfully for a normal user", async () => {
    mockVerifyRefreshToken.mockReturnValue({ userId: "u1", role: "USER", tokenId: "rt-1" });
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "USER",
      isActive: true,
    });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const result = await refreshTokens("old_refresh_token");

    expect(result.accessToken).toBe("access_tok");
    expect(result.refreshToken).toBe("refresh_tok");
    expect(mockEnsureAdminSessionActive).not.toHaveBeenCalled();
  });

  it("verifies a live admin session during admin token refresh", async () => {
    mockVerifyRefreshToken.mockReturnValue({
      userId: "admin-1",
      role: "ADMIN",
      tokenId: "rt-1",
      sessionId: "admin-session-1",
    });
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      isActive: true,
    });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    await refreshTokens("old_refresh_token", {
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
      deviceFingerprint: "device-1",
    });

    expect(mockEnsureAdminSessionActive).toHaveBeenCalledWith("admin-1", "admin-session-1", {
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
      deviceFingerprint: "device-1",
    });
    expect(mockCreateAdminSession).not.toHaveBeenCalled();
  });

  it("creates an admin session during refresh when the legacy token has no session id", async () => {
    mockVerifyRefreshToken.mockReturnValue({
      userId: "admin-1",
      role: "ADMIN",
      tokenId: "rt-1",
    });
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      isActive: true,
    });
    mockPrisma.refreshToken.create.mockResolvedValue({});
    mockCreateAdminSession.mockResolvedValue({ id: "admin-session-2" });

    await refreshTokens("old_refresh_token", {
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
      deviceFingerprint: "device-2",
    });

    expect(mockCreateAdminSession).toHaveBeenCalledWith("admin-1", {
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
      deviceFingerprint: "device-2",
    });
    expect(mockCreateRefreshToken).toHaveBeenCalledWith({
      userId: "admin-1",
      role: "ADMIN",
      sessionId: "admin-session-2",
    });
  });
});

