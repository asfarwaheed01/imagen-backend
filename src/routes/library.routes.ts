import { Router } from "express";
import { getLibrary, getOrderDetail } from "../controllers/library.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = Router();

router.get("/",           isAuthenticated, getLibrary);
router.get("/:orderId",   isAuthenticated, getOrderDetail);

export default router;