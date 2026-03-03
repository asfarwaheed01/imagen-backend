import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { properties, orders, images, jobs, revisions } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";

export const getLibrary = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user!.id;

    const rows = await db
      .select({
        propertyId: properties.id,
        address: properties.address,
        propertyType: properties.propertyType,
        bedrooms: properties.bedrooms,
        bathrooms: properties.bathrooms,
        carSpaces: properties.carSpaces,
        createdAt: properties.createdAt,
        orderId: orders.id,
        orderStatus: orders.status,
        imageCount: orders.imageCount,
        totalCost: orders.totalCost,
        paidAt: orders.paidAt,
        orderCreatedAt: orders.createdAt,
      })
      .from(properties)
      .leftJoin(orders, eq(orders.propertyId, properties.id))
      .where(eq(properties.userId, userId))
      .orderBy(desc(properties.createdAt));

    const propertyMap = new Map<number, any>();

    for (const row of rows) {
      if (!propertyMap.has(row.propertyId)) {
        propertyMap.set(row.propertyId, {
          id: row.propertyId,
          address: row.address,
          propertyType: row.propertyType,
          bedrooms: row.bedrooms,
          bathrooms: row.bathrooms,
          carSpaces: row.carSpaces,
          createdAt: row.createdAt,
          orders: [],
        });
      }

      if (row.orderId) {
        propertyMap.get(row.propertyId).orders.push({
          id: row.orderId,
          status: row.orderStatus,
          imageCount: row.imageCount,
          totalCost: row.totalCost,
          paidAt: row.paidAt,
          createdAt: row.orderCreatedAt,
        });
      }
    }

    res.json({ properties: Array.from(propertyMap.values()) });
  } catch (err) {
    next(err);
  }
};

export const getOrderDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user!.id;
    const orderId = Number(req.params.orderId);

    const [order] = await db
      .select({
        id: orders.id,
        status: orders.status,
        imageCount: orders.imageCount,
        totalCost: orders.totalCost,
        paidAt: orders.paidAt,
        createdAt: orders.createdAt,
        address: properties.address,
        propertyType: properties.propertyType,
      })
      .from(orders)
      .leftJoin(properties, eq(properties.id, orders.propertyId))
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1);

    if (!order) return res.status(404).json({ message: "Order not found" });

    const orderImages = await db
      .select({
        imageId: images.id,
        status: images.status,
        originalKey: images.originalKey,
        straightenedKey: images.straightenedKey,
        editedKey: images.editedKey,
        deliveredKey: images.deliveredKey,
        originalFilename: images.originalFilename,
        sortOrder: images.sortOrder,
        createdAt: images.createdAt,
        jobId: jobs.id,
        jobType: jobs.type,
        jobStatus: jobs.status,
        resultKey: jobs.resultKey,
        jobError: jobs.error,
      })
      .from(images)
      .leftJoin(jobs, eq(jobs.imageId, images.id))
      .where(eq(images.orderId, orderId))
      .orderBy(images.sortOrder);

    const imageIds = orderImages.map((i) => i.imageId);

    const imageRevisions =
      imageIds.length > 0
        ? await db
            .select({
              revisionId: revisions.id,
              imageId: revisions.imageId,
              revisionNumber: revisions.revisionNumber,
              status: revisions.status,
              clientNotes: revisions.clientNotes,
              resultKey: revisions.resultKey,
              createdAt: revisions.createdAt,
            })
            .from(revisions)
            .where(eq(revisions.imageId, imageIds[0]))
            .orderBy(desc(revisions.revisionNumber))
        : [];

    const revisionsMap = new Map<number, any[]>();
    for (const rev of imageRevisions) {
      if (!revisionsMap.has(rev.imageId)) revisionsMap.set(rev.imageId, []);
      revisionsMap.get(rev.imageId)!.push(rev);
    }

    const imagesWithRevisions = orderImages.map((img) => ({
      id: img.imageId,
      status: img.status,
      originalKey: img.originalKey,
      straightenedKey: img.straightenedKey,
      editedKey: img.editedKey,
      deliveredKey: img.deliveredKey,
      originalFilename: img.originalFilename,
      sortOrder: img.sortOrder,
      createdAt: img.createdAt,
      job: img.jobId
        ? {
            id: img.jobId,
            type: img.jobType,
            status: img.jobStatus,
            resultKey: img.resultKey,
            error: img.jobError,
          }
        : null,
      revisions: revisionsMap.get(img.imageId) ?? [],
    }));

    res.json({ order, images: imagesWithRevisions });
  } catch (err) {
    next(err);
  }
};
