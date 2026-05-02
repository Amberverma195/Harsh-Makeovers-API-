import { prisma } from "../config/prisma";
import type { Prisma } from "../generated/prisma/client";
import { comparePassword } from "../helpers/hash";
import { sendAdminSecurityAlertEmail } from "../helpers/email";
import type { RequestAuditContext, RequestMetadata } from "../helpers/request-metadata";
import { AppError } from "../middlewares/error.middleware";

const STEP_UP_WINDOW_MS = 10 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;
const WRITE_BURST_WINDOW_MS = 5 * 60 * 1000;
const WRITE_BURST_THRESHOLD = 20;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface AdminMutationInput {
  adminId: string;
  sessionId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  riskLevel?: string;
  audit: RequestAuditContext;
}

export async function createAdminSession(userId: string, metadata: RequestMetadata) {
  const previousSessions = await prisma.adminSession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const session = await prisma.adminSession.create({
    data: {
      userId,
      deviceFingerprint: metadata.deviceFingerprint,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      lastSeenAt: new Date(),
    },
  });

  if (previousSessions.length > 0) {
    const knownFingerprint =
      !!metadata.deviceFingerprint &&
      previousSessions.some((candidate) => candidate.deviceFingerprint === metadata.deviceFingerprint);
    const knownIp =
      !!metadata.ipAddress &&
      previousSessions.some((candidate) => candidate.ipAddress === metadata.ipAddress);

    if (metadata.deviceFingerprint && !knownFingerprint) {
      await sendSecurityAlert({
        adminId: userId,
        sessionId: session.id,
        action: "alert.new_device_fingerprint",
        metadata,
        details: {
          fingerprint: metadata.deviceFingerprint,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    }

    if (metadata.ipAddress && !knownIp) {
      await sendSecurityAlert({
        adminId: userId,
        sessionId: session.id,
        action: "alert.possible_location_change",
        metadata,
        details: {
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    }
  }

  return session;
}

export async function ensureAdminSessionActive(
  userId: string,
  sessionId: string,
  metadata: RequestMetadata
) {
  const session = await prisma.adminSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.userId !== userId || !session.isActive || session.revokedAt) {
    throw new AppError(401, "Admin session is no longer active");
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {};

  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    updateData.lastSeenAt = now;
  }

  if (metadata.userAgent && metadata.userAgent !== session.userAgent) {
    updateData.userAgent = metadata.userAgent;
  }

  if (metadata.deviceFingerprint && metadata.deviceFingerprint !== session.deviceFingerprint) {
    updateData.deviceFingerprint = metadata.deviceFingerprint;

    if (session.deviceFingerprint) {
      await sendSecurityAlert({
        adminId: userId,
        sessionId,
        action: "alert.session_fingerprint_changed",
        metadata,
        details: {
          previousFingerprint: session.deviceFingerprint,
          newFingerprint: metadata.deviceFingerprint,
          ipAddress: metadata.ipAddress,
        },
      });
    }
  }

  if (metadata.ipAddress && metadata.ipAddress !== session.ipAddress) {
    updateData.ipAddress = metadata.ipAddress;

    if (session.ipAddress) {
      await sendSecurityAlert({
        adminId: userId,
        sessionId,
        action: "alert.possible_location_change",
        metadata,
        details: {
          previousIpAddress: session.ipAddress,
          newIpAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    }
  }

  if (Object.keys(updateData).length === 0) {
    return session;
  }

  return prisma.adminSession.update({
    where: { id: sessionId },
    data: updateData,
  });
}

export async function stepUpAdminSession(
  userId: string,
  sessionId: string,
  password: string,
  audit?: RequestAuditContext
) {
  const session = await ensureAdminSessionActive(userId, sessionId, audit?.metadata ?? emptyMetadata());
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user) {
    throw new AppError(404, "Admin user not found");
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid password");
  }

  const elevatedUntil = new Date(Date.now() + STEP_UP_WINDOW_MS);
  const updated = await prisma.adminSession.update({
    where: { id: session.id },
    data: { elevatedUntil },
  });

  if (audit) {
    await logAdminMutation({
      adminId: userId,
      sessionId,
      action: "session.step_up",
      entityType: "admin_session",
      entityId: sessionId,
      details: { elevatedUntil: elevatedUntil.toISOString() },
      riskLevel: "medium",
      audit,
    });
  }

  return updated;
}

export async function revokeAdminSession(
  userId: string,
  sessionId: string,
  currentSessionId?: string | null
) {
  const session = await prisma.adminSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) {
    throw new AppError(404, "Admin session not found");
  }

  if (session.isActive && !session.revokedAt) {
    await prisma.adminSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        revokedAt: new Date(),
        elevatedUntil: null,
      },
    });
  }

  await prisma.refreshToken.updateMany({
    where: {
      adminSessionId: sessionId,
      isRevoked: false,
    },
    data: { isRevoked: true },
  });

  return { loggedOutCurrent: currentSessionId === sessionId };
}

export async function revokeAllAdminSessions(userId: string) {
  await prisma.adminSession.updateMany({
    where: {
      userId,
      isActive: true,
    },
    data: {
      isActive: false,
      revokedAt: new Date(),
      elevatedUntil: null,
    },
  });

  await prisma.refreshToken.updateMany({
    where: {
      userId,
      adminSessionId: { not: null },
      isRevoked: false,
    },
    data: { isRevoked: true },
  });
}

export async function getAdminSessions(userId: string) {
  return prisma.adminSession.findMany({
    where: { userId },
    select: {
      id: true,
      deviceFingerprint: true,
      userAgent: true,
      ipAddress: true,
      lastSeenAt: true,
      elevatedUntil: true,
      isActive: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ isActive: "desc" }, { lastSeenAt: "desc" }],
  });
}

export async function getAdminAuditLogs(userId: string, skip?: number, take?: number) {
  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where: { adminId: userId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.adminAuditLog.count({ where: { adminId: userId } }),
  ]);

  return { logs, total };
}

export async function logAdminMutation(input: AdminMutationInput) {
  await prisma.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      sessionId: input.sessionId || null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId || null,
      requestMethod: input.audit.requestMethod,
      requestPath: input.audit.requestPath,
      requestId: input.audit.requestId,
      ipAddress: input.audit.metadata.ipAddress,
      userAgent: input.audit.metadata.userAgent,
      deviceFingerprint: input.audit.metadata.deviceFingerprint,
      riskLevel: input.riskLevel || null,
      details: toJsonDetails(input.details),
    },
  });

  if (!WRITE_METHODS.has(input.audit.requestMethod) || input.action.startsWith("alert.")) {
    return;
  }

  await maybeDetectWriteBurst(input);
}

