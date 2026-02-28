import { Router } from "express";
import {
  processImage,
  shiftnCallback,
  getJobStatus,
} from "../controllers/image.controller";
import { upload } from "../middlewares/upload.middleware";

const router = Router();

router.post("/process", upload.single("image"), processImage);
router.post("/shiftn-callbackURL", shiftnCallback);
router.get("/job/:jobId", getJobStatus);

export default router;
