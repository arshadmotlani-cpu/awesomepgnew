CREATE TABLE IF NOT EXISTS "bed_notice_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bed_id" uuid NOT NULL,
	"visitor_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bed_notice_interest" ADD CONSTRAINT "bed_notice_interest_bed_id_beds_id_fk" FOREIGN KEY ("bed_id") REFERENCES "public"."beds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bed_notice_interest_bed_visitor_unique" ON "bed_notice_interest" ("bed_id", "visitor_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bed_notice_interest_bed_idx" ON "bed_notice_interest" ("bed_id");