async function maybeDetectWriteBurst(input: AdminMutationInput) {
  const recentWriteCount = await prisma.adminAuditLog.count({
    where: {
      adminId: input.adminId,
      createdAt: { gte: new Date(Date.now() - WRITE_BURST_WINDOW_MS) },
      requestMethod: { in: Array.from(WRITE_METHODS) },
      action: { not: { startsWith: "alert." } },
    },
  });

  if (recentWriteCount < WRITE_BURST_THRESHOLD) {
    return;
  }

  await sendSecurityAlert({
    adminId: input.adminId,
    sessionId: input.sessionId || null,
    action: "alert.write_burst",
    metadata: input.audit.metadata,
    requestId: input.audit.requestId,
    details: {
      recentWriteCount,
      windowMinutes: WRITE_BURST_WINDOW_MS / 60_000,
      requestPath: input.audit.requestPath,
      requestMethod: input.audit.requestMethod,
    },
  });
}

async function sendSecurityAlert(options: {
  adminId: string;
  sessionId?: string | null;
  action: string;
  metadata: RequestMetadata;
  details: Record<string, unknown>;
  requestId?: string | null;
}) {
  const existing = await prisma.adminAuditLog.findFirst({
    where: {
      adminId: options.adminId,
      action: options.action,
      createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return;
  }

  await prisma.adminAuditLog.create({
    data: {
      adminId: options.adminId,
      sessionId: options.sessionId || null,
      action: options.action,
      entityType: "admin_session",
      entityId: options.sessionId || null,
      requestMethod: "ALERT",
      requestPath: "security:alert",
      requestId: options.requestId || null,
      ipAddress: options.metadata.ipAddress,
      userAgent: options.metadata.userAgent,
      deviceFingerprint: options.metadata.deviceFingerprint,
      riskLevel: "high",
      details: toJsonDetails(options.details),
    },
  });

  try {
    await sendAdminSecurityAlertEmail({
      title: titleForAlert(options.action),
      intro: introForAlert(options.action),
      details: formatAlertDetails(options.details),
    });
  } catch (error) {
    console.error("Failed to send admin security alert email", error);
  }
}

function toJsonDetails(details?: Record<string, unknown>) {
  if (!details) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue;
}

function titleForAlert(action: string) {
  switch (action) {
    case "alert.new_device_fingerprint":
      return "New admin device fingerprint detected";
    case "alert.session_fingerprint_changed":
      return "Admin session fingerprint changed";
    case "alert.possible_location_change":
      return "Admin IP change detected";
    case "alert.write_burst":
      return "Unusual admin write burst detected";
    default:
      return "Admin security alert";
  }
}

function introForAlert(action: string) {
  switch (action) {
    case "alert.new_device_fingerprint":
      return "An admin session was opened from a device fingerprint the system has not seen before.";
    case "alert.session_fingerprint_changed":
      return "An existing admin session started sending a different device fingerprint than before.";
    case "alert.possible_location_change":
      return "An admin session or login used a new IP address, which may indicate a location or network change.";
    case "alert.write_burst":
      return "The system detected an unusually high burst of admin write activity in a short period of time.";
    default:
      return "Review this admin security event to confirm it was expected.";
  }
}

function formatAlertDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details).map(([key, value]) => {
    if (value === null || value === undefined) {
      return [key, null] as const;
    }

    if (typeof value === "string" || typeof value === "number") {
      return [key, value] as const;
    }

    return [key, JSON.stringify(value)] as const;
  });

  return Object.fromEntries(entries);
}

function emptyMetadata(): RequestMetadata {
  return {
    ipAddress: null,
    userAgent: null,
    deviceFingerprint: null,
  };
}
