/**
 * Zod validation middleware for request bodies and query strings.
 */

import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  return buildValidator(schema, "body");
}

export function validateQuery(schema: ZodSchema) {
  return buildValidator(schema, "query");
}

export function validateParams(schema: ZodSchema) {
  return buildValidator(schema, "params");
}

function buildValidator(schema: ZodSchema, target: "body" | "query" | "params") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      res.status(400).json({ error: "Validation failed", details: errors });
      return;
    }

    Object.defineProperty(req, target, {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    next();
  };
}
