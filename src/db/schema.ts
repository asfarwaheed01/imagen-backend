// import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

// export const users = pgTable("users", {
//   id: serial("id").primaryKey(),
//   fullName: text("full_name").notNull(),
//   email: text("email").notNull().unique(),
//   passwordHash: text("password_hash").notNull(),
//   emailVerified: boolean("email_verified").default(false).notNull(),
//   emailVerifiedAt: timestamp("email_verified_at"),
//   resetPasswordToken: text("reset_password_token"),
//   resetPasswordTokenExpiresAt: timestamp("reset_password_token_expires_at"),
//   createdAt: timestamp("created_at").defaultNow().notNull(),
//   updatedAt: timestamp("updated_at").defaultNow().notNull(),
// });

// export const jobs = pgTable("jobs", {
//   id: text("id").primaryKey(),
//   status: text("status").notNull().default("pending"),
//   originalUrl: text("original_url").notNull(),
//   resultUrl: text("result_url"),
//   prompt: text("prompt").notNull(),
//   isCustomPrompt: boolean("is_custom_prompt").default(false).notNull(),
//   error: text("error"),
//   createdAt: timestamp("created_at").defaultNow().notNull(),
//   updatedAt: timestamp("updated_at").defaultNow().notNull(),
// });

import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export const orderStatusEnum = pgEnum("order_status", [
  "pending", // created, not yet paid
  "paid", // payment confirmed
  "processing", // images are being worked on
  "completed", // all images delivered
  "cancelled",
]);

export const imageStatusEnum = pgEnum("image_status", [
  "uploaded", // raw file stored in S3/R2
  "straightening", // sent to Shift-N, awaiting webhook
  "straightened", // webhook received, ready for AI edit
  "editing", // sent to Vertex AI
  "edited", // AI edit complete
  "delivered", // final version visible to client
  "failed",
]);

export const jobTypeEnum = pgEnum("job_type", [
  "straighten", // Shift-N job
  "ai_edit", // Vertex AI edit job
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "processing",
  "enhancing",
  "completed",
  "failed",
]);

export const revisionStatusEnum = pgEnum("revision_status", [
  "pending",
  "in_progress",
  "completed",
  "rejected",
]);

// ─────────────────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTIES
// One user → many properties (addresses they submit images for)
// ─────────────────────────────────────────────────────────────────────────────

export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  propertyType: text("property_type").notNull(), // House | Apartment | etc.
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  carSpaces: integer("car_spaces"),
  additionalInfo: text("additional_info"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// One property submission = one order (a batch of images)
// Tracks payment and the selected image package
// ─────────────────────────────────────────────────────────────────────────────

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  propertyId: integer("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  status: orderStatusEnum("status").default("pending").notNull(),
  imageCount: integer("image_count").notNull(), // selected package (2, 5, 10…)
  totalCost: numeric("total_cost", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  // Payment — store provider + reference only (never card data)
  paymentProvider: text("payment_provider"), // "stripe" | "paypal" etc.
  paymentIntentId: text("payment_intent_id").unique(), // Stripe PaymentIntent id
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// IMAGES
// One order → many images (one row per uploaded file)
// Tracks the full lifecycle: upload → straighten → AI edit → deliver
// ─────────────────────────────────────────────────────────────────────────────

export const images = pgTable("images", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: imageStatusEnum("status").default("uploaded").notNull(),
  // Storage keys (S3 / R2 object keys, not full URLs — build URLs at runtime)
  originalKey: text("original_key").notNull(), // client-uploaded file
  straightenedKey: text("straightened_key"), // after Shift-N
  editedKey: text("edited_key"), // after Vertex AI
  deliveredKey: text("delivered_key"), // final approved version
  // Original file metadata
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  sortOrder: integer("sort_order").default(0).notNull(), // display order in order
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// JOBS
// Low-level processing unit — one job per external API call.
// An image can have many jobs across its lifecycle.
// Your existing jobs table extended to be image-aware and typed.
// ─────────────────────────────────────────────────────────────────────────────

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(), // UUID
  imageId: integer("image_id")
    .notNull()
    .references(() => images.id, { onDelete: "cascade" }),
  type: jobTypeEnum("type").notNull(), // "straighten" | "ai_edit"
  status: jobStatusEnum("status").default("pending").notNull(),
  // Input / output
  inputKey: text("input_key").notNull(), // storage key sent to service
  resultKey: text("result_key"), // storage key of result
  prompt: text("prompt"), // only for ai_edit jobs
  isCustomPrompt: boolean("is_custom_prompt").default(false).notNull(),
  // External service tracking
  externalJobId: text("external_job_id"), // Shift-N job id or Vertex op id
  webhookReceivedAt: timestamp("webhook_received_at"),
  error: text("error"),
  attemptCount: integer("attempt_count").default(0).notNull(), // for retry logic
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// REVISIONS
// A client can request multiple rounds of edits on a delivered image.
// Each revision round spins up a new ai_edit job.
// ─────────────────────────────────────────────────────────────────────────────

export const revisions = pgTable("revisions", {
  id: serial("id").primaryKey(),
  imageId: integer("image_id")
    .notNull()
    .references(() => images.id, { onDelete: "cascade" }),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
  revisionNumber: integer("revision_number").notNull(), // 1, 2, 3…
  status: revisionStatusEnum("status").default("pending").notNull(),
  // What the client asked for
  clientNotes: text("client_notes"),
  // The result of this specific revision
  resultKey: text("result_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  properties: many(properties),
  orders: many(orders),
  images: many(images),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  user: one(users, { fields: [properties.userId], references: [users.id] }),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  property: one(properties, {
    fields: [orders.propertyId],
    references: [properties.id],
  }),
  images: many(images),
}));

export const imagesRelations = relations(images, ({ one, many }) => ({
  order: one(orders, { fields: [images.orderId], references: [orders.id] }),
  user: one(users, { fields: [images.userId], references: [users.id] }),
  jobs: many(jobs),
  revisions: many(revisions),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  image: one(images, { fields: [jobs.imageId], references: [images.id] }),
}));

export const revisionsRelations = relations(revisions, ({ one }) => ({
  image: one(images, { fields: [revisions.imageId], references: [images.id] }),
  job: one(jobs, { fields: [revisions.jobId], references: [jobs.id] }),
}));
