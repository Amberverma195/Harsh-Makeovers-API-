/**
 * Portfolio validators.
 */

import { z } from "zod";
import { safeString } from "./helpers";

const portfolioCategoryEnum = z.enum([
  "BRIDAL",
  "NON_BRIDAL",
  "PARTY",
  "HAIR",
  "LASHES",
]);

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);

const optionalSafeString = (opts?: { min?: number; max?: number }) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    return value.trim() === "" ? undefined : value;
  }, safeString(opts).optional());

const optionalInstagramUrl = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value.trim() === "" ? undefined : value;
}, z
  .string()
  .trim()
  .url("Invalid Instagram URL")
  .refine(isInstagramUrl, "Must be a secure Instagram URL")
  .transform((value) => new URL(value).toString())
  .optional());

const formBoolean = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return value;
}, z.boolean());

const formSortOrder = z.preprocess((value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}, z.number().int().min(0));

export const createPortfolioSchema = z.object({
  modelName: safeString({ min: 1, max: 100 }),
  makeupType: safeString({ min: 1, max: 100 }),
  description: safeString({ max: 500 }).optional(),
  category: portfolioCategoryEnum,
  imageUrl: z.string().trim().url("Invalid image URL"),
  videoUrl: z.string().trim().url("Invalid video URL").optional(),
  instagramUrl: optionalInstagramUrl,
  isPublished: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

export const updatePortfolioSchema = createPortfolioSchema.partial();

const sharedPortfolioFormSchema = z.object({
  modelName: safeString({ min: 1, max: 100 }),
  makeupType: safeString({ min: 1, max: 100 }),
  description: optionalSafeString({ max: 500 }),
  category: portfolioCategoryEnum,
  instagramUrl: optionalInstagramUrl,
  isPublished: formBoolean.default(false),
  sortOrder: formSortOrder.default(0),
});

export const createPortfolioFormSchema = sharedPortfolioFormSchema;

export const updatePortfolioFormSchema = z.object({
  modelName: optionalSafeString({ min: 1, max: 100 }),
  makeupType: optionalSafeString({ min: 1, max: 100 }),
  description: optionalSafeString({ max: 500 }),
  category: portfolioCategoryEnum.optional(),
  instagramUrl: optionalInstagramUrl,
  isPublished: formBoolean.optional(),
  removeVideo: formBoolean.optional(),
  sortOrder: formSortOrder.optional(),
});

export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>;
export type UpdatePortfolioInput = z.infer<typeof updatePortfolioSchema>;
export type CreatePortfolioFormInput = z.infer<typeof createPortfolioFormSchema>;
export type UpdatePortfolioFormInput = z.infer<typeof updatePortfolioFormSchema>;

function isInstagramUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}
