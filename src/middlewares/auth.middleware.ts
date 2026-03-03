import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth.service";
import { authService } from "../services/auth.service";

declare global {
  namespace Express {
    interface Request {
      user?: Awaited<ReturnType<typeof authService.findById>>;
    }
  }
}

export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      return res.status(401).json({ message: "Unauthorized" });

    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);

    const user = await authService.findById(Number(payload.sub));
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    req.user = user;
    next();
  } catch (err) {
    console.error("Authentication error:", err);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
