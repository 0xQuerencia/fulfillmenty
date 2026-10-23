import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const countries = pgTable("countries", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  defaultCurrency: text("default_currency"),
  currencyCodes: text("currency_codes").array().notNull().default([]),
  coverageTier: text("coverage_tier").notNull().default("global"),
  enabled: boolean("enabled").notNull().default(true),
}, (table) => [check("countries_code_format", sql`${table.code} ~ '^[A-Z]{2}$'`)]);

export const currencies = pgTable("currencies", {
  code: text("code").primaryKey(),
  numericCode: text("numeric_code").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  decimals: integer("decimals").notNull(),
  active: boolean("active").notNull().default(true),
}, (table) => [
  check("currencies_code_format", sql`${table.code} ~ '^[A-Z]{3}$'`),
  check("currencies_decimals_range", sql`${table.decimals} BETWEEN 0 AND 4`),
]);

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: text("parent_id").references((): AnyPgColumn => categories.id),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  brand: text("brand").notNull(),
  name: text("name").notNull(),
  model: text("model").notNull(),
  categoryId: text("category_id").notNull().references(() => categories.id),
  description: text("description").notNull().default(""),
  state: text("state").notNull().default("published"),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productVariants = pgTable("product_variants", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id),
  mpn: text("mpn"),
  gtin: text("gtin"),
  sku: text("sku"),
  attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
  condition: text("condition").notNull().default("new"),
}, (table) => [index("product_variants_product_idx").on(table.productId)]);

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  homeCountry: text("home_country").references(() => countries.code),
  site: text("site"),
  sellerType: text("seller_type").notNull().default("unknown"),
  trustStatus: text("trust_status").notNull().default("unassessed"),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
});

export const merchantListings = pgTable("merchant_listings", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  canonicalUrl: text("canonical_url").notNull(),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull().default("community_submission"),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("merchant_listing_url_unique").on(table.canonicalUrl)]);

export const offers = pgTable("offers", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").notNull().references(() => merchantListings.id),
  variantId: text("variant_id").notNull().references(() => productVariants.id),
  destinationCountry: text("destination_country").notNull().references(() => countries.code),
  subdivision: text("subdivision"),
  status: text("status").notNull().default("provisional"),
  availability: text("availability").notNull().default("unknown"),
  shippingAmountMinor: bigint("shipping_amount_minor", { mode: "bigint" }),
  shippingCurrency: text("shipping_currency").references(() => currencies.code),
  shippingStatus: text("shipping_status").notNull().default("unknown"),
  taxInclusion: text("tax_inclusion").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("offers_variant_destination_idx").on(table.variantId, table.destinationCountry, table.status),
  index("offers_listing_idx").on(table.listingId),
  uniqueIndex("offers_listing_variant_destination_unique").on(table.listingId, table.variantId, table.destinationCountry),
  check("offers_shipping_amount_currency_pair", sql`(${table.shippingAmountMinor} IS NULL) = (${table.shippingCurrency} IS NULL)`),
]);

export const priceObservations = pgTable("price_observations", {
  id: text("id").primaryKey(),
  offerId: text("offer_id").notNull().references(() => offers.id),
  amountMinor: bigint("amount_minor", { mode: "bigint" }),
  currency: text("currency").references(() => currencies.code),
  observedAt: timestamp("observed_at", { withTimezone: true }),
  status: text("status").notNull(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url").notNull(),
  method: text("method").notNull().default("manual"),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("price_observations_offer_observed_idx").on(table.offerId, table.observedAt),
  check("price_observations_amount_currency_pair", sql`(${table.amountMinor} IS NULL) = (${table.currency} IS NULL)`),
]);

export const submissions = pgTable("submissions", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  productId: text("product_id").notNull().references(() => products.id),
  destinationCountry: text("destination_country").notNull().references(() => countries.code),
  merchantUrl: text("merchant_url").notNull(),
  urlFingerprint: text("url_fingerprint").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("pending"),
  creatorId: text("creator_id").notNull(),
  decisionReason: text("decision_reason"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("submissions_status_created_idx").on(table.status, table.createdAt),
  uniqueIndex("submissions_active_fingerprint_unique")
    .on(table.urlFingerprint, table.productId, table.destinationCountry)
    .where(sql`status IN ('pending', 'accepted_for_research')`),
]);

export const moderationDecisions = pgTable("moderation_decisions", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull().references(() => submissions.id),
  actorId: text("actor_id").notNull(),
  outcome: text("outcome").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("moderation_decisions_submission_idx").on(table.submissionId, table.createdAt)]);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  requestId: text("request_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_events_subject_idx").on(table.subjectType, table.subjectId, table.createdAt)]);

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  prefix: text("prefix").notNull(),
  secretHash: text("secret_hash").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("api_keys_prefix_unique").on(table.prefix)]);
