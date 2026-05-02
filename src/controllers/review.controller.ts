/**
 * Review Controller — Harsh Makeovers
 *
 * Handles customer review requests.
 *
 * Routes:
 *   POST /reviews          → create (requires auth, completed booking only)
 *   GET  /reviews/approved → getApproved (public — shown on the website)
 */

import { Request, Response, NextFunction } from "express";
import * as reviewService from "../services/review.service";
import { parsePagination, paginatedResponse } from "../helpers/pagination";

/** POST /reviews — Submit a review for a completed booking (requires auth) */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const review = await reviewService.createReview({
      ...req.body,
      userId: req.user!.userId,
    });

    res.status(201).json({ message: "Review submitted", review });
  } catch (error) {
    next(error);
  }
}

/** GET /reviews/approved — Get all approved reviews (public, paginated) */
export async function getApproved(req: Request, res: Response, next: NextFunction) {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as { page?: string; limit?: string });
    const { reviews, total } = await reviewService.getApprovedReviews(skip, take);
    res.json(paginatedResponse(reviews, total, page, limit));
  } catch (error) {
    next(error);
  }
}

/** GET /admin/reviews — Get all reviews including pending/rejected (admin) */
export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as { page?: string; limit?: string });
    const { reviews, total } = await reviewService.getAllReviews(skip, take);
    res.json(paginatedResponse(reviews, total, page, limit));
  } catch (error) {
    next(error);
  }
}
