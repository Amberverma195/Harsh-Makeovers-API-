/**
 * Auth controller.
 */

import { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service";
import { setAuthCookies, clearAuthCookies } from "../helpers/cookies";
import { getRequestMetadata } from "../helpers/request-metadata";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { user, tokens } = await authService.registerUser(req.body, getRequestMetadata(req));

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    res.status(201).json({ message: "Account created", user });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const { user, tokens } = await authService.loginUser(email, password, getRequestMetadata(req));

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({ message: "Login successful", user });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logoutUser(req.user!.userId, req.user?.sessionId);

    clearAuthCookies(res);

    res.json({ message: "Logged out" });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const oldToken = req.cookies?.refresh_token;

    if (!oldToken) {
      res.status(401).json({ error: "No refresh token provided" });
      return;
    }

    const tokens = await authService.refreshTokens(oldToken, getRequestMetadata(req));

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({ message: "Tokens refreshed" });
  } catch (error) {
    next(error);
  }
}