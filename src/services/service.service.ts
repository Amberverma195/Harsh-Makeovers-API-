/**
 * Service Service — Harsh Makeovers
 *
 * Handles fetching makeup/beauty services from the database.
 * "Service" here means the types of work Harsh offers
 * (Bridal Makeup, Hair Styling, Lashes, etc.) — not to be confused
 * with "service" as in "this file is a service layer file".
 *
 * Note: basePrice is intentionally EXCLUDED from the public response.
 * Prices are internal — they are NOT shown to customers on the website.
 */

import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error.middleware";

/**
 * Get all active services (public — shown on the website).
 *
 * Only returns services where isActive = true.
 * Excludes basePrice (internal only) and timestamps (not needed by frontend).
 * Sorted alphabetically by name.
 */
export async function getAllActiveServices() {
  return prisma.service.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      durationMinutes: true,
      requiresManualQuote: true,
      // basePrice is NOT included — it's for admin/internal use only
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Get a single service by its ID.
 *
 * Used when the frontend needs details about one specific service
 * (e.g. when someone clicks on a service to book it).
 * Throws 404 if the service doesn't exist.
 */
export async function getServiceById(id: string) {
  const service = await prisma.service.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      durationMinutes: true,
      requiresManualQuote: true,
      isActive: true,
    },
  });

  if (!service) {
    throw new AppError(404, "Service not found");
  }

  return service;
}
