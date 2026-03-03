import { Request, Response, NextFunction } from "express";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import { db } from "../db";
import { images, jobs } from "../db/schema";
import { uploadBufferToCloudinary } from "../services/cloudinary.service";
import { sendToShiftn } from "../services/shiftn.service";
import { IMAGE_PRICING } from "../constants/pricing";
import { orderService } from "../services/order.service";
import { processWithGemini } from "./image.controller";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

export const createPaymentIntent = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const {
      address,
      propertyType,
      bedrooms,
      bathrooms,
      carSpaces,
      additionalInfo,
      imageCount,
    } = req.body;

    if (!address || !propertyType || !imageCount)
      return res
        .status(400)
        .json({ message: "address, propertyType and imageCount are required" });

    const totalCost = IMAGE_PRICING[Number(imageCount)];
    if (!totalCost)
      return res.status(400).json({ message: "Invalid image count" });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCost * 100,
      currency: "usd",
      metadata: { userId: String(user.id), imageCount: String(imageCount) },
    });

    const { order } = await orderService.createPendingOrder({
      userId: user.id,
      address,
      propertyType,
      bedrooms: Number(bedrooms) || 0,
      bathrooms: Number(bathrooms) || 0,
      carSpaces: Number(carSpaces) || 0,
      additionalInfo,
      imageCount: Number(imageCount),
      totalCost,
      paymentIntentId: paymentIntent.id,
    });

    res.json({ clientSecret: paymentIntent.client_secret, orderId: order.id });
  } catch (err) {
    next(err);
  }
};

export const uploadImages = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const orderId = Number(req.params.orderId);
    const files = req.files as Express.Multer.File[];

    if (!files?.length)
      return res.status(400).json({ message: "No images provided" });

    // Verify order belongs to user
    const order = await orderService.getOrderById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.userId !== user.id)
      return res.status(403).json({ message: "Forbidden" });

    // Use additionalInfo as prompt, fall back to default
    const prompt =
      (order as any).additionalInfo?.trim() ||
      "Enhance this real estate photo: improve lighting, remove clutter, make it look professional";

    // Process each file — upload + job creation runs in parallel
    const results = await Promise.allSettled(
      files.map((file, index) =>
        processUploadedImage({ file, orderId, userId: user.id, prompt, index }),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    res.json({
      message: "Images queued for processing",
      succeeded,
      failed,
      orderId,
    });
  } catch (err) {
    next(err);
  }
};

const processUploadedImage = async ({
  file,
  orderId,
  userId,
  prompt,
  index,
}: {
  file: Express.Multer.File;
  orderId: number;
  userId: number;
  prompt: string;
  index: number;
}) => {
  const jobId = randomUUID();

  // 1. Upload original to Cloudinary
  console.log(`☁️  Uploading image ${index + 1} to Cloudinary...`);
  const originalUrl = await uploadBufferToCloudinary(
    file.buffer,
    file.mimetype,
    "propenhance/originals",
  );
  console.log(`☁️  Cloudinary URL: ${originalUrl}`);

  const [image] = await db
    .insert(images)
    .values({
      orderId,
      userId,
      status: "uploaded",
      originalKey: originalUrl,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      sortOrder: index,
    })
    .returning();

  await db.insert(jobs).values({
    id: jobId,
    imageId: image.id,
    type: "straighten",
    status: "pending",
    inputKey: originalUrl,
    prompt,
    isCustomPrompt: false,
  });

  try {
    await sendToShiftn(originalUrl, jobId);
    console.log(`📐 Shift-N accepted job: ${jobId}`);

    await db
      .update(images)
      .set({ status: "straightening", updatedAt: new Date() })
      .where(require("drizzle-orm").eq(images.id, image.id));
  } catch (shiftnErr: any) {
    console.error(
      `⚠️ Shift-N failed for job ${jobId}, falling back to Gemini:`,
      shiftnErr.message,
    );
    await processWithGemini(jobId, file.buffer, file.mimetype);
  }
};

// In order.controller.ts
export const getOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const orderId = Number(req.params.orderId);

    const order = await orderService.getOrderById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.userId !== user.id)
      return res.status(403).json({ message: "Forbidden" });

    // Get all jobs for this order via images
    const orderImages = await db
      .select({
        imageId: images.id,
        imageStatus: images.status,
        jobId: jobs.id,
        jobStatus: jobs.status,
        resultKey: jobs.resultKey,
        error: jobs.error,
      })
      .from(images)
      .leftJoin(jobs, eq(jobs.imageId, images.id))
      .where(eq(images.orderId, orderId));

    const total = orderImages.length;
    const completed = orderImages.filter(
      (i) => i.jobStatus === "completed",
    ).length;
    const failed = orderImages.filter((i) => i.jobStatus === "failed").length;
    const pending = total - completed - failed;
    const allDone = pending === 0;

    res.json({
      orderId,
      total,
      completed,
      failed,
      pending,
      allDone,
      images: orderImages,
    });
  } catch (err) {
    next(err);
  }
};
