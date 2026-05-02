import { describe, expect, it } from "vitest";
import {
  createPortfolioFormSchema,
  updatePortfolioFormSchema,
} from "../validators/portfolio.validator";

describe("portfolio form validation", () => {
  it("rejects non-Instagram links in multipart payloads", () => {
    const result = createPortfolioFormSchema.safeParse({
      modelName: "Model",
      makeupType: "Soft Glam",
      description: "Portfolio item",
      category: "BRIDAL",
      instagramUrl: "javascript:alert(1)",
      isPublished: "true",
      sortOrder: "1",
    });

    expect(result.success).toBe(false);
  });

  it("parses valid form fields from multipart requests", () => {
    const result = createPortfolioFormSchema.safeParse({
      modelName: "Model",
      makeupType: "Soft Glam",
      description: "Portfolio item",
      category: "BRIDAL",
      instagramUrl: "https://www.instagram.com/p/example/",
      isPublished: "false",
      sortOrder: "2",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isPublished).toBe(false);
      expect(result.data.sortOrder).toBe(2);
      expect(result.data.instagramUrl).toBe("https://www.instagram.com/p/example/");
    }
  });

  it("allows partial update payloads", () => {
    const result = updatePortfolioFormSchema.safeParse({
      instagramUrl: "https://instagram.com/p/example/",
    });

    expect(result.success).toBe(true);
  });

  it("coerces removeVideo from multipart form data", () => {
    const result = updatePortfolioFormSchema.safeParse({
      removeVideo: "true",
      sortOrder: "3",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.removeVideo).toBe(true);
      expect(result.data.sortOrder).toBe(3);
    }
  });
});