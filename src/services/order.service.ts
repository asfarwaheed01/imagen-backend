import { eq } from "drizzle-orm";
import { db } from "../db";
import { properties, orders } from "../db/schema";

export interface CreateOrderInput {
  userId: number;
  address: string;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  carSpaces: number;
  additionalInfo?: string;
  imageCount: number;
  totalCost: number;
  paymentIntentId: string;
}

export const orderService = {
  async createPendingOrder(input: CreateOrderInput) {
    return await db.transaction(async (tx) => {
      // 1. Create or reuse property
      const [property] = await tx
        .insert(properties)
        .values({
          userId: input.userId,
          address: input.address,
          propertyType: input.propertyType,
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
          carSpaces: input.carSpaces,
          additionalInfo: input.additionalInfo,
        })
        .returning();

      // 2. Create order linked to property
      const [order] = await tx
        .insert(orders)
        .values({
          userId: input.userId,
          propertyId: property.id,
          status: "pending",
          imageCount: input.imageCount,
          totalCost: String(input.totalCost),
          currency: "USD",
          paymentProvider: "stripe",
          paymentIntentId: input.paymentIntentId,
        })
        .returning();

      return { property, order };
    });
  },

  async markOrderPaid(paymentIntentId: string) {
    const [order] = await db
      .update(orders)
      .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.paymentIntentId, paymentIntentId))
      .returning();
    return order;
  },

  async getOrderById(orderId: number) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    return order ?? null;
  },
};
