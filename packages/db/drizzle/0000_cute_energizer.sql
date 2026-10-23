CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"request_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" text,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_currency" text,
	"currency_codes" text[] DEFAULT '{}' NOT NULL,
	"coverage_tier" text DEFAULT 'global' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "countries_code_format" CHECK ("countries"."code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"numeric_code" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"decimals" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "currencies_code_format" CHECK ("currencies"."code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "currencies_decimals_range" CHECK ("currencies"."decimals" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "merchant_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"source_type" text DEFAULT 'community_submission' NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"home_country" text,
	"site" text,
	"seller_type" text DEFAULT 'unknown' NOT NULL,
	"trust_status" text DEFAULT 'unassessed' NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"destination_country" text NOT NULL,
	"subdivision" text,
	"status" text DEFAULT 'provisional' NOT NULL,
	"availability" text DEFAULT 'unknown' NOT NULL,
	"shipping_amount_minor" bigint,
	"shipping_currency" text,
	"shipping_status" text DEFAULT 'unknown' NOT NULL,
	"tax_inclusion" text DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_shipping_amount_currency_pair" CHECK (("offers"."shipping_amount_minor" IS NULL) = ("offers"."shipping_currency" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"amount_minor" bigint,
	"currency" text,
	"observed_at" timestamp with time zone,
	"status" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text NOT NULL,
	"method" text DEFAULT 'manual' NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_observations_amount_currency_pair" CHECK (("price_observations"."amount_minor" IS NULL) = ("price_observations"."currency" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"mpn" text,
	"gtin" text,
	"sku" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"condition" text DEFAULT 'new' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"name" text NOT NULL,
	"model" text NOT NULL,
	"category_id" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'published' NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"product_id" text NOT NULL,
	"destination_country" text NOT NULL,
	"merchant_url" text NOT NULL,
	"url_fingerprint" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"creator_id" text NOT NULL,
	"decision_reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_listings" ADD CONSTRAINT "merchant_listings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_home_country_countries_code_fk" FOREIGN KEY ("home_country") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_decisions" ADD CONSTRAINT "moderation_decisions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_listing_id_merchant_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."merchant_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_destination_country_countries_code_fk" FOREIGN KEY ("destination_country") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_shipping_currency_currencies_code_fk" FOREIGN KEY ("shipping_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_destination_country_countries_code_fk" FOREIGN KEY ("destination_country") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_prefix_unique" ON "api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_type","subject_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_listing_url_unique" ON "merchant_listings" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "moderation_decisions_submission_idx" ON "moderation_decisions" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE INDEX "offers_variant_destination_idx" ON "offers" USING btree ("variant_id","destination_country","status");--> statement-breakpoint
CREATE INDEX "offers_listing_idx" ON "offers" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_listing_variant_destination_unique" ON "offers" USING btree ("listing_id","variant_id","destination_country");--> statement-breakpoint
CREATE INDEX "price_observations_offer_observed_idx" ON "price_observations" USING btree ("offer_id","observed_at");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "submissions_status_created_idx" ON "submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_active_fingerprint_unique" ON "submissions" USING btree ("url_fingerprint","product_id","destination_country") WHERE status IN ('pending', 'accepted_for_research');