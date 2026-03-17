import { Storage } from "@google-cloud/storage";
import { v4 as uuid } from "uuid";
import path from "path";
import { GoogleAuth } from "google-auth-library";

export const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// const storage = new Storage({ projectId: process.env.GCLOUD_PROJECT_ID });
const storage = new Storage({
  projectId: process.env.GCLOUD_PROJECT_ID,
  // authClient: auth as any,
  // universeDomain: "googleapis.com",
});

export const signingStorage = new Storage({
  projectId: process.env.GCLOUD_PROJECT_ID,
  authClient: auth as any,
  universeDomain: "googleapis.com",
});
const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME!);
export const BUCKET_NAME = process.env.GOOGLE_CLOUD_BUCKET_NAME!;

// ── MIME maps ─────────────────────────────────────────────────────────────────

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
  cr3: "application/octet-stream",
  cr2: "application/octet-stream",
  dng: "application/octet-stream",
  nef: "application/octet-stream",
  arw: "application/octet-stream",
  raf: "application/octet-stream",
  rw2: "application/octet-stream",
  orf: "application/octet-stream",
  pef: "application/octet-stream",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildDestination(
  folder: string,
  mimeType: string,
  originalName?: string,
): string {
  if (originalName) {
    const ext = path.extname(originalName).toLowerCase().replace(".", "");
    if (ext) return `${folder}/${uuid()}.${ext}`;
  }
  const ext = MIME_TO_EXT[mimeType] ?? "jpg";
  return `${folder}/${uuid()}.${ext}`;
}

export function publicUrl(destination: string): string {
  return `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_BUCKET_NAME}/${destination}`;
}

function extractDestination(urlOrPath: string): string {
  const prefix = `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_BUCKET_NAME}/`;
  return urlOrPath.startsWith(prefix)
    ? urlOrPath.replace(prefix, "")
    : urlOrPath;
}

export function guessMimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  return EXT_TO_MIME[ext] ?? "image/jpeg";
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function uploadBufferToGCS(
  buffer: Buffer,
  mimeType: string,
  folder: string,
  originalName?: string,
): Promise<string> {
  const destination = buildDestination(folder, mimeType, originalName);
  await bucket.file(destination).save(buffer, {
    metadata: { contentType: mimeType },
    resumable: false,
  });
  return publicUrl(destination);
}

export async function uploadFileToGCS(
  filePath: string,
  folder: string,
): Promise<string> {
  const mimeType = guessMimeFromPath(filePath);
  const destination = buildDestination(
    folder,
    mimeType,
    path.basename(filePath),
  );
  await bucket.upload(filePath, {
    destination,
    metadata: { contentType: mimeType },
  });
  return publicUrl(destination);
}

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

export async function generateSignedUploadUrl(
  folder: string,
  filename: string,
  contentType: string,
  serviceAccountEmail: string,
): Promise<{ uploadUrl: string; fileUrl: string }> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${folder}/${Date.now()}-${safeName}`;

  const client = await auth.getClient();

  const signOptions = {
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
    issuer: serviceAccountEmail,
    signBytes: async (bytes: Buffer) => {
      const url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:signBlob`;
      const tokenResponse = await client.getAccessToken();

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResponse.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: bytes.toString("base64") }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`IAM signBlob failed: ${res.status} ${text}`);
      }

      const data = (await res.json()) as { signedBlob: string };
      return Buffer.from(data.signedBlob, "base64");
    },
  } as any;

  const [uploadUrl] = await signingStorage
    .bucket(BUCKET_NAME)
    .file(key)
    .getSignedUrl(signOptions);

  return {
    uploadUrl,
    fileUrl: publicUrl(key),
  };
}
