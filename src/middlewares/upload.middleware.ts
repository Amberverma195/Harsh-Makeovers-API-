/**
 * Upload middleware for portfolio media.
 */

import multer from "multer";
import { AppError } from "./error.middleware";

const ALLOWED_IMAGE_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const ALLOWED_VIDEO_MIMES = ["video/mp4"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const FIELD_LIMITS = {
  image: { maxSize: MAX_IMAGE_SIZE, label: "Image" },
  video: { maxSize: MAX_VIDEO_SIZE, label: "Video" },
} as const;

const storage: multer.StorageEngine = {
  _handleFile(_req, file, cb) {
    const field = FIELD_LIMITS[file.fieldname as keyof typeof FIELD_LIMITS];
    if (!field) {
      cb(new AppError(400, `Unexpected file field: ${file.fieldname}`));
      return;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;
    let completed = false;

    const finish = (error?: Error | null, info?: { buffer: Buffer; size: number }) => {
      if (completed) return;
      completed = true;
      cb(error ?? null, info);
    };

    file.stream.on("data", (chunk: Buffer) => {
      if (completed) return;

      totalSize += chunk.length;
      if (totalSize > field.maxSize) {
        finish(new AppError(400, `${field.label} must be under ${field.maxSize / (1024 * 1024)} MB`));
        file.stream.resume();
        return;
      }

      chunks.push(chunk);
    });

    file.stream.on("limit", () => {
      finish(new AppError(400, `${field.label} exceeds the maximum allowed size`));
    });

    file.stream.on("error", (error) => {
      finish(error);
    });

    file.stream.on("end", () => {
      if (completed) return;
      finish(null, { buffer: Buffer.concat(chunks), size: totalSize });
    });
  },
  _removeFile(_req, file, cb) {
    const mutableFile = file as unknown as { buffer?: Buffer };
    delete mutableFile.buffer;
    cb(null);
  },
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_VIDEO_SIZE,
    files: 2,
    fields: 10,
    fieldSize: 1024 * 10,
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "image") {
      if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
        return cb(new AppError(400, "Image must be PNG, JPG, JPEG, or WebP"));
      }
    } else if (file.fieldname === "video") {
      if (!ALLOWED_VIDEO_MIMES.includes(file.mimetype)) {
        return cb(new AppError(400, "Video must be MP4 format"));
      }
    } else {
      return cb(new AppError(400, `Unexpected file field: ${file.fieldname}`));
    }

    cb(null, true);
  },
});

export const portfolioUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);
