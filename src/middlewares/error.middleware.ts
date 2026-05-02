import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

interface PrismaError extends Error {
  code?: string;
  meta?: { target?: string[] };
}

function isPrismaError(err: unknown): err is PrismaError {
  return (
    err instanceof Error &&
    "code" in err &&
    typeof (err as PrismaError).code === "string"
  );
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (isPrismaError(err)) {
    switch (err.code) {
      case "P2002": {
        const fields = err.meta?.target?.join(", ") || "field";
        res.status(409).json({ error: `Duplicate value for ${fields}` });
        return;
      }
      case "P2025":
        res.status(404).json({ error: "Record not found" });
        return;
      case "P2021":
        res.status(503).json({
          error: "Database schema is out of date. Run the pending Prisma migrations and try again.",
        });
        return;
      case "P2034":
        res.status(409).json({
          error: "That time slot was just taken. Please choose another one.",
        });
        return;
    }
  }

  const requestId = (req as Request & { requestId?: string }).requestId;
  console.error(`[${requestId || "no-id"}] Unhandled error:`, err);

  res.status(500).json({
    error:
      env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
}
