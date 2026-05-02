/**
 * Service Controller — Harsh Makeovers
 *
 * Handles requests for the services Harsh offers (Bridal, Party, Hair, etc.).
 * Both endpoints are public — no login needed.
 *
 * Routes:
 *   GET /services      → getAll (list all active services)
 *   GET /services/:id  → getOne (single service details)
 */

import { Request, Response, NextFunction } from "express";
import * as serviceService from "../services/service.service";

/** GET /services — List all active services (public) */
export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const services = await serviceService.getAllActiveServices();
    res.json(services);
  } catch (error) {
    next(error);
  }
}

/** GET /services/:id — Get a single service by ID (public) */
export async function getOne(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const service = await serviceService.getServiceById(req.params.id);
    res.json(service);
  } catch (error) {
    next(error);
  }
}
