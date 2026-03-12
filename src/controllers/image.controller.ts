import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { db } from "../db";
import { jobs, images } from "../db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { sendToShiftn } from "../services/shiftn.service";
import { editImageWithVertex } from "../services/vertex.service";
import {
  uploadBufferToGCS,
  uploadBase64ToGCS,
} from "../services/storage.service";
import {
  uploadBase64ToCloudinary,
  uploadBufferToCloudinary,
} from "../services/cloudinary.service";
import { CATEGORY_PROMPTS } from "../constants/prompts";
import axios from "axios";

let geminiLocked = false;
const geminiQueue: Array<() => void> = [];

const acquireGemini = (): Promise<void> =>
  new Promise((resolve) => {
    if (!geminiLocked) {
      geminiLocked = true;
      resolve();
    } else {
      console.log("⏳ Gemini busy — queuing job");
      geminiQueue.push(resolve);
    }
  });

const releaseGemini = () => {
  const next = geminiQueue.shift();
  if (next) next();
  else geminiLocked = false;
};

const DEFAULT_PROMPT =
  "Enhance the general quality of this real estate photo. Improve lighting, colour accuracy, and sharpness.";

const buildPrompt = (
  category?: string,
  notes?: string,
): { prompt: string; isCustomPrompt: boolean } => {
  const base = (category && CATEGORY_PROMPTS[category]) ?? DEFAULT_PROMPT;
  const hasNotes = !!notes?.trim();
  return {
    prompt: hasNotes
      ? `${base} Additional instructions: ${notes!.trim()}`
      : base,
    isCustomPrompt: hasNotes,
  };
};

// ── Shared Gemini processing logic ────────────────────────────────────────────

