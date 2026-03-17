import { Router } from "express";
import multer from "multer";
import {
  uploadTempImage,
  deleteTempImage,
  getSignedUploadUrl,
} from "../controllers/upload.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const ACCEPTED_MIMETYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/gif",
  "application/octet-stream",
]);

const RAW_EXTENSIONS = new Set([
  ".cr3",
  ".cr2",
  ".dng",
  ".nef",
  ".arw",
  ".raf",
  ".rw2",
  ".orf",
  ".pef",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = "." + file.originalname.split(".").pop()?.toLowerCase();
    const allowed =
      ACCEPTED_MIMETYPES.has(file.mimetype) || RAW_EXTENSIONS.has(ext);
    cb(null, allowed);
  },
});

const router = Router();

router.post(
  "/temp-image",
  isAuthenticated,
  upload.single("file"),
  uploadTempImage,
);
router.delete("/temp-image", isAuthenticated, deleteTempImage);
router.get("/signed-url", isAuthenticated, getSignedUploadUrl);

export default router;
