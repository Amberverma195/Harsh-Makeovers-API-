import { describe, expect, it } from "vitest";
import {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../helpers/jwt";

describe("jwt helpers", () => {
  it("creates refresh tokens with unique token ids", () => {
    const first = createRefreshToken({ userId: "u1", role: "USER" });
    const second = createRefreshToken({ userId: "u1", role: "USER" });

    expect(first).not.toBe(second);

    const firstPayload = verifyRefreshToken(first);
    const secondPayload = verifyRefreshToken(second);

    expect(firstPayload.tokenId).toBeTruthy();
    expect(secondPayload.tokenId).toBeTruthy();
    expect(firstPayload.tokenId).not.toBe(secondPayload.tokenId);
  });

  it("keeps access token payload minimal", () => {
    const token = createAccessToken({ userId: "u1", role: "ADMIN" });
    expect(verifyAccessToken(token)).toEqual({ userId: "u1", role: "ADMIN" });
  });
});
