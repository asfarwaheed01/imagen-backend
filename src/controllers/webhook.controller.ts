import { Request, Response } from "express";
import Stripe from "stripe";
import { orderService } from "../services/order.service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

export const stripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];

  if (!sig)
    return res.status(400).json({ message: "Missing stripe-signature header" });

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ message: `Webhook error: ${err.message}` });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      try {
        const order = await orderService.markOrderPaid(paymentIntent.id);
        if (order) console.log(`✅ Order ${order.id} marked as paid`);
      } catch (err) {
        console.error("Failed to mark order as paid:", err);
        return res.status(500).json({ message: "DB update failed" });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.error(`❌ Payment failed for intent: ${paymentIntent.id}`);
      break;
    }

    default:
      break;
  }

  res.json({ received: true });
};
