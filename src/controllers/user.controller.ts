/**
 * User Controller — Harsh Makeovers
 *
 * Handles user profile actions (viewing and updating own account).
 * Both routes require authentication.
 *
 * Routes:
 *   GET /users/me     → getMe (get current logged-in user's profile)
 *   PUT /users/update → updateMe (update own profile — name, phone)
 */

import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error.middleware";

/** GET /users/me — Get the logged-in user's profile */
export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
}

/** PUT /users/update — Update the logged-in user's profile (name, phone) */
export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, phone } = req.body as { name?: string; phone?: string | null };

    const data: { name?: string; phone?: string | null } = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;

    if (Object.keys(data).length === 0) {
      throw new AppError(400, "No fields to update");
    }

    if (data.phone) {
      const phoneTaken = await prisma.user.findFirst({
        where: { phone: data.phone, id: { not: req.user!.userId } },
      });
      if (phoneTaken) {
        throw new AppError(409, "Phone number is already in use");
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
      },
    });

    res.json({ message: "Profile updated", user });
  } catch (error) {
    next(error);
  }
}
