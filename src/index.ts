import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { sql } from "drizzle-orm";
import imageRoutes from "./routes/image.routes";

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());

app.use(
  cors({
    origin:
      process.env.FRONTEND_URL ||
      "http://localhost:3000" ||
      "http://localhost:5173",
    credentials: true,
  }),
);

// ── JWT Middleware ──────────────────────────────────────────
export const authenticateToken = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Access token missing" });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    (req as any).user = payload;
    next();
  } catch {
    res.status(403).json({ message: "Invalid or expired token" });
  }
};

// ── DB Connection Check ─────────────────────────────────────
const checkDbConnection = async () => {
  try {
    await db.execute(sql`SELECT 1`);
    console.log("✅ Database connected");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }
};

// ── Routes ──────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Protected route example
app.get("/me", authenticateToken, (req, res) => {
  res.json({ user: (req as any).user });
});

app.use("/api/images", imageRoutes);

// ── Start Server ────────────────────────────────────────────
const start = async () => {
  await checkDbConnection();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
};

start();
