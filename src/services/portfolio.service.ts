/**
 * Portfolio Service - Harsh Makeovers
 *
 * Manages the portfolio gallery - the showcase of past work displayed on the website.
 * Each portfolio item represents one piece of work (e.g. a bridal look, hair styling, etc.)
 *
 * Public functions (no login needed):
 *   - getPublishedPortfolio: returns all published items for the website gallery
 *
 * Admin functions (need admin login):
 *   - createPortfolioItem: add a new portfolio entry
 *   - updatePortfolioItem: edit an existing entry
 *   - deletePortfolioItem: remove an entry
 *   - togglePublish: show/hide an item on the public website
 *
 * Each item tracks who created and last updated it (for audit purposes).
 */

import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error.middleware";
import { PortfolioCategory } from "../generated/prisma/client.js";
import { uploadFile, deleteFile } from "../helpers/storage";

// Shape of the text data for creating a portfolio item (files handled separately)
interface PortfolioData {
  modelName: string;
  makeupType: string;
  description?: string;
  category: PortfolioCategory;
  instagramUrl?: string;
  isPublished?: boolean;
  sortOrder?: number;
}

// Shape for updates - all fields optional, plus optional new files
interface PortfolioUpdateData {
  modelName?: string;
  makeupType?: string;
  description?: string;
  category?: PortfolioCategory;
  instagramUrl?: string;
  isPublished?: boolean;
  removeVideo?: boolean;
  sortOrder?: number;
}

/**
 * Get all published portfolio items (public - shown on the website).
 *
 * Only returns items where isPublished = true.
 * Sorted by sortOrder (lowest first), so admin controls the display order.
 */
export async function getAllPortfolio(skip?: number, take?: number) {
  const [items, total] = await Promise.all([
    prisma.portfolio.findMany({
      orderBy: { sortOrder: "asc" },
      skip,
      take,
    }),
    prisma.portfolio.count(),
  ]);
  return { items, total };
}

export async function getPublishedPortfolio(skip?: number, take?: number) {
  const [items, total] = await Promise.all([
    prisma.portfolio.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        modelName: true,
        makeupType: true,
        description: true,
        category: true,
        imageUrl: true,
        videoUrl: true,
        instagramUrl: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: "asc" },
      skip,
      take,
    }),
    prisma.portfolio.count({ where: { isPublished: true } }),
  ]);

  return { items, total };
}

/**
 * Get a single published portfolio item by ID (public).
 * Throws 404 if the item doesn't exist or isn't published.
 */
export async function getPortfolioById(id: string) {
  const item = await prisma.portfolio.findFirst({
    where: {
      id,
      isPublished: true,
    },
    select: {
      id: true,
      modelName: true,
      makeupType: true,
      description: true,
      category: true,
      imageUrl: true,
      videoUrl: true,
      instagramUrl: true,
      sortOrder: true,
    },
  });

  if (!item) {
    throw new AppError(404, "Portfolio item not found");
  }

  return item;
}

/**
 * Add a new portfolio item with file uploads (admin only).
 *
 * Uploads the image (required) and video (optional) to Supabase Storage,
 * then saves the returned public URLs in the database.
 */
export async function createPortfolioItem(
  data: PortfolioData,
  adminId: string,
  imageFile: Express.Multer.File,
  videoFile?: Express.Multer.File
) {
  const imageUrl = await uploadFile(imageFile, "images");

  let videoUrl: string | undefined;
  if (videoFile) {
    videoUrl = await uploadFile(videoFile, "videos");
  }

  return prisma.portfolio.create({
    data: {
      ...data,
      imageUrl,
      videoUrl,
      createdById: adminId,
      updatedById: adminId,
    },
  });
}

/**
 * Update an existing portfolio item (admin only).
 *
 * Only the fields provided will be changed (partial update).
 * If a new image or video is uploaded, the old file is deleted from storage
 * and replaced with the new one.
 */
export async function updatePortfolioItem(
  id: string,
  data: PortfolioUpdateData,
  adminId: string,
  imageFile?: Express.Multer.File,
  videoFile?: Express.Multer.File
) {
  const item = await prisma.portfolio.findUnique({ where: { id } });
  if (!item) {
    throw new AppError(404, "Portfolio item not found");
  }

  const { removeVideo, ...fields } = data;
  const updateData: Record<string, unknown> = {
    ...fields,
    updatedById: adminId,
  };

  // If a new image is uploaded, delete the old one and upload the new one
  if (imageFile) {
    await deleteFile(item.imageUrl);
    updateData.imageUrl = await uploadFile(imageFile, "images");
  }

  // If a new video is uploaded, delete the old one (if it exists) and upload the new one
  if (videoFile) {
    if (item.videoUrl) {
      await deleteFile(item.videoUrl);
    }
    updateData.videoUrl = await uploadFile(videoFile, "videos");
  } else if (removeVideo && item.videoUrl) {
    await deleteFile(item.videoUrl);
    updateData.videoUrl = null;
  }

  return prisma.portfolio.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Delete a portfolio item permanently (admin only).
 * Also removes the associated image and video files from Supabase Storage.
 */
export async function deletePortfolioItem(id: string) {
  const item = await prisma.portfolio.findUnique({ where: { id } });
  if (!item) {
    throw new AppError(404, "Portfolio item not found");
  }

  // Delete files from storage first, then remove the DB record
  await deleteFile(item.imageUrl);
  if (item.videoUrl) {
    await deleteFile(item.videoUrl);
  }

  await prisma.portfolio.delete({ where: { id } });
}

/**
 * Toggle publish status (admin only).
 *
 * If the item is currently published -> unpublish it (hide from website).
 * If the item is currently unpublished -> publish it (show on website).
 *
 * This lets admin quickly show/hide portfolio items without deleting them.
 */
export async function updateSortOrders(items: { id: string; sortOrder: number }[], adminId: string) {
  await prisma.$transaction(
    items.map((item) =>
      prisma.portfolio.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder, updatedById: adminId },
      })
    )
  );
}

export async function togglePublish(id: string, adminId: string) {
  const item = await prisma.portfolio.findUnique({ where: { id } });
  if (!item) {
    throw new AppError(404, "Portfolio item not found");
  }

  return prisma.portfolio.update({
    where: { id },
    data: {
      isPublished: !item.isPublished, // Flip: true -> false, false -> true
      updatedById: adminId,
    },
  });
}