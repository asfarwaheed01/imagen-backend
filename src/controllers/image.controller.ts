// import { Request, Response } from "express";
// import { randomUUID } from "crypto";
// import { db } from "../db";
// import { jobs } from "../db/schema";
// import { desc, eq, sql } from "drizzle-orm";
// import {
//   uploadBufferToCloudinary,
//   uploadBase64ToCloudinary,
// } from "../services/cloudinary.service";
// import { sendToShiftn } from "../services/shiftn.service";
// import { editImageWithVertex } from "../services/vertex.service";

// // POST /api/images/process
// export const processImage = async (req: Request, res: Response) => {
//   try {
//     const file = req.file;
//     const { prompt, isCustomPrompt } = req.body;

//     if (!file) {
//       res.status(400).json({ message: "No image uploaded" });
//       return;
//     }
//     if (!prompt) {
//       res.status(400).json({ message: "Prompt is required" });
//       return;
//     }

//     const jobId = randomUUID();

//     // 1 — Upload original to Cloudinary
//     console.log("☁️  Uploading to Cloudinary...");
//     const originalUrl = await uploadBufferToCloudinary(
//       file.buffer,
//       file.mimetype,
//       "propenhance/originals",
//     );
//     console.log("☁️  Cloudinary URL:", originalUrl);

//     // 2 — Create job in DB
//     await db.insert(jobs).values({
//       id: jobId,
//       status: "pending",
//       originalUrl,
//       prompt,
//       isCustomPrompt: isCustomPrompt === "true",
//     });

//     // 3 — Send to SHIFT-N
//     try {
//       await sendToShiftn(originalUrl, jobId);
//       // await processWithGemini(jobId, file.buffer, file.mimetype);
//       console.log("📐 SHIFT-N accepted job:", jobId);
//     } catch (shiftnError: any) {
//       console.error(
//         "⚠️ SHIFT-N failed, processing directly with Gemini:",
//         shiftnError.message,
//       );
//       // If SHIFT-N fails, process directly with Gemini
//       await processWithGemini(jobId, file.buffer, file.mimetype);
//     }
//     res.json({ jobId });
//   } catch (error: any) {
//     console.error("Process error:", error?.response?.data || error);
//     res.status(500).json({ message: "Failed to process image" });
//   }
// };

// // POST /api/images/shiftn-callback — SHIFT-N calls this when done
// export const shiftnCallback = async (req: Request, res: Response) => {
//   try {
//     const { requestId, image } = req.body;
//     console.log("📐 SHIFT-N callback received for job:", requestId);

//     res.json({ success: true });

//     const job = await db
//       .select()
//       .from(jobs)
//       .where(eq(jobs.id, requestId))
//       .limit(1);

//     if (!job.length) {
//       console.error("Job not found:", requestId);
//       return;
//     }

//     await db
//       .update(jobs)
//       .set({ status: "processing", updatedAt: new Date() })
//       .where(eq(jobs.id, requestId));

//     let imageBase64 = image;
//     if (imageBase64.includes(",")) imageBase64 = imageBase64.split(",")[1];
//     const imageBuffer = Buffer.from(imageBase64, "base64");

//     await processWithGemini(requestId, imageBuffer, "image/jpeg");
//   } catch (error: any) {
//     console.error("Webhook error:", error);
//   }
// };

// // Shared Gemini processing logic
// const processWithGemini = async (
//   jobId: string,
//   imageBuffer: Buffer,
//   mimeType: string,
// ) => {
//   try {
//     const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
//     if (!job.length) return;

//     const { prompt, isCustomPrompt } = job[0];

//     console.log("🤖 Sending to Gemini for job:", jobId);
//     await db
//       .update(jobs)
//       .set({ status: "enhancing", updatedAt: new Date() })
//       .where(eq(jobs.id, jobId));

//     const { editedImage } = await editImageWithVertex(
//       imageBuffer,
//       mimeType,
//       prompt,
//       isCustomPrompt ?? false,
//     );

//     const resultUrl = await uploadBase64ToCloudinary(
//       editedImage,
//       "propenhance/results",
//     );
//     console.log("✅ Result uploaded:", resultUrl);

//     await db
//       .update(jobs)
//       .set({ status: "completed", resultUrl, updatedAt: new Date() })
//       .where(eq(jobs.id, jobId));
//   } catch (error: any) {
//     console.error("Gemini processing error:", error);
//     await db
//       .update(jobs)
//       .set({ status: "failed", error: error.message, updatedAt: new Date() })
//       .where(eq(jobs.id, jobId));
//   }
// };

// export const getJobStatus = async (req: Request, res: Response) => {
//   try {
//     const { jobId } = req.params as { jobId: string };
//     const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

//     if (!job.length) {
//       res.status(404).json({ message: "Job not found" });
//       return;
//     }

//     res.json({
//       jobId: job[0].id,
//       status: job[0].status,
//       resultUrl: job[0].resultUrl,
//       error: job[0].error,
//     });
//   } catch (error: any) {
//     res.status(500).json({ message: "Failed to get job status" });
//   }
// };

// // GET /api/images/gallery?page=1&limit=10
// export const getGallery = async (req: Request, res: Response) => {
//   try {
//     const page = Math.max(1, parseInt(req.query.page as string) || 1);
//     const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
//     const offset = (page - 1) * limit;

