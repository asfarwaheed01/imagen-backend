import { Storage } from "@google-cloud/storage";
import { v4 as uuid } from "uuid";
import path from "path";

const storage = new Storage({
  projectId: process.env.GCLOUD_PROJECT_ID,
});

const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME!);

// ── Helpers ───────────────────────────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/gif": "gif",
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  gif: "image/gif",
};

function buildDestination(folder: string, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType] ?? "jpg";
  return `${folder}/${uuid()}.${ext}`;
}

function publicUrl(destination: string): string {
  return `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_BUCKET_NAME}/${destination}`;
}

function extractDestination(urlOrPath: string): string | null {
  if (urlOrPath.startsWith("https://storage.googleapis.com/")) {
    return urlOrPath.replace(
      `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_BUCKET_NAME}/`,
      "",
    );
  }
  return urlOrPath;
}

function guessMimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  return EXT_TO_MIME[ext] ?? "image/jpeg";
}

/**
 * Upload a Buffer — replaces uploadBufferToCloudinary(buffer, mimeType, folder)
 */
export async function uploadBufferToGCS(
  buffer: Buffer,
  mimeType: string,
  folder: string,
): Promise<string> {
  const destination = buildDestination(folder, mimeType);
  await bucket.file(destination).save(buffer, {
    metadata: { contentType: mimeType },
    resumable: false,
    public: true,
  });
  return publicUrl(destination);
}

/**
 * Upload a local file — replaces uploadFileToCloudinary(filePath, folder)
 */
export async function uploadFileToGCS(
  filePath: string,
  folder: string,
): Promise<string> {
  const mimeType = guessMimeFromPath(filePath);
  const destination = buildDestination(folder, mimeType);
  await bucket.upload(filePath, {
    destination,
    metadata: { contentType: mimeType },
    public: true,
  });
  return publicUrl(destination);
}

/**
 * Delete a file — replaces deleteFromCloudinary(url)
 */
export async function deleteFromGCS(urlOrPath: string): Promise<void> {
  const destination = extractDestination(urlOrPath);
  if (!destination) return;
  await bucket.file(destination).delete({ ignoreNotFound: true });
}

export async function uploadBase64ToGCS(
  base64: string,
  folder: string,
): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  return uploadBufferToGCS(buffer, "image/png", folder);
}
