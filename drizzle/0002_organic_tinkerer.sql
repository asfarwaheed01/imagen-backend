CREATE TYPE "public"."image_status" AS ENUM('uploaded', 'straightening', 'straightened', 'editing', 'edited', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('straighten', 'ai_edit');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'processing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('pending', 'in_progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TABLE "images" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" "image_status" DEFAULT 'uploaded' NOT NULL,
	"original_key" text NOT NULL,
	"straightened_key" text,
	"edited_key" text,
	"delivered_key" text,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"image_count" integer NOT NULL,
	"total_cost" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"payment_provider" text,
	"payment_intent_id" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_payment_intent_id_unique" UNIQUE("payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"address" text NOT NULL,
	"property_type" text NOT NULL,
	"bedrooms" integer,
	"bathrooms" integer,
	"car_spaces" integer,
	"additional_info" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_id" integer NOT NULL,
	"job_id" text,
	"revision_number" integer NOT NULL,
	"status" "revision_status" DEFAULT 'pending' NOT NULL,
	"client_notes" text,
	"result_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."job_status";--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "status" SET DATA TYPE "public"."job_status" USING "status"::"public"."job_status";--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "prompt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "image_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "type" "job_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "input_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "result_key" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "external_job_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "webhook_received_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "original_url";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "result_url";