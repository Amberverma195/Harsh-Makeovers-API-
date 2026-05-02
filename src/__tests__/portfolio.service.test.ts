import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/prisma", () => ({
  prisma: {
    portfolio: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../helpers/storage", () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

import { prisma } from "../config/prisma";
import { deleteFile, uploadFile } from "../helpers/storage";
import {
  getPortfolioById,
  getPublishedPortfolio,
  updatePortfolioItem,
} from "../services/portfolio.service";

const mockPrisma = prisma as unknown as {
  portfolio: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const mockDeleteFile = vi.mocked(deleteFile);
const mockUploadFile = vi.mocked(uploadFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublishedPortfolio", () => {
  it("returns only published items ordered by sortOrder", async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([{ id: "p1", modelName: "Model 1" }]);
    mockPrisma.portfolio.count.mockResolvedValue(1);

    const result = await getPublishedPortfolio(0, 12);

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(mockPrisma.portfolio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isPublished: true },
        orderBy: { sortOrder: "asc" },
        skip: 0,
        take: 12,
      })
    );
    expect(mockPrisma.portfolio.count).toHaveBeenCalledWith({
      where: { isPublished: true },
    });
  });
});

describe("getPortfolioById", () => {
  it("returns a published portfolio item", async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: "p1",
      modelName: "Published Model",
      makeupType: "Bridal Glow",
      description: "Soft glam",
      category: "BRIDAL",
      imageUrl: "https://example.com/image.jpg",
      videoUrl: null,
      instagramUrl: null,
      sortOrder: 1,
    });

    const result = await getPortfolioById("p1");

    expect(result.id).toBe("p1");
    expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
      where: {
        id: "p1",
        isPublished: true,
      },
      select: {
        id: true,
        modelName: true,
        makeupType: true,
        description: true,
        category: true,
        imageUrl: true,
        videoUrl: true,
        instagramUrl: true,
        sortOrder: true,
      },
    });
  });

  it("throws 404 for an unpublished portfolio item", async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);

    await expect(getPortfolioById("draft-id")).rejects.toThrow("Portfolio item not found");
    expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "draft-id",
          isPublished: true,
        },
      })
    );
  });
});

describe("updatePortfolioItem", () => {
  it("removes an existing video when removeVideo is true", async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: "p1",
      imageUrl: "https://example.com/image.jpg",
      videoUrl: "https://example.com/old-video.mp4",
    });
    mockPrisma.portfolio.update.mockResolvedValue({
      id: "p1",
      videoUrl: null,
    });

    const result = await updatePortfolioItem("p1", { removeVideo: true }, "admin-1");

    expect(mockDeleteFile).toHaveBeenCalledWith("https://example.com/old-video.mp4");
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        updatedById: "admin-1",
        videoUrl: null,
      },
    });
    expect(result.videoUrl).toBeNull();
  });

  it("ignores removeVideo when there is no stored video", async () => {
    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: "p1",
      imageUrl: "https://example.com/image.jpg",
      videoUrl: null,
    });
    mockPrisma.portfolio.update.mockResolvedValue({
      id: "p1",
      videoUrl: null,
    });

    await updatePortfolioItem("p1", { removeVideo: true }, "admin-1");

    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        updatedById: "admin-1",
      },
    });
  });

  it("prefers a replacement upload over removeVideo", async () => {
    const replacementVideo = { originalname: "replacement.mp4" } as Express.Multer.File;

    mockPrisma.portfolio.findUnique.mockResolvedValue({
      id: "p1",
      imageUrl: "https://example.com/image.jpg",
      videoUrl: "https://example.com/old-video.mp4",
    });
    mockUploadFile.mockResolvedValue("https://example.com/new-video.mp4");
    mockPrisma.portfolio.update.mockResolvedValue({
      id: "p1",
      videoUrl: "https://example.com/new-video.mp4",
    });

    const result = await updatePortfolioItem(
      "p1",
      { removeVideo: true },
      "admin-1",
      undefined,
      replacementVideo
    );

    expect(mockDeleteFile).toHaveBeenCalledWith("https://example.com/old-video.mp4");
    expect(mockUploadFile).toHaveBeenCalledWith(replacementVideo, "videos");
    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        updatedById: "admin-1",
        videoUrl: "https://example.com/new-video.mp4",
      },
    });
    expect(result.videoUrl).toBe("https://example.com/new-video.mp4");
  });
});