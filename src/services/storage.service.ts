import { Storage } from "@google-cloud/storage";
import { v4 as uuid } from "uuid";
import path from "path";
import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// const storage = new Storage({ projectId: process.env.GCLOUD_PROJECT_ID });
const storage = new Storage({
  projectId: process.env.GCLOUD_PROJECT_ID,
  authClient: auth as any,
});
const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME!);
const BUCKET_NAME = process.env.GOOGLE_CLOUD_BUCKET_NAME!;

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

function publicUrl(destination: string): string {
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
): Promise<{ uploadUrl: string; fileUrl: string }> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${folder}/${Date.now()}-${safeName}`;

  const client = await auth.getClient();
  const credentials = await auth.getCredentials();
  const serviceAccountEmail = credentials.client_email || (client as any).email;

  if (!serviceAccountEmail) {
    throw new Error("Could not resolve service account email.");
  }

  const signOptions = {
    version: "v4",
    action: "write",
    expires: Date.now() + 10 * 60 * 1000,
    contentType,
    issuer: serviceAccountEmail,
    signBytes: async (bytes: Buffer) => {
      const res = await client.request({
        url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:signBlob`,
        method: "POST",
        data: {
          payload: bytes.toString("base64"),
        },
      });

      const { signedBlob } = res.data as { signedBlob: string };
      return Buffer.from(signedBlob, "base64");
    },
  } as any;

  const [uploadUrl] = await bucket.file(key).getSignedUrl(signOptions);

  return {
    uploadUrl,
    fileUrl: publicUrl(key),
  };
}
