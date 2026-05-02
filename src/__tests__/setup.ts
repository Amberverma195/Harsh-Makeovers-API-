import { vi } from "vitest";

vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    FRONTEND_URL: "http://localhost:3000",
    NODE_ENV: "test",
    PORT: "5000",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
  },
}));
