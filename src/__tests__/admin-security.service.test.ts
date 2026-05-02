import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/prisma", () => ({
  prisma: {
    adminSession: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    adminAuditLog: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    refreshToken: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../helpers/hash", () => ({
  comparePassword: vi.fn(),
}));

vi.mock("../helpers/email", () => ({
  sendAdminSecurityAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../config/prisma";
import { comparePassword } from "../helpers/hash";
import { sendAdminSecurityAlertEmail } from "../helpers/email";
import {
  createAdminSession,
  ensureAdminSessionActive,
  logAdminMutation,
  revokeAdminSession,
  stepUpAdminSession,
} from "../services/admin-security.service";

const mockPrisma = prisma as unknown as {
  adminSession: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  adminAuditLog: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  refreshToken: {
    updateMany: ReturnType<typeof vi.fn>;
  };
};
const mockComparePassword = comparePassword as ReturnType<typeof vi.fn>;
const mockSendAdminSecurityAlertEmail = sendAdminSecurityAlertEmail as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.adminAuditLog.count.mockResolvedValue(0);
  mockPrisma.adminAuditLog.findFirst.mockResolvedValue(null);
  mockPrisma.adminAuditLog.create.mockResolvedValue({});
  mockSendAdminSecurityAlertEmail.mockResolvedValue(undefined);
});

describe("createAdminSession", () => {
  it("creates a tracked admin session using request metadata", async () => {
    const lastSeenAt = new Date();
    mockPrisma.adminSession.findMany.mockResolvedValue([]);
    mockPrisma.adminSession.create.mockResolvedValue({
      id: "session-1",
      userId: "admin-1",
      deviceFingerprint: "device-1",
      userAgent: "Vitest",
      ipAddress: "127.0.0.1",
      lastSeenAt,
    });

    const session = await createAdminSession("admin-1", {
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
      deviceFingerprint: "device-1",
    });

    expect(session.id).toBe("session-1");
    expect(mockPrisma.adminSession.create).toHaveBeenCalledWith({
      data: {
        userId: "admin-1",
        deviceFingerprint: "device-1",
        userAgent: "Vitest",
        ipAddress: "127.0.0.1",
        lastSeenAt: expect.any(Date),
      },
    });
    expect(mockSendAdminSecurityAlertEmail).not.toHaveBeenCalled();
  });
});

describe("ensureAdminSessionActive", () => {
  it("rejects inactive sessions", async () => {
    mockPrisma.adminSession.findUnique.mockResolvedValue({
      id: "session-1",
      userId: "admin-1",
      isActive: false,
      revokedAt: null,
      lastSeenAt: new Date(),
      userAgent: "Vitest",
      ipAddress: "127.0.0.1",
      deviceFingerprint: "device-1",
    });

    await expect(
      ensureAdminSessionActive("admin-1", "session-1", {
        ipAddress: "127.0.0.1",
        userAgent: "Vitest",
        deviceFingerprint: "device-1",
      })
    ).rejects.toThrow("Admin session is no longer active");
  });
});

describe("stepUpAdminSession", () => {
  it("extends the session with an elevated window after password confirmation", async () => {
    mockPrisma.adminSession.findUnique.mockResolvedValue({
      id: "session-1",
      userId: "admin-1",
      isActive: true,
      revokedAt: null,
      elevatedUntil: null,
      lastSeenAt: new Date(),
      userAgent: "Vitest",
      ipAddress: "127.0.0.1",
      deviceFingerprint: "device-1",
    });
    mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: "hashed" });
    mockComparePassword.mockResolvedValue(true);
    mockPrisma.adminSession.update.mockResolvedValue({
      id: "session-1",
      elevatedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });

    const session = await stepUpAdminSession("admin-1", "session-1", "Pass123!", {
      requestId: "req-1",
      requestMethod: "POST",
      requestPath: "/api/v1/admin/security/step-up",
      metadata: {
        ipAddress: "127.0.0.1",
        userAgent: "Vitest",
        deviceFingerprint: "device-1",
      },
    });

    expect(mockComparePassword).toHaveBeenCalledWith("Pass123!", "hashed");
    expect(mockPrisma.adminSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { elevatedUntil: expect.any(Date) },
    });
    expect(session.elevatedUntil).toBeInstanceOf(Date);
    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalled();
  });
});

describe("revokeAdminSession", () => {
  it("revokes the session and any refresh tokens attached to it", async () => {
    mockPrisma.adminSession.findUnique.mockResolvedValue({
      id: "session-1",
      userId: "admin-1",
      isActive: true,
      revokedAt: null,
    });
    mockPrisma.adminSession.update.mockResolvedValue({});
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    const result = await revokeAdminSession("admin-1", "session-1", "session-2");

    expect(result.loggedOutCurrent).toBe(false);
    expect(mockPrisma.adminSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        isActive: false,
        revokedAt: expect.any(Date),
        elevatedUntil: null,
      },
    });
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        adminSessionId: "session-1",
        isRevoked: false,
      },
      data: { isRevoked: true },
    });
  });
});

describe("logAdminMutation", () => {
  it("sends an alert when write activity crosses the burst threshold", async () => {
    mockPrisma.adminAuditLog.count.mockResolvedValue(20);

    await logAdminMutation({
      adminId: "admin-1",
      sessionId: "session-1",
      action: "portfolio.delete",
      entityType: "portfolio",
      entityId: "portfolio-1",
      riskLevel: "high",
      details: { message: "deleted" },
      audit: {
        requestId: "req-1",
        requestMethod: "DELETE",
        requestPath: "/api/v1/admin/portfolio/portfolio-1",
        metadata: {
          ipAddress: "127.0.0.1",
          userAgent: "Vitest",
          deviceFingerprint: "device-1",
        },
      },
    });

    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.adminAuditLog.findFirst).toHaveBeenCalled();
    expect(mockSendAdminSecurityAlertEmail).toHaveBeenCalledTimes(1);
  });
});
