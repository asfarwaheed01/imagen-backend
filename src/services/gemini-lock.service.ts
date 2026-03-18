import { db } from "../db";
import { geminiLock } from "../db/schema";
import { eq, sql } from "drizzle-orm";

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export async function acquireGlobalGeminiLock(jobId: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      INSERT INTO gemini_lock (id, locked_at, job_id)
      VALUES (1, NOW(), ${jobId})
      ON CONFLICT (id) DO UPDATE
        SET locked_at = NOW(), job_id = ${jobId}
        WHERE gemini_lock.locked_at IS NULL
           OR gemini_lock.locked_at < NOW() - INTERVAL '5 minutes'
      RETURNING id
    `);
    return (result.rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function releaseGlobalGeminiLock(): Promise<void> {
  await db
    .update(geminiLock)
    .set({ lockedAt: null, jobId: null })
    .where(eq(geminiLock.id, 1));
}

export async function waitForGlobalGeminiLock(
  jobId: string,
  intervalMs = 5000,
  maxWaitMs = 10 * 60 * 1000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const acquired = await acquireGlobalGeminiLock(jobId);
    if (acquired) return;
    console.log(`⏳ [${jobId}] Waiting for Gemini lock...`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`[${jobId}] Timed out waiting for Gemini lock`);
}
