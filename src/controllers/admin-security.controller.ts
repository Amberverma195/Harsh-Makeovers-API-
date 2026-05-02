import { NextFunction, Request, Response } from "express";
import { clearAuthCookies } from "../helpers/cookies";
import { parsePagination, paginatedResponse } from "../helpers/pagination";
import { getRequestAuditContext } from "../helpers/request-metadata";
import type { AdminStepUpInput } from "../validators/admin-security.validator";
import {
  getAdminAuditLogs,
  getAdminSessions,
  logAdminMutation,
  revokeAdminSession,
  revokeAllAdminSessions,
  stepUpAdminSession,
} from "../services/admin-security.service";

interface AuditOptions {
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  riskLevel?: string;
}

async function auditSecurityMutation(req: Request<any, any, any, any>, options: AuditOptions) {
  if (!req.user?.userId) {
    return;
  }

  try {
    await logAdminMutation({
      adminId: req.user.userId,
      sessionId: req.user.sessionId,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId,
      details: options.details,
      riskLevel: options.riskLevel,
      audit: getRequestAuditContext(req),
    });
  } catch (error) {
    console.error("Failed to record admin security audit log", error);
  }
}

export async function getSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await getAdminSessions(req.user!.userId);
    res.json({
      currentSessionId: req.user?.sessionId || null,
      sessions,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as { page?: string; limit?: string });
    const { logs, total } = await getAdminAuditLogs(req.user!.userId, skip, take);
    res.json(paginatedResponse(logs, total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function stepUp(
  req: Request<Record<string, never>, unknown, AdminStepUpInput>,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await stepUpAdminSession(
      req.user!.userId,
      req.user!.sessionId!,
      req.body.password,
      getRequestAuditContext(req)
    );

    res.json({
      message: "Step-up authentication granted",
      elevatedUntil: session.elevatedUntil,
    });
  } catch (error) {
    next(error);
  }
}

export async function revokeSession(req: Request<{ sessionId: string }>, res: Response, next: NextFunction) {
  try {
    const result = await revokeAdminSession(
      req.user!.userId,
      req.params.sessionId,
      req.user?.sessionId
    );

    await auditSecurityMutation(req, {
      action: "session.revoke",
      entityType: "admin_session",
      entityId: req.params.sessionId,
      details: { loggedOutCurrent: result.loggedOutCurrent },
      riskLevel: "high",
    });

    if (result.loggedOutCurrent) {
      clearAuthCookies(res);
    }

    res.json({
      message: result.loggedOutCurrent ? "Current admin session revoked" : "Admin session revoked",
      loggedOut: result.loggedOutCurrent,
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutAll(req: Request, res: Response, next: NextFunction) {
  try {
    await revokeAllAdminSessions(req.user!.userId);

    await auditSecurityMutation(req, {
      action: "session.logout_all",
      entityType: "admin_session",
      entityId: req.user?.sessionId,
      riskLevel: "high",
    });

    clearAuthCookies(res);
    res.json({ message: "All admin sessions logged out", loggedOut: true });
  } catch (error) {
    next(error);
  }
}
