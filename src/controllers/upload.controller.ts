// import { Request, Response } from "express";
// import axios from "axios";
// import {
//   uploadBufferToGCS,
//   deleteFromGCS,
//   guessMimeFromPath,
//   generateSignedUploadUrl,
// } from "../services/storage.service";

// const MAX_FILE_SIZE = 60 * 1024 * 1024;
// const ALLOWED_FOLDER = "temp/previews";

// const RAW_EXTENSIONS = new Set([
//   "cr3",
//   "cr2",
//   "dng",
//   "nef",
//   "arw",
//   "raf",
//   "rw2",
//   "orf",
//   "pef",
// ]);

// const RAW_CONVERSION_API =
//   "https://image-service.beleef.com.au/api/v1/uploadCr3";

// function getExt(filename: string): string {
//   return filename.split(".").pop()?.toLowerCase() ?? "";
// }

// // ── RAW → JPEG via external API ───────────────────────────────────────────────

// async function convertViaApi(
//   rawBuffer: Buffer,
//   originalName: string,
// ): Promise<Buffer> {
//   const tempUrl = await uploadBufferToGCS(
//     rawBuffer,
//     "application/octet-stream",
//     "temp/raw",
//     originalName,
//   );

//   try {
//     const { data } = await axios.post<{ base64Image: string }>(
//       RAW_CONVERSION_API,
//       { imageUrl: tempUrl },
//       { timeout: 60_000 },
//     );

//     if (!data?.base64Image) {
//       throw new Error("RAW conversion API returned no image");
//     }

//     const base64 = data.base64Image.includes(",")
//       ? data.base64Image.split(",")[1]
//       : data.base64Image;

//     return Buffer.from(base64, "base64");
//   } catch (err: any) {
//     console.error("[convertViaApi] failed for:", originalName);
//     console.error("[convertViaApi] status:", err?.response?.status);
//     console.error("[convertViaApi] body:", JSON.stringify(err?.response?.data));
//     throw err;
//   } finally {
//     await deleteFromGCS(tempUrl).catch(() => {});
//   }
// }

// // ── POST /api/upload/temp-image ───────────────────────────────────────────────

// export const uploadTempImage = async (
//   req: Request,
//   res: Response,
// ): Promise<void> => {
//   try {
//     const file = req.file;

//     if (!file) {
//       res.status(400).json({ error: "No file provided" });
//       return;
//     }

//     if (file.size > MAX_FILE_SIZE) {
//       res.status(413).json({
//         error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit`,
//       });
//       return;
//     }

//     const ext = getExt(file.originalname);
//     let uploadBuffer = file.buffer;
//     let mimeType =
//       file.mimetype && file.mimetype !== "application/octet-stream"
//         ? file.mimetype
//         : guessMimeFromPath(file.originalname);
//     let storageName = file.originalname;

//     if (RAW_EXTENSIONS.has(ext)) {
//       uploadBuffer = await convertViaApi(file.buffer, file.originalname);
//       mimeType = "image/jpeg";
//       storageName = file.originalname.replace(/\.[^.]+$/, ".jpg");
//     }

//     const url = await uploadBufferToGCS(
//       uploadBuffer,
//       mimeType,
//       ALLOWED_FOLDER,
//       storageName,
//     );

//     res.status(200).json({ url });
//   } catch (err: any) {
//     console.error("[uploadTempImage]", err?.message);
//     res.status(500).json({ error: "Upload failed" });
//   }
// };

// // ── DELETE /api/upload/temp-image ─────────────────────────────────────────────

// export const deleteTempImage = async (
//   req: Request,
//   res: Response,
// ): Promise<void> => {
//   try {
//     const { url } = req.body as { url?: string };

//     if (!url || typeof url !== "string") {
//       res.status(400).json({ error: "url is required" });
//       return;
//     }

//     if (!url.includes(ALLOWED_FOLDER)) {
//       res.status(403).json({ error: "Forbidden path" });
//       return;
//     }

