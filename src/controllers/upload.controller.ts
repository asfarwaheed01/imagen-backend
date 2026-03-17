// import { Request, Response } from "express";
// import axios from "axios";
// import sharp from "sharp";
// import {
//   uploadBufferToGCS,
//   deleteFromGCS,
//   guessMimeFromPath,
//   generateSignedUploadUrl,
// } from "../services/storage.service";

// const MAX_FILE_SIZE = 60 * 1024 * 1024;
// const ALLOWED_FOLDER = "temp/previews";

// // sharp/libvips handles these natively
// const SHARP_RAW = new Set(["dng", "nef", "arw", "raf", "rw2", "orf", "pef"]);

// // Canon legacy — need external conversion API
// const API_RAW = new Set(["cr3", "cr2"]);

// const RAW_CONVERSION_API =
//   "https://image-service.beleef.com.au/api/v1/uploadCr3";

// function getExt(filename: string): string {
//   return filename.split(".").pop()?.toLowerCase() ?? "";
// }

// // ── DNG / NEF / ARW etc. → JPEG via sharp ────────────────────────────────────

// async function convertViaSharp(buffer: Buffer): Promise<Buffer> {
//   return sharp(buffer, { failOn: "none" })
//     .rotate() // honour EXIF orientation
//     .png({
//       compressionLevel: 0, // no compression — fastest, lossless
//       effort: 1,
//     })
//     .toBuffer();
// }

// // ── CR3 / CR2 → JPEG via external API ────────────────────────────────────────
// // Upload RAW to temp/raw/ first so the API has a URL to fetch from,
// // then delete it once we have the JPEG back.

// async function convertViaCr3Api(
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
//     console.log("[convertViaCr3Api] tempUrl:", tempUrl);
//     console.log("[convertViaCr3Api] originalName:", originalName);
//     console.log("[convertViaCr3Api] bufferSize:", rawBuffer.length, "bytes");

//     const { data } = await axios.post<{ base64Image: string }>(
//       RAW_CONVERSION_API,
//       { imageUrl: tempUrl },
//       { timeout: 60_000 },
//     );

//     console.log(
//       "[convertViaCr3Api] success, response keys:",
//       Object.keys(data ?? {}),
//     );

//     if (!data?.base64Image) {
//       console.error(
//         "[convertViaCr3Api] full response body:",
//         JSON.stringify(data),
//       );
//       throw new Error("CR3 API returned no image");
//     }

//     const base64 = data.base64Image.includes(",")
//       ? data.base64Image.split(",")[1]
//       : data.base64Image;

//     return Buffer.from(base64, "base64");
//   } catch (err: any) {
//     console.error("━━━━━━━━━━ [convertViaCr3Api] FULL ERROR ━━━━━━━━━━");
//     console.error("tempUrl sent to API:", tempUrl);
//     console.error("HTTP status:", err?.response?.status);
//     console.error("HTTP statusText:", err?.response?.statusText);
//     console.error("Response headers:", JSON.stringify(err?.response?.headers));
//     console.error("Response body:", JSON.stringify(err?.response?.data));
//     console.error("Axios message:", err?.message);
//     console.error("Stack:", err?.stack);
//     console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
//     throw err;
//   } finally {
//     await deleteFromGCS(tempUrl).catch(() => {});
//   }
// }

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

//     if (SHARP_RAW.has(ext)) {
//       // DNG, NEF, ARW, RAF, RW2, ORF, PEF — sharp/libvips handles natively
//       uploadBuffer = await convertViaSharp(file.buffer);
//       mimeType = "image/png";
//       storageName = file.originalname.replace(/\.[^.]+$/, ".png");
//     } else if (API_RAW.has(ext)) {
//       // CR3/CR2 — try sharp first, fall back to external API if sharp fails
//       try {
//         console.log(
//           "[uploadTempImage] trying sharp for CR3/CR2:",
//           file.originalname,
//         );
//         uploadBuffer = await convertViaSharp(file.buffer);
//         mimeType = "image/png";
//         storageName = file.originalname.replace(/\.[^.]+$/, ".png");
//         console.log(
//           "[uploadTempImage] sharp succeeded for:",
//           file.originalname,
//         );
//       } catch (sharpErr: any) {
//         console.warn(
//           "[uploadTempImage] sharp failed for CR3, trying external API:",
//           sharpErr?.message,
//         );
//         uploadBuffer = await convertViaCr3Api(file.buffer, file.originalname);
//         mimeType = "image/jpeg";
//         storageName = file.originalname.replace(/\.[^.]+$/, ".jpg");
//       }
//     }

//     const url = await uploadBufferToGCS(
//       uploadBuffer,
//       mimeType,
//       ALLOWED_FOLDER,
//       storageName,
//     );
//     res.status(200).json({ url });
//   } catch (err: any) {
//     console.error("[uploadTempImage] status:", err?.response?.status);
//     console.error(
//       "[uploadTempImage] data:",
//       JSON.stringify(err?.response?.data),
//     );
//     console.error("[uploadTempImage] message:", err?.message);
//     console.error("[uploadTempImage] stack:", err?.stack);
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

// // ── POST /api/upload/temp-image ───────────────────────────────────────────────

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

// // ── DELETE /api/upload/temp-image ─────────────────────────────────────────────

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

export const getSignedUploadUrl = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { filename, contentType, fileUrl } = req.query as Record<
      string,
      string
    >;

    if (fileUrl) {
      if (!fileUrl.includes("temp/previews")) {
        res.status(403).json({ error: "Forbidden path" });
        return;
      }

      const response = await fetch(fileUrl);
      if (!response.ok)
        throw new Error(`Failed to fetch from GCS: ${response.status}`);

      const rawBuffer = Buffer.from(await response.arrayBuffer());
      const jpegBuffer = await convertViaApi(rawBuffer, filename ?? "file.raw");
      const jpegName = (filename ?? "file").replace(/\.[^.]+$/, ".jpg");

      const url = await uploadBufferToGCS(
        jpegBuffer,
        "image/jpeg",
        ALLOWED_FOLDER,
        jpegName,
      );
      deleteFromGCS(fileUrl).catch(() => {});

      res.status(200).json({ url });
      return;
    }

    // ── Phase 1: generate signed URL ─────────────────────────────────────
    if (!filename || !contentType) {
      res.status(400).json({ error: "filename and contentType are required" });
      return;
    }

    // Fetch service account email from metadata server — works on Cloud Run
    const metaRes = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
      { headers: { "Metadata-Flavor": "Google" } },
    );

    if (!metaRes.ok)
      throw new Error(
        "Failed to fetch service account email from metadata server",
      );

    const serviceAccountEmail = await metaRes.text();

    const { uploadUrl, fileUrl: signedFileUrl } = await generateSignedUploadUrl(
      ALLOWED_FOLDER,
      filename,
      contentType,
      serviceAccountEmail,
    );

    res.status(200).json({ uploadUrl, fileUrl: signedFileUrl });
  } catch (err: any) {
    console.error("[getSignedUploadUrl]", err?.message);
    res.status(500).json({ error: "Could not generate signed URL" });
  }
};
