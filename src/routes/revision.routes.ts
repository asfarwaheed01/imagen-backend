import { Router } from "express";
import { createRevisions } from "../controllers/revision.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = Router({ mergeParams: true });

router.post("/", isAuthenticated, createRevisions);

export default router;
