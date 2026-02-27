import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export const uploadBase64ToCloudinary = async (
  base64: string,
  folder: string = "propenhance",
): Promise<string> => {
  const dataUri = base64.startsWith("data:")
    ? base64
    : `data:image/jpeg;base64,${base64}`;
  const result = await cloudinary.uploader.upload(dataUri, { folder });
  return result.secure_url;
};

export const uploadBufferToCloudinary = async (
  buffer: Buffer,
  mimeType: string,
  folder: string = "propenhance",
): Promise<string> => {
  const base64 = buffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;
  const result = await cloudinary.uploader.upload(dataUri, { folder });
  return result.secure_url;
};
