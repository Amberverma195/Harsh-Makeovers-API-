/**
 * Supabase Storage Helper â€” Harsh Makeovers
 *
 * Handles all file operations for portfolio media:
 *   - uploadFile:  uploads an image or video to Supabase Storage
 *   - deleteFile:  removes a file from Supabase Storage
 *   - getPublicUrl: returns the public URL for a stored file
 *
 * Files are stored in the "portfolio" bucket with this structure:
 *   portfolio/images/<uuid>-<original-name>.jpg
 *   portfolio/videos/<uuid>-<original-name>.mp4
 *
 * Constraints (from PRD):
 *   Images: PNG, JPG, JPEG only â€” max 5 MB
 *   Videos: MP4 only â€” max 50 MB
 */

import { supabase } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import crypto from "crypto";

const BUCKET = "portfolio";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;   // 5 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;  // 50 MB

/**
 * Upload a file to Supabase Storage.
 *
 * @param file     - The multer file object (contains buffer, mimetype, originalname, size)
 * @param folder   - "images" or "videos" â€” determines the subfolder in the bucket
 * @returns        The public URL of the uploaded file
 */
export async function uploadFile(
  file: Express.Multer.File,
  folder: "images" | "videos"
): Promise<string> {
  if (folder === "images") {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new AppError(400, "Only PNG, JPG, JPEG, and WebP images are allowed");
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new AppError(400, "Image must be under 5 MB");
    }
  }

  if (folder === "videos") {
    if (!ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
      throw new AppError(400, "Only MP4 videos are allowed");
    }
    if (file.size > MAX_VIDEO_SIZE) {
      throw new AppError(400, "Video must be under 50 MB");
    }
  }

  // Generate a unique filename to prevent collisions:
  // e.g. "images/a1b2c3d4-bridal-look.jpg"
  const uniqueId = crypto.randomUUID();
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${folder}/${uniqueId}-${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw new AppError(500, `Storage upload failed: ${error.message}`);
  }

  return getPublicUrl(filePath);
}

/**
 * Delete a file from Supabase Storage.
 *
 * Extracts the storage path from a full public URL, then removes the file.
 * Silently succeeds if the file doesn't exist (already deleted).
 *
 * @param publicUrl - The full public URL of the file to delete
 */
export async function deleteFile(publicUrl: string): Promise<void> {
  const path = extractPathFromUrl(publicUrl);
  if (!path) return;

  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) {
    console.error(`Failed to delete file ${path}:`, error.message);
  }
}

/**
 * Get the public URL for a file stored in Supabase.
 *
 * @param filePath - The path within the bucket (e.g. "images/abc-photo.jpg")
 * @returns        The full public URL
 */
export function getPublicUrl(filePath: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Extract the storage path from a full Supabase public URL.
 *
 * A public URL looks like:
 *   https://xxx.supabase.co/storage/v1/object/public/portfolio/images/abc.jpg
 *
 * We need to extract: "images/abc.jpg"
 */
function extractPathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

