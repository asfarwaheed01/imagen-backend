import { Router } from "express";
import {
  signUp,
  signIn,
  signOut,
  refresh,
  me,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller";
import { isAuthenticated } from "../middlewares/auth.middleware";

const router = Router();

// Public
router.post("/signup", signUp);
router.post("/signin", signIn);
router.post("/refresh", refresh);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Protected
router.post("/signout", isAuthenticated, signOut);
router.get("/me", isAuthenticated, me);

export default router;
