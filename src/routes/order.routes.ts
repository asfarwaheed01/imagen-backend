import { Router } from "express";
import multer from "multer";
import { uploadOrderImages } from "../controllers/image.controller";
import {
  createPaymentIntent,
  getOrderStatus,
} from "../controllers/order.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/create-payment-intent", isAuthenticated, createPaymentIntent);
router.post(
  "/:orderId/images",
  isAuthenticated,
  upload.array("images", 50),
  uploadOrderImages,
);
router.get("/:orderId/status", isAuthenticated, getOrderStatus);

export default router;
