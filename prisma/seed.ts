/**
 * Database Seed Script — Harsh Makeovers
 *
 * Populates the database with initial data needed to run the app:
 *   1. A default admin account (used to log in to the admin panel)
 *   2. The core service catalog (Bridal, Non-Bridal, Party, Hair, Lashes)
 *
 * Safe to run multiple times — skips records that already exist.
 *
 * Run with:  npx prisma db seed
 */

import "dotenv/config";
import { PrismaClient, UserRole, ServiceCategory } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const adminName = process.env.ADMIN_SEED_NAME;
const adminEmail = process.env.ADMIN_SEED_EMAIL;
const adminPassword = process.env.ADMIN_SEED_PASSWORD;

async function main() {
  // ─── 1. Admin Account ───────────────────────────────────────────────
  // These credentials are loaded from the environment.
  if (!adminName || !adminEmail || !adminPassword) {
    throw new Error(
      "ADMIN_SEED_NAME, ADMIN_SEED_EMAIL, and ADMIN_SEED_PASSWORD must be set before running the seed script"
    );
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    // Salt rounds = 10 (good balance of security and speed)
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        passwordHash: hashedPassword,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    console.log("Admin user created");
  } else {
    console.log("Admin user already exists");
  }

  // ─── 2. Service Catalog ─────────────────────────────────────────────
  // Each service has a base price (CAD) and estimated duration (minutes).
  // These can be updated later from the admin panel.
  const services = [
    {
      name: "Bridal Makeup",
      category: ServiceCategory.BRIDAL,
      description: "Full bridal makeup service",
      durationMinutes: 150, // ~2.5 hours
      basePrice: 250,
      isActive: true,
      requiresManualQuote: false,
    },
    {
      name: "Non-Bridal Makeup",
      category: ServiceCategory.NON_BRIDAL,
      description: "Elegant non-bridal makeup service",
      durationMinutes: 120, // 2 hours
      basePrice: 120,
      isActive: true,
      requiresManualQuote: false,
    },
    {
      name: "Party Makeup",
      category: ServiceCategory.PARTY,
      description: "Party/event makeup service",
      durationMinutes: 90, // 1.5 hours
      basePrice: 90,
      isActive: true,
      requiresManualQuote: false,
    },
    {
      name: "Hair Styling",
      category: ServiceCategory.HAIR,
      description: "Hair styling service",
      durationMinutes: 60, // 1 hour
      basePrice: 60,
      isActive: true,
      requiresManualQuote: false,
    },
    {
      name: "Lashes",
      category: ServiceCategory.LASHES,
      description: "Lash styling / lash enhancement service",
      durationMinutes: 30, // 30 minutes
      basePrice: 40,
      isActive: true,
      requiresManualQuote: false,
    },
  ];

  // Insert each service only if it doesn't already exist (matched by name)
  for (const service of services) {
    const existingService = await prisma.service.findFirst({
      where: {
        name: service.name,
      },
    });

    if (!existingService) {
      await prisma.service.create({ data: service });
      console.log(`Service created: ${service.name}`);
    } else {
      console.log(`Service already exists: ${service.name}`);
    }
  }
}

// ─── Execute & Cleanup ─────────────────────────────────────────────────
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

