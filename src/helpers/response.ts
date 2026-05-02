import { Response } from "express";

interface SuccessPayload<T> {
  data: T;
  message?: string;
}

interface ErrorPayload {
  error: string;
  details?: { field: string; message: string }[];
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  message?: string
): void {
  const body: SuccessPayload<T> = { data };
  if (message) body.message = message;
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  error: string,
  statusCode = 500,
  details?: { field: string; message: string }[]
): void {
  const body: ErrorPayload = { error };
  if (details) body.details = details;
  res.status(statusCode).json(body);
}
