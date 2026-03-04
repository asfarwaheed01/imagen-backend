import { Request, Response, NextFunction } from "express";
import {
  authService,
  generateTokens,
  verifyRefreshToken,
} from "../services/auth.service";

// ── Cookie helper ─────────────────────────────────────────────────────────────

const REFRESH_COOKIE = "refresh_token";

const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/auth/refresh",
  });
};

// ── Controllers ───────────────────────────────────────────────────────────────

export const signUp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password)
      return res
        .status(400)
        .json({ message: "fullName, email and password are required" });
    if (password.length < 8)
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });

    const user = await authService.signUp({ fullName, email, password });
    const { accessToken, refreshToken } = generateTokens(user);

    setRefreshCookie(res, refreshToken);
    res.status(201).json({ accessToken, user });
  } catch (err: any) {
    if (err.status)
      return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

export const signIn = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ message: "email and password are required" });

    const user = await authService.validateCredentials({ email, password });
    const { accessToken, refreshToken } = generateTokens(user);

    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user });
  } catch (err: any) {
    if (err.status)
      return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) return res.status(401).json({ message: "No refresh token" });

    const payload = verifyRefreshToken(token);
    const user = await authService.findById(Number(payload.sub));
    if (!user) return res.status(401).json({ message: "User not found" });

    const { accessToken, refreshToken } = generateTokens(user);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user });
  } catch {
    res.status(401).json({ message: "Invalid or expired refresh token" });
  }
};

export const signOut = (_req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth/refresh" });
  res.json({ message: "Signed out" });
};

export const me = (req: Request, res: Response) => {
  res.json({ user: req.user });
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    await authService.forgotPassword(email);
    // TODO: send token via email (Resend / SendGrid / nodemailer)
    res.json({ message: "If that email exists, a reset link has been sent" });
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res
        .status(400)
        .json({ message: "token and password are required" });
    if (password.length < 8)
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    await authService.resetPassword(token, password);
    res.json({ message: "Password reset successfully" });
  } catch (err: any) {
    if (err.status)
      return res.status(err.status).json({ message: err.message });
    next(err);
  }
};
