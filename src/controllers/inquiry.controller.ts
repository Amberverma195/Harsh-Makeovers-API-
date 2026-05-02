/**
 * Inquiry Controller — Harsh Makeovers
 *
 * Handles contact/class/large-group inquiry requests.
 *
 * Routes:
 *   POST /inquiries    → create (requires auth)
 *   GET  /inquiries/my → getUserInquiries (requires auth)
 */

import { Request, Response, NextFunction } from "express";
import * as inquiryService from "../services/inquiry.service";

/** POST /inquiries — Submit an inquiry (requires auth) */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const inquiry = await inquiryService.createContactInquiry({
      ...req.body,
      userId: req.user!.userId,
    });

    res.status(201).json({ message: "Inquiry submitted", inquiry });
  } catch (error) {
    next(error);
  }
}

/** GET /inquiries/my — Get all inquiries for the logged-in user */
export async function getUserInquiries(req: Request, res: Response, next: NextFunction) {
  try {
    const inquiries = await inquiryService.getUserInquiries(req.user!.userId);
    res.json(inquiries);
  } catch (error) {
    next(error);
  }
}