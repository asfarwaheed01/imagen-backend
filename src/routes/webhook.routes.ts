import { Router } from "express";
import { stripeWebhook } from "../controllers/webhook.controller";

const router = Router();

router.post("/stripe", stripeWebhook);

export default router;