export const processWithGemini = async (
  jobId: string,
  imageSource: Buffer | string,
  mimeType = "image/jpeg",
) => {
  try {
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    if (!job) return;

    console.log("🤖 Sending to Gemini for job:", jobId);
    await db
      .update(jobs)
      .set({ status: "enhancing", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    let imageBuffer: Buffer;

    if (Buffer.isBuffer(imageSource)) {
      imageBuffer = imageSource;
    } else {
      const response = await axios.get(imageSource, {
        responseType: "arraybuffer",
      });
      imageBuffer = Buffer.from(response.data);
      mimeType = response.headers["content-type"] ?? "image/jpeg";
    }

    // const { editedImage } = await editImageWithVertex(
    //   imageBuffer,
    //   mimeType,
    //   job.prompt ?? "",
    //   job.isCustomPrompt ?? false,
    // );

    await acquireGemini();
    console.log(`🔒 Gemini lock acquired for job: ${jobId}`);
    let editedImage: string;
    try {
      const result = await editImageWithVertex(
        imageBuffer,
        mimeType,
        job.prompt ?? "",
        job.isCustomPrompt ?? false,
      );
      editedImage = result.editedImage;
    } finally {
      releaseGemini();
      console.log(`🔓 Gemini lock released for job: ${jobId}`);
    }

    const resultKey = await uploadBase64ToGCS(editedImage, "results");

    console.log("✅ Result uploaded:", resultKey);

    await db
      .update(jobs)
      .set({ status: "completed", resultKey, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    if (job.imageId) {
      await db
        .update(images)
        .set({ status: "edited", editedKey: resultKey, updatedAt: new Date() })
        .where(eq(images.id, job.imageId));
    }
  } catch (error: any) {
    console.error("Gemini processing error:", error);
    await db
      .update(jobs)
      .set({ status: "failed", error: error.message, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const [failedJob] = await db
      .select({ imageId: jobs.imageId })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (failedJob?.imageId) {
      await db
        .update(images)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(images.id, failedJob.imageId));
    }
  }
};

// ── POST /api/images/process — single image ───────────────────────────────────

export const processImage = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { category, notes } = req.body;

    if (!file) {
      res.status(400).json({ message: "No image uploaded" });
      return;
    }

    const jobId = randomUUID();
    const { prompt, isCustomPrompt } = buildPrompt(category, notes);

    const inputKey = await uploadBufferToGCS(
      file.buffer,
      file.mimetype,
      `originals/${jobId}-${file.originalname}`,
    );
    // const inputKey = await uploadBufferToCloudinary(
    //   file.buffer,
    //   file.mimetype,
    //   "propenhance/originals",
    // );
    console.log("☁️  GCS:", inputKey);

    await db.insert(jobs).values({
      id: jobId,
      imageId: 0,
      type: "ai_edit",
      status: "pending",
      inputKey,
      prompt,
      isCustomPrompt,
    });

    try {
      await sendToShiftn(inputKey, jobId);
      console.log("📐 SHIFT-N accepted job:", jobId);
    } catch (shiftnError: any) {
      console.error(
        "⚠️ SHIFT-N failed, processing directly:",
        shiftnError.message,
      );
      await processWithGemini(jobId, file.buffer, file.mimetype);
    }

    res.json({ jobId });
  } catch (error: any) {
    console.error("Process error:", error?.response?.data || error);
    res.status(500).json({ message: "Failed to process image" });
  }
};

export const uploadOrderImages = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const orderId = Number(req.params.orderId);

    const gcpUrls: string[] = req.body.gcpUrls ?? [];
    const imageMeta: { category: string; notes: string }[] =
      req.body.imageMeta ?? [];

    if (!gcpUrls.length) {
      res.status(400).json({ message: "No image URLs provided" });
      return;
    }

    const jobIds: string[] = [];

    await Promise.all(
      gcpUrls.map(async (inputKey, index) => {
        const jobId = randomUUID();
        const meta = imageMeta[index] ?? { category: "", notes: "" };
        const { prompt, isCustomPrompt } = buildPrompt(
          meta.category,
          meta.notes,
        );

        const originalFilename = inputKey.split("/").pop() ?? `image-${index}`;
        const mimeType = originalFilename.endsWith(".jpg")
          ? "image/jpeg"
          : "image/png";

        console.log(`☁️  [${index + 1}/${gcpUrls.length}] GCS:`, inputKey);

        const [image] = await db
          .insert(images)
          .values({
            orderId,
            userId: user.id,
            status: "uploaded",
            originalKey: inputKey,
            originalFilename,
            mimeType,
            fileSizeBytes: 0,
            sortOrder: index,
            category: meta.category || null,
            clientNotes: meta.notes || null,
          })
          .returning();

        await db.insert(jobs).values({
          id: jobId,
          imageId: image.id,
          type: "straighten",
          status: "pending",
          inputKey,
          prompt,
          isCustomPrompt,
        });

        jobIds.push(jobId);

        try {
          await sendToShiftn(inputKey, jobId);
          console.log(`📐 SHIFT-N accepted job: ${jobId}`);
          await db
            .update(images)
            .set({ status: "straightening", updatedAt: new Date() })
            .where(eq(images.id, image.id));
        } catch (shiftnError: any) {
          console.error(
            "⚠️ SHIFT-N failed, processing directly:",
            shiftnError.message,
          );
          await processWithGemini(jobId, inputKey);
        }
      }),
    );

    res.json({
      message: "Images queued for processing",
      jobIds,
      count: gcpUrls.length,
    });
  } catch (error: any) {
    console.error("Bulk upload error:", error?.response?.data || error);
    res.status(500).json({ message: "Failed to upload images" });
  }
};

// ── POST /api/images/shiftn-callback ─────────────────────────────────────────

export const shiftnCallback = async (req: Request, res: Response) => {
  try {
    const { requestId, image } = req.body;
    console.log("📐 SHIFT-N callback received for job:", requestId);

    res.json({ success: true });

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, requestId))
      .limit(1);
    if (!job) {
      console.error("Job not found:", requestId);
      return;
    }

    await db
      .update(jobs)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(jobs.id, requestId));

    if (job.imageId) {
      await db
        .update(images)
        .set({ status: "straightened", updatedAt: new Date() })
        .where(eq(images.id, job.imageId));
    }

    let imageBase64 = image;
    if (imageBase64.includes(",")) imageBase64 = imageBase64.split(",")[1];
    await processWithGemini(
      requestId,
      Buffer.from(imageBase64, "base64"),
      "image/jpeg",
    );
  } catch (error: any) {
    console.error("Webhook error:", error);
  }
};

// ── GET /api/images/status/:jobId ─────────────────────────────────────────────

export const getJobStatus = async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    if (!job) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    res.json({
      jobId: job.id,
      status: job.status,
      resultUrl: job.resultKey,
      error: job.error,
    });
  } catch {
    res.status(500).json({ message: "Failed to get job status" });
  }
};

// ── GET /api/images/gallery ───────────────────────────────────────────────────

export const getGallery = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
    const offset = (page - 1) * limit;

    const [galleryJobs, total] = await Promise.all([
      db
        .select({
          id: jobs.id,
          status: jobs.status,
          inputKey: jobs.inputKey,
          resultKey: jobs.resultKey,
          prompt: jobs.prompt,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .where(eq(jobs.status, "completed"))
        .orderBy(desc(jobs.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(eq(jobs.status, "completed")),
    ]);

    const totalCount = Number(total[0].count);
    res.json({
      data: galleryJobs.map((j) => ({
        ...j,
        originalUrl: j.inputKey,
        resultUrl: j.resultKey,
      })),
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1,
      },
    });
  } catch {
    res.status(500).json({ message: "Failed to fetch gallery" });
  }
};
