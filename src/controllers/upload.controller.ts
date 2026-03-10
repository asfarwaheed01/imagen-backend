import { Request, Response } from "express";
import axios from "axios";
import sharp from "sharp";
import {
  uploadBufferToGCS,
  deleteFromGCS,
  guessMimeFromPath,
} from "../services/storage.service";

const MAX_FILE_SIZE = 60 * 1024 * 1024;
const ALLOWED_FOLDER = "temp/previews";

// sharp/libvips handles these natively
const SHARP_RAW = new Set(["dng", "nef", "arw", "raf", "rw2", "orf", "pef"]);

// Canon legacy — need external conversion API
const API_RAW = new Set(["cr3", "cr2"]);

const RAW_CONVERSION_API =
  "https://image-service.beleef.com.au/api/v1/uploadCr3";

function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

// ── DNG / NEF / ARW etc. → JPEG via sharp ────────────────────────────────────

async function convertViaSharp(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" })
    .rotate() // honour EXIF orientation
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ── CR3 / CR2 → JPEG via external API ────────────────────────────────────────
// Upload RAW to temp/raw/ first so the API has a URL to fetch from,
// then delete it once we have the JPEG back.

async function convertViaCr3Api(
  rawBuffer: Buffer,
  originalName: string,
): Promise<Buffer> {
  const tempUrl = await uploadBufferToGCS(
    rawBuffer,
    "application/octet-stream",
    "temp/raw",
    originalName,
  );

  try {
    const { data } = await axios.post<{ base64Image: string }>(
      RAW_CONVERSION_API,
      { imageUrl: tempUrl },
      { timeout: 60_000 },
    );

    if (!data?.base64Image) throw new Error("CR3 API returned no image");

    const base64 = data.base64Image.includes(",")
      ? data.base64Image.split(",")[1]
      : data.base64Image;

    return Buffer.from(base64, "base64");
  } finally {
    await deleteFromGCS(tempUrl).catch(() => {});
  }
}

// ── POST /api/upload/temp-image ───────────────────────────────────────────────

export const uploadTempImage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      res
        .status(413)
        .json({
          error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit`,
        });
      return;
    }

    const ext = getExt(file.originalname);
    let uploadBuffer = file.buffer;
    let mimeType =
      file.mimetype && file.mimetype !== "application/octet-stream"
        ? file.mimetype
        : guessMimeFromPath(file.originalname);
    let storageName = file.originalname;

    if (SHARP_RAW.has(ext)) {
      // Convert locally — no network call needed
      uploadBuffer = await convertViaSharp(file.buffer);
      mimeType = "image/jpeg";
      storageName = file.originalname.replace(/\.[^.]+$/, ".jpg");
    } else if (API_RAW.has(ext)) {
      // CR3/CR2 — delegate to external API
      uploadBuffer = await convertViaCr3Api(file.buffer, file.originalname);
      mimeType = "image/jpeg";
      storageName = file.originalname.replace(/\.[^.]+$/, ".jpg");
    }

    const url = await uploadBufferToGCS(
      uploadBuffer,
      mimeType,
      ALLOWED_FOLDER,
      storageName,
    );
    res.status(200).json({ url });
  } catch (err: any) {
    console.error("[uploadTempImage]", err?.response?.data ?? err?.message);
    res.status(500).json({ error: "Upload failed" });
  }
};

// ── DELETE /api/upload/temp-image ─────────────────────────────────────────────

export const deleteTempImage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { url } = req.body as { url?: string };

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "url is required" });
      return;
    }

    if (!url.includes(ALLOWED_FOLDER)) {
      res.status(403).json({ error: "Forbidden path" });
      return;
    }

    await deleteFromGCS(url);
    res.status(204).send();
  } catch (err: any) {
    console.error("[deleteTempImage]", err?.message);
    res.status(500).json({ error: "Delete failed" });
  }
};
