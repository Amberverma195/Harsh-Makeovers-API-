import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import crypto from "crypto";

import { env } from "./config/env";
import { csrfProtection } from "./middlewares/csrf.middleware";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/users.routes";
import serviceRoutes from "./routes/services.routes";
import bookingRoutes from "./routes/bookings.routes";
import reviewRoutes from "./routes/reviews.routes";
import portfolioRoutes from "./routes/portfolio.routes";
import inquiryRoutes from "./routes/inquiries.routes";
import adminRoutes from "./routes/admin.routes";

import { prisma } from "./config/prisma";
import { errorHandler } from "./middlewares/error.middleware";

const app = express();
const PORT = env.PORT;
const IS_PRODUCTION = env.NODE_ENV === "production";

if (IS_PRODUCTION) {
  app.set("trust proxy", 1);
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const id = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  (req as Request & { requestId: string }).requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: IS_PRODUCTION ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }) as unknown as express.RequestHandler
);

app.use(morgan(IS_PRODUCTION ? "combined" : "dev") as unknown as express.RequestHandler);

const allowedOrigins: string[] = [env.FRONTEND_URL];
if (env.ALLOWED_ORIGINS) {
  allowedOrigins.push(
    ...env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "X-Requested-With", "X-Device-Fingerprint"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 86400,
  }) as unknown as express.RequestHandler
);

const isAdminApiRequest = (req: Request) =>
  req.path === "/api/v1/admin" || req.path.startsWith("/api/v1/admin/");

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  statusCode: 429,
  skip: (req) => !IS_PRODUCTION || isAdminApiRequest(req),
  message: { error: "Too many requests, please try again later" },
}) as unknown as express.RequestHandler;

app.use(globalLimiter);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

app.use(csrfProtection as unknown as express.RequestHandler);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/services", serviceRoutes);
app.use("/api/v1/bookings", bookingRoutes);
app.use("/api/v1/reviews", reviewRoutes);
app.use("/api/v1/portfolio", portfolioRoutes);
app.use("/api/v1/inquiries", inquiryRoutes);
app.use("/api/v1/admin", adminRoutes);

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(errorHandler);

async function startServer() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`API base: http://localhost:${PORT}/api/v1`);
      console.log(`Environment: ${env.NODE_ENV}`);
      console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
    });
  } catch (error) {
    console.error("Database connection failed during startup:", error);
    process.exit(1);
  }
}

void startServer();
