import { Router } from "express";
import multer from "multer";
import { uploadOrderImages } from "../controllers/image.controller";
import {
  createPaymentIntent,
  getOrderStatus,
} from "../controllers/order.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";
import { createRevisions } from "../controllers/revision.controller";

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

router.post("/create-payment-intent", isAuthenticated, createPaymentIntent);
router.post(
  "/:orderId/images",
  isAuthenticated,
  upload.array("images", 50),
  uploadOrderImages,
);
router.get("/:orderId/status", isAuthenticated, getOrderStatus);
router.post("/:orderId/revisions", isAuthenticated, createRevisions);

export default router;