//     await deleteFromGCS(url);
//     res.status(204).send();
//   } catch (err: any) {
//     console.error("[deleteTempImage]", err?.message);
//     res.status(500).json({ error: "Delete failed" });
//   }
// };

// export const getSignedUploadUrl = async (
//   req: Request,
//   res: Response,
// ): Promise<void> => {
//   try {
//     const { filename, contentType } = req.query as Record<string, string>;

//     if (!filename || !contentType) {
//       res.status(400).json({ error: "filename and contentType are required" });
//       return;
//     }

//     const { uploadUrl, fileUrl } = await generateSignedUploadUrl(
//       "temp/previews",
//       filename,
//       contentType,
//     );

//     res.status(200).json({ uploadUrl, fileUrl });
//   } catch (err: any) {
//     console.error("[getSignedUploadUrl]", err?.message);
//     res.status(500).json({ error: "Could not generate signed URL" });
//   }
// };

import { Request, Response } from "express";
import axios from "axios";
import {
  uploadBufferToGCS,
  deleteFromGCS,
  guessMimeFromPath,
  generateSignedUploadUrl,
} from "../services/storage.service";

const MAX_FILE_SIZE = 60 * 1024 * 1024;
const ALLOWED_FOLDER = "temp/previews";

const RAW_EXTENSIONS = new Set([
  "cr3",
  "cr2",
  "dng",
  "nef",
  "arw",
  "raf",
  "rw2",
  "orf",
  "pef",
]);

const RAW_CONVERSION_API =
  "https://image-service.beleef.com.au/api/v1/uploadCr3";

function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

// ── RAW → JPEG via external API ───────────────────────────────────────────────

async function convertViaApi(
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

    if (!data?.base64Image) {
      throw new Error("RAW conversion API returned no image");
    }

    const base64 = data.base64Image.includes(",")
      ? data.base64Image.split(",")[1]
      : data.base64Image;

    return Buffer.from(base64, "base64");
  } catch (err: any) {
    console.error("[convertViaApi] failed for:", originalName);
    console.error("[convertViaApi] status:", err?.response?.status);
    console.error("[convertViaApi] body:", JSON.stringify(err?.response?.data));
    throw err;
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
      res.status(413).json({
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

    if (RAW_EXTENSIONS.has(ext)) {
      uploadBuffer = await convertViaApi(file.buffer, file.originalname);
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
    console.error("[uploadTempImage]", err?.message);
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

// ── GET /api/upload/signed-url ────────────────────────────────────────────────

export const getSignedUploadUrl = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { filename, contentType, fileUrl } = req.query as Record<
      string,
      string
    >;

    // ── Phase 2: RAW already uploaded to GCS → download, convert, re-upload ─
    if (fileUrl) {
      if (!fileUrl.includes(ALLOWED_FOLDER)) {
        res.status(403).json({ error: "Forbidden path" });
        return;
      }

      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file from GCS: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuffer);

      const jpegBuffer = await convertViaApi(rawBuffer, filename ?? "file.raw");
      const jpegName = (filename ?? "file").replace(/\.[^.]+$/, ".jpg");

      const url = await uploadBufferToGCS(
        jpegBuffer,
        "image/jpeg",
        ALLOWED_FOLDER,
        jpegName,
      );

      // Remove the original RAW from GCS
      deleteFromGCS(fileUrl).catch(() => {});

      res.status(200).json({ url });
      return;
    }

    // ── Phase 1: generate signed URL for direct GCS PUT ───────────────────
    if (!filename || !contentType) {
      res.status(400).json({ error: "filename and contentType are required" });
      return;
    }

    const result = await generateSignedUploadUrl(
      ALLOWED_FOLDER,
      filename,
      contentType,
    );

    res.status(200).json(result);
  } catch (err: any) {
    console.error("[getSignedUploadUrl]", err?.message);
    res.status(500).json({ error: "Could not generate signed URL" });
  }
};
