import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { db } from "../db";
import { jobs } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  uploadBufferToCloudinary,
  uploadBase64ToCloudinary,
} from "../services/cloudinary.service";
import { sendToShiftn } from "../services/shiftn.service";
import { editImageWithVertex } from "../services/vertex.service";

// POST /api/images/process
export const processImage = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { prompt, isCustomPrompt } = req.body;

    if (!file) {
      res.status(400).json({ message: "No image uploaded" });
      return;
    }
    if (!prompt) {
      res.status(400).json({ message: "Prompt is required" });
      return;
    }

    const jobId = randomUUID();

    // 1 — Upload original to Cloudinary
    console.log("☁️  Uploading to Cloudinary...");
    const originalUrl = await uploadBufferToCloudinary(
      file.buffer,
      file.mimetype,
      "propenhance/originals",
    );
    console.log("☁️  Cloudinary URL:", originalUrl);

    // 2 — Create job in DB
    await db.insert(jobs).values({
      id: jobId,
      status: "pending",
      originalUrl,
      prompt,
      isCustomPrompt: isCustomPrompt === "true",
    });

    // 3 — Send to SHIFT-N
    try {
      await sendToShiftn(originalUrl, jobId);
      console.log("📐 SHIFT-N accepted job:", jobId);
    } catch (shiftnError: any) {
      console.error(
        "⚠️ SHIFT-N failed, processing directly with Gemini:",
        shiftnError.message,
      );
      // If SHIFT-N fails, process directly with Gemini
      await processWithGemini(jobId, file.buffer, file.mimetype);
    }

    res.json({ jobId });
  } catch (error: any) {
    console.error("Process error:", error?.response?.data || error);
    res.status(500).json({ message: "Failed to process image" });
  }
};

// POST /api/images/shiftn-callback — SHIFT-N calls this when done
export const shiftnCallback = async (req: Request, res: Response) => {
  try {
    const { requestId, straightenedImage } = req.body;
    console.log("📐 SHIFT-N callback received for job:", requestId);
    console.log("📐 SHIFT-N callback body:", JSON.stringify(req.body, null, 2));

    res.json({ success: true });

    const job = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, requestId))
      .limit(1);
    if (!job.length) {
      console.error("Job not found:", requestId);
      return;
    }

    await db
      .update(jobs)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(jobs.id, requestId));

    // Convert base64 straightened image to buffer
    let imageBase64 = straightenedImage;
    if (imageBase64.includes(",")) imageBase64 = imageBase64.split(",")[1];
    const imageBuffer = Buffer.from(imageBase64, "base64");

    await processWithGemini(requestId, imageBuffer, "image/jpeg");
  } catch (error: any) {
    console.error("Webhook error:", error);
  }
};

// Shared Gemini processing logic
const processWithGemini = async (
  jobId: string,
  imageBuffer: Buffer,
  mimeType: string,
) => {
  try {
    const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job.length) return;

    const { prompt, isCustomPrompt } = job[0];

    console.log("🤖 Sending to Gemini for job:", jobId);
    await db
      .update(jobs)
      .set({ status: "enhancing", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const { editedImage } = await editImageWithVertex(
      imageBuffer,
      mimeType,
      prompt,
      isCustomPrompt ?? false,
    );

    // Upload result to Cloudinary
    const resultUrl = await uploadBase64ToCloudinary(
      editedImage,
      "propenhance/results",
    );
    console.log("✅ Result uploaded:", resultUrl);

    await db
      .update(jobs)
      .set({ status: "completed", resultUrl, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  } catch (error: any) {
    console.error("Gemini processing error:", error);
    await db
      .update(jobs)
      .set({ status: "failed", error: error.message, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  }
};

export const getJobStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params as { jobId: string };
    const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

    if (!job.length) {
      res.status(404).json({ message: "Job not found" });
      return;
    }

    res.json({
      jobId: job[0].id,
      status: job[0].status,
      resultUrl: job[0].resultUrl,
      error: job[0].error,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to get job status" });
  }
};
