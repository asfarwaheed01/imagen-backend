import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { images, revisions, jobs } from "../db/schema";
import { eq, and, max } from "drizzle-orm";
import { editImageWithVertex } from "../services/vertex.service";
import { uploadBufferToCloudinary } from "../services/cloudinary.service";
import { orderService } from "../services/order.service";
import { randomUUID } from "crypto";
import { uploadBufferToGCS } from "../services/storage.service";

export const createRevisions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user!.id;
    const orderId = Number(req.params.orderId);
    const { imageIds, prompt } = req.body;

    if (!imageIds?.length || !prompt?.trim())
      return res
        .status(400)
        .json({ message: "imageIds and prompt are required" });

    // Verify order belongs to user
    const order = await orderService.getOrderById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.userId !== userId)
      return res.status(403).json({ message: "Forbidden" });

    // Process each image in parallel
    const results = await Promise.allSettled(
      (imageIds as number[]).map((imageId) =>
        processRevision({ imageId, userId, orderId, prompt }),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    if (failed > 0) {
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => r.reason?.message);
      console.error("Revision errors:", errors);
    }

    res.json({ message: "Revisions processed", succeeded, failed });
  } catch (err) {
    next(err);
  }
};

const processRevision = async ({
  imageId,
  userId,
  orderId,
  prompt,
}: {
  imageId: number;
  userId: number;
  orderId: number;
  prompt: string;
}) => {
  const [image] = await db
    .select()
    .from(images)
    .where(and(eq(images.id, imageId), eq(images.userId, userId)))
    .limit(1);

  if (!image) throw new Error(`Image ${imageId} not found`);

  // 2. Determine source image — prefer editedKey, fall back to originalKey
  const sourceKey = image.editedKey ?? image.originalKey;
  if (!sourceKey) throw new Error(`Image ${imageId} has no source URL`);

  // 3. Determine next revision number
  const [{ maxRev }] = await db
    .select({ maxRev: max(revisions.revisionNumber) })
    .from(revisions)
    .where(eq(revisions.imageId, imageId));

  const revisionNumber = (maxRev ?? 0) + 1;

  // 4. Insert revision row (status: in_progress)
  const [revision] = await db
    .insert(revisions)
    .values({
      imageId,
      revisionNumber,
      status: "in_progress",
      clientNotes: prompt,
    })
    .returning();

  try {
    console.log(`🔄 Fetching source image for revision: ${sourceKey}`);
    const response = await fetch(sourceKey);
    if (!response.ok)
      throw new Error(`Failed to fetch source image: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get("content-type") ?? "image/jpeg";

    // 6. Send directly to Vertex AI with the revision prompt
    console.log(
      `🤖 Sending image ${imageId} to Vertex for revision ${revisionNumber}…`,
    );
    const { editedImage, finalPrompt } = await editImageWithVertex(
      imageBuffer,
      mimeType,
      prompt,
      true, // isCustomPrompt = true for revisions
    );

    // 7. Upload result to Cloudinary
    const resultBuffer = Buffer.from(editedImage, "base64");
    // const resultUrl = await uploadBufferToCloudinary(
    //   resultBuffer,
    //   "image/png",
    //   "propenhance/revisions",
    // );

    const resultUrl = await uploadBufferToGCS(
      resultBuffer,
      "image/png",
      `revisions/${randomUUID()}-${imageId}-rev${revisionNumber}.png`,
    );

    await db
      .update(revisions)
      .set({ status: "completed", resultKey: resultUrl })
      .where(eq(revisions.id, revision.id));

    console.log(`✅ Revision ${revisionNumber} completed for image ${imageId}`);
  } catch (err: any) {
    await db
      .update(revisions)
      .set({ status: "rejected" })
      .where(eq(revisions.id, revision.id));

    throw new Error(
      `Revision ${revisionNumber} failed for image ${imageId}: ${err.message}`,
    );
  }
};
