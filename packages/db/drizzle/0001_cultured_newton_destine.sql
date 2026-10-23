CREATE TABLE "offer_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"category" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolution_reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_reports_category_valid" CHECK ("offer_reports"."category" IN ('incorrect_price','wrong_variant','unavailable','merchant_or_source','other')),
	CONSTRAINT "offer_reports_status_valid" CHECK ("offer_reports"."status" IN ('pending','resolved','dismissed')),
	CONSTRAINT "offer_reports_details_length" CHECK (char_length("offer_reports"."details") <= 1000),
	CONSTRAINT "offer_reports_decision_fields" CHECK ((
    "offer_reports"."status" = 'pending'
    AND "offer_reports"."decided_at" IS NULL
    AND "offer_reports"."decided_by" IS NULL
    AND "offer_reports"."resolution_reason" IS NULL
  ) OR (
    "offer_reports"."status" <> 'pending'
    AND "offer_reports"."decided_at" IS NOT NULL
    AND "offer_reports"."decided_by" IS NOT NULL
    AND "offer_reports"."resolution_reason" IS NOT NULL
  ))
);
--> statement-breakpoint
ALTER TABLE "offer_reports" ADD CONSTRAINT "offer_reports_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offer_reports_status_created_idx" ON "offer_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "offer_reports_reporter_created_idx" ON "offer_reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_reports_open_unique" ON "offer_reports" USING btree ("offer_id","reporter_id","category") WHERE "offer_reports"."status" = 'pending';