//     const [galleryJobs, total] = await Promise.all([
//       db
//         .select({
//           id: jobs.id,
//           status: jobs.status,
//           originalUrl: jobs.originalUrl,
//           resultUrl: jobs.resultUrl,
//           prompt: jobs.prompt,
//           createdAt: jobs.createdAt,
//         })
//         .from(jobs)
//         .where(eq(jobs.status, "completed"))
//         .orderBy(desc(jobs.createdAt))
//         .limit(limit)
//         .offset(offset),

//       db
//         .select({ count: sql<number>`count(*)` })
//         .from(jobs)
//         .where(eq(jobs.status, "completed")),
//     ]);

//     const totalCount = Number(total[0].count);

//     res.json({
//       data: galleryJobs,
//       pagination: {
//         page,
//         limit,
//         total: totalCount,
//         totalPages: Math.ceil(totalCount / limit),
//         hasNext: page < Math.ceil(totalCount / limit),
//         hasPrev: page > 1,
//       },
//     });
//   } catch (error: any) {
//     res.status(500).json({ message: "Failed to fetch gallery" });
//   }
// };

import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { db } from "../db";
import { jobs, images } from "../db/schema";
import { desc, eq, sql } from "drizzle-orm";
import {
  uploadBufferToCloudinary,
  uploadBase64ToCloudinary,
} from "../services/cloudinary.service";
import { sendToShiftn } from "../services/shiftn.service";
import { editImageWithVertex } from "../services/vertex.service";

// ── Shared Gemini processing logic ────────────────────────────────────────────

export const processWithGemini = async (
  jobId: string,
  imageBuffer: Buffer,
  mimeType: string,
) => {
  try {
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    if (!job) return;

    const { prompt, isCustomPrompt } = job;

    console.log("🤖 Sending to Gemini for job:", jobId);
    await db
      .update(jobs)
      .set({ status: "enhancing", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const { editedImage } = await editImageWithVertex(
      imageBuffer,
      mimeType,
      prompt ?? "",
      isCustomPrompt ?? false,
    );

    const resultKey = await uploadBase64ToCloudinary(
      editedImage,
      "propenhance/results",
    );
    console.log("✅ Result uploaded:", resultKey);

    await db
      .update(jobs)
      .set({ status: "completed", resultKey, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    // Sync image row if linked
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

    // Sync image row if linked
    const [job] = await db
      .select({ imageId: jobs.imageId })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    if (job?.imageId) {
      await db
        .update(images)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(images.id, job.imageId));
    }
  }
};

// ── POST /api/images/process — single image (original flow) ───────────────────

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

    console.log("☁️  Uploading to Cloudinary...");
    const inputKey = await uploadBufferToCloudinary(
      file.buffer,
      file.mimetype,
      "propenhance/originals",
    );
    console.log("☁️  Cloudinary URL:", inputKey);

    await db.insert(jobs).values({
      id: jobId,
      imageId: 0, // single-image flow has no order/image row
      type: "ai_edit",
      status: "pending",
      inputKey,
      prompt,
      isCustomPrompt: isCustomPrompt === "true",
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

// ── POST /api/orders/:orderId/images — bulk upload after payment ──────────────

export const uploadOrderImages = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const orderId = Number(req.params.orderId);
    const files = req.files as Express.Multer.File[];
    const prompt =
      req.body.prompt ?? "Enhance this real estate photo professionally";
    const isCustomPrompt = req.body.isCustomPrompt === "true";

    if (!files?.length) {
      res.status(400).json({ message: "No images provided" });
      return;
    }

    const jobIds: string[] = [];

    await Promise.all(
      files.map(async (file, index) => {
        const jobId = randomUUID();

        // 1 — Upload original to Cloudinary
        const inputKey = await uploadBufferToCloudinary(
          file.buffer,
          file.mimetype,
          "propenhance/originals",
        );
        console.log(`☁️  [${index + 1}/${files.length}] Cloudinary:`, inputKey);

        // 2 — Create image row
        const [image] = await db
          .insert(images)
          .values({
            orderId,
            userId: user.id,
            status: "uploaded",
            originalKey: inputKey,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            fileSizeBytes: file.size,
            sortOrder: index,
          })
          .returning();

        // 3 — Create job linked to image
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

        // 4 — Send to SHIFT-N, fallback to Gemini
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
          await processWithGemini(jobId, file.buffer, file.mimetype);
        }
      }),
    );

    res.json({
      message: "Images queued for processing",
      jobIds,
      count: files.length,
    });
  } catch (error: any) {
    console.error("Bulk upload error:", error?.response?.data || error);
    res.status(500).json({ message: "Failed to upload images" });
  }
};

// ── POST /api/images/shiftn-callback — unchanged ──────────────────────────────

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
    const imageBuffer = Buffer.from(imageBase64, "base64");

    await processWithGemini(requestId, imageBuffer, "image/jpeg");
  } catch (error: any) {
    console.error("Webhook error:", error);
  }
};

// ── GET /api/images/status/:jobId ─────────────────────────────────────────────

export const getJobStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params as { jobId: string };
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
      resultUrl: job.resultKey, // keep response key as resultUrl for frontend compat
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

    res.json({
      data: galleryJobs.map((j) => ({
        ...j,
        originalUrl: j.inputKey, // alias for frontend compat
        resultUrl: j.resultKey,
      })),
      pagination: {
        page,
        limit,
        total: Number(total[0].count),
        totalPages: Math.ceil(Number(total[0].count) / limit),
        hasNext: page < Math.ceil(Number(total[0].count) / limit),
        hasPrev: page > 1,
      },
    });
  } catch {
    res.status(500).json({ message: "Failed to fetch gallery" });
  }
};
