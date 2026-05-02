/**
 * Portfolio controller.
 */

import { Request, Response, NextFunction } from "express";
import { paginatedResponse, parsePagination } from "../helpers/pagination";
import { getRequestAuditContext } from "../helpers/request-metadata";
import { AppError } from "../middlewares/error.middleware";
import { logAdminMutation } from "../services/admin-security.service";
import * as portfolioService from "../services/portfolio.service";
import type {
  CreatePortfolioFormInput,
  UpdatePortfolioFormInput,
} from "../validators/portfolio.validator";

interface AuditOptions {
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  riskLevel?: string;
}

function getUploadedFiles(req: Request) {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  return {
    imageFile: files?.image?.[0],
    videoFile: files?.video?.[0],
  };
}

async function auditPortfolioMutation(req: Request, options: AuditOptions) {
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
    console.error("Failed to record portfolio audit log", error);
  }
}

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as { page?: string; limit?: string });
    const { items, total } = await portfolioService.getAllPortfolio(skip, take);
    res.json(paginatedResponse(items, total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function getPublished(req: Request, res: Response, next: NextFunction) {
  try {
    const { skip, take, page, limit } = parsePagination(req.query as { page?: string; limit?: string });
    const { items, total } = await portfolioService.getPublishedPortfolio(skip, take);
    res.json(paginatedResponse(items, total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function getOne(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const item = await portfolioService.getPortfolioById(req.params.id);
    res.json(item);
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { imageFile, videoFile } = getUploadedFiles(req);

    if (!imageFile) {
      throw new AppError(400, "Image is required");
    }

    const data = req.body as CreatePortfolioFormInput;
    const item = await portfolioService.createPortfolioItem(
      data,
      req.user!.userId,
      imageFile,
      videoFile
    );

    await auditPortfolioMutation(req, {
      action: "portfolio.create",
      entityType: "portfolio",
      entityId: item.id,
      details: {
        isPublished: item.isPublished,
        hasVideo: !!item.videoUrl,
      },
      riskLevel: "medium",
    });

    res.status(201).json({ message: "Portfolio item created", item });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { imageFile, videoFile } = getUploadedFiles(req);
    const data = req.body as UpdatePortfolioFormInput;

    const item = await portfolioService.updatePortfolioItem(
      req.params.id,
      data,
      req.user!.userId,
      imageFile,
      videoFile
    );

    await auditPortfolioMutation(req, {
      action: "portfolio.update",
      entityType: "portfolio",
      entityId: item.id,
      details: {
        isPublished: item.isPublished,
        removedVideo: !!data.removeVideo && !videoFile,
        replacedImage: !!imageFile,
        replacedVideo: !!videoFile,
      },
      riskLevel: "medium",
    });

    res.json({ message: "Portfolio item updated", item });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    await portfolioService.deletePortfolioItem(req.params.id);

    await auditPortfolioMutation(req, {
      action: "portfolio.delete",
      entityType: "portfolio",
      entityId: req.params.id,
      riskLevel: "high",
    });

    res.json({ message: "Portfolio item deleted" });
  } catch (error) {
    next(error);
  }
}

export async function reorder(req: Request, res: Response, next: NextFunction) {
  try {
    const { items } = req.body as { items: { id: string; sortOrder: number }[] };
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError(400, "items array is required");
    }

    await portfolioService.updateSortOrders(items, req.user!.userId);

    await auditPortfolioMutation(req, {
      action: "portfolio.reorder",
      entityType: "portfolio_batch",
      details: {
        count: items.length,
        itemIds: items.map((item) => item.id),
      },
      riskLevel: "low",
    });

    res.json({ message: "Sort order updated" });
  } catch (error) {
    next(error);
  }
}

export async function togglePublish(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const item = await portfolioService.togglePublish(req.params.id, req.user!.userId);

    await auditPortfolioMutation(req, {
      action: "portfolio.publish.toggle",
      entityType: "portfolio",
      entityId: item.id,
      details: { isPublished: item.isPublished },
      riskLevel: "medium",
    });

    res.json({
      message: item.isPublished ? "Portfolio item published" : "Portfolio item unpublished",
      item,
    });
  } catch (error) {
    next(error);
  }
}
