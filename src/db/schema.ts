import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  emailVerifiedAt: timestamp("email_verified_at"),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordTokenExpiresAt: timestamp("reset_password_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("pending"),
  originalUrl: text("original_url").notNull(),
  resultUrl: text("result_url"),
  prompt: text("prompt").notNull(),
  isCustomPrompt: boolean("is_custom_prompt").default(false).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
