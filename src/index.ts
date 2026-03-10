import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "./db";
import { sql } from "drizzle-orm";
import imageRoutes from "./routes/image.routes";
import authRoutes from "./routes/auth.routes";
import cookieParser from "cookie-parser";
import orderRoutes from "./routes/order.routes";
import { isAuthenticated } from "./middlewares/auth.middleware";
import webhookRoutes from "./routes/webhook.routes";
import libraryRoutes from "./routes/library.routes";
import placesRoutes from "./routes/places.routes";
import uploadRoutes from "./routes/upload.routes";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  webhookRoutes,
);

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://imagen-jet-one.vercel.app",
    ],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const checkDbConnection = async () => {
  try {
    await db.execute(sql`SELECT 1`);
    console.log("✅ Database connected");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  }
};

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/me", isAuthenticated, (req, res) => {
  res.json({ user: (req as any).user });
});

app.use("/api/images", imageRoutes);
app.use("/api/upload", uploadRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/places", placesRoutes);

// ── Start Server ────────────────────────────────────────────
const start = async () => {
  await checkDbConnection();
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

start();
