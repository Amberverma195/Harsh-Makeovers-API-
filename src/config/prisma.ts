/**
 * Prisma Client Setup — Harsh Makeovers
 *
 * This file creates a single shared database connection (Prisma Client)
 * that the entire app uses to talk to PostgreSQL.
 *
 * Why not just do `new PrismaClient()` everywhere?
 *   - In development, the server restarts often (hot reload).
 *   - Each restart would create a NEW database connection, and the old ones pile up.
 *   - By storing Prisma on `globalThis`, we reuse the same connection across restarts.
 *   - In production, this isn't needed — the server starts once and stays running.
 *
 * Prisma v7 requires a driver adapter (PrismaPg) instead of the old Rust engine.
 *
 * How to use in other files:
 *   import { prisma } from "../config/prisma";
 *   const users = await prisma.user.findMany();
 */

import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
