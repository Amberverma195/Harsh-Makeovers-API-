import { Request } from "express";

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
}

export interface RequestAuditContext {
  requestId: string | null;
  requestMethod: string;
  requestPath: string;
  metadata: RequestMetadata;
}

export function getRequestMetadata(req: Request): RequestMetadata {
  return {
    ipAddress: sanitizeValue(req.ip),
    userAgent: sanitizeValue(req.get("user-agent"), 512),
    deviceFingerprint: sanitizeValue(req.get("x-device-fingerprint"), 128),
  };
}

export function getRequestAuditContext(req: Request): RequestAuditContext {
  return {
    requestId: sanitizeValue((req as Request & { requestId?: string }).requestId, 128),
    requestMethod: req.method,
    requestPath: sanitizeValue(req.originalUrl || req.path, 512) || req.path,
    metadata: getRequestMetadata(req),
  };
}

function sanitizeValue(value: string | undefined | null, maxLength = 255): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}