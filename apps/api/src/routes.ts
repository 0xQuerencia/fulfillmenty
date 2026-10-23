import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authorize } from "./auth.js";
import { db } from "./db.js";
import { apiError } from "./errors.js";
import { DisallowedUrlError, normalizeSubmittedUrl } from "./security/submitted-url.js";

const limitSchema = z.coerce.number().int().min(1).max(100).default(25);
const alpha2Schema = z.string().regex(/^[A-Z]{2}$/);
const submissionSchema = z.object({
  type: z.literal("offer_suggestion").default("offer_suggestion"),
  product_id: z.string().min(3).max(100),
  destination_country: alpha2Schema,
  merchant_url: z.string().min(8).max(2048),
  notes: z.string().max(500).default(""),
});
const decisionSchema = z.object({
  outcome: z.enum(["accept", "reject"]),
  reason: z.string().trim().min(8).max(1000),
});
const observationSchema = z.object({
  amount_minor: z.string().regex(/^[0-9]{1,18}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  availability: z.enum(["available", "limited", "unavailable", "unknown"]).default("unknown"),
  tax_inclusion: z.enum(["included", "excluded", "unknown", "not_applicable"]).default("unknown"),
});

type OfferRow = {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  brand: string;
  model: string;
  variant_attributes: Record<string, unknown>;
  merchant_id: string;
  merchant_name: string;
  merchant_trust_status: string;
  destination_country: string;
  subdivision: string | null;
  listing_url: string;
  listing_is_synthetic: boolean;
  offer_status: string;
  availability: string;
  shipping_amount_minor: string | null;
  shipping_currency: string | null;
  shipping_status: string;
  tax_inclusion: string;
  amount_minor: string | null;
  currency: string | null;
  observed_at: Date | null;
  observation_created_at: Date | null;
  observation_status: string | null;
  source_type: string | null;
  is_synthetic: boolean | null;
};

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const value = Number(decoded);
    return Number.isSafeInteger(value) && value >= 0 && value <= 100_000 ? value : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString("base64url");
}

function ageHours(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, (Date.now() - date.getTime()) / 3_600_000);
}

function mapOffer(row: OfferRow) {
  const synthetic = Boolean(row.is_synthetic || row.listing_is_synthetic || row.observation_status === "illustrative");
  const observedAt = row.observed_at?.toISOString() ?? null;
  const effectiveDate = row.observed_at ?? row.observation_created_at;
  const hours = synthetic ? null : ageHours(effectiveDate);
  const freshness = synthetic
    ? "illustrative"
    : hours === null
      ? "unverified"
      : hours <= 24
        ? "fresh"
        : hours <= 72
          ? "aging"
          : "stale";
  const amount = row.amount_minor === null ? null : String(row.amount_minor);
  const shippingAmount = row.shipping_amount_minor === null ? null : String(row.shipping_amount_minor);
  const missing: string[] = [];
  if (row.shipping_status !== "quoted" || shippingAmount === null) missing.push("shipping");
  if (!["included", "not_applicable"].includes(row.tax_inclusion)) missing.push("applicable_tax_and_import_fees");

  let total: string | null = null;
  if (amount !== null && row.currency && row.shipping_status === "quoted" && shippingAmount !== null &&
      row.shipping_currency === row.currency && ["included", "not_applicable"].includes(row.tax_inclusion)) {
    total = (BigInt(amount) + BigInt(shippingAmount)).toString();
  }

  return {
    id: row.id,
    product_id: row.product_id,
    product: { name: row.product_name, brand: row.brand, model: row.model },
    variant_id: row.variant_id,
    variant: { attributes: row.variant_attributes },
    merchant: { id: row.merchant_id, name: row.merchant_name, trust_status: row.merchant_trust_status },
    destination: { country: row.destination_country, subdivision: row.subdivision },
    price: {
      amount_minor: amount,
      currency: row.currency,
      tax_inclusion: row.tax_inclusion,
      observed_at: observedAt,
      status: synthetic ? "illustrative" : amount === null ? "unknown" : row.observation_status,
      source_type: row.source_type,
    },
    shipping: {
      amount_minor: shippingAmount,
      currency: row.shipping_currency ?? row.currency,
      status: row.shipping_status,
    },
    landed_cost: {
      known_subtotal_minor: amount,
      estimated_total_minor: total,
      currency: row.currency,
      completeness: total !== null ? "complete" : amount !== null ? "partial" : "unknown",
      missing_components: missing,
    },
    availability: row.availability,
    freshness: {
      status: freshness,
      last_successful_check_at: synthetic ? null : observedAt,
    },
    verification: {
      link_checked: false,
      price_checked: !synthetic && amount !== null,
      purchase_confirmed: false,
      organization_endorsements: [],
    },
    source: {
      url: row.listing_url,
      source_type: row.source_type,
      synthetic,
    },
  };
}

const offerSelect = `
  SELECT o.id, p.id AS product_id, v.id AS variant_id, p.name AS product_name,
         p.brand, p.model, v.attributes AS variant_attributes,
         m.id AS merchant_id, m.name AS merchant_name, m.trust_status AS merchant_trust_status,
         o.destination_country, o.subdivision, l.canonical_url AS listing_url,
         l.is_synthetic AS listing_is_synthetic, o.status AS offer_status, o.availability,
         o.shipping_amount_minor::text, o.shipping_currency, o.shipping_status, o.tax_inclusion,
         po.amount_minor::text, po.currency, po.observed_at, po.created_at AS observation_created_at,
         po.status AS observation_status, po.source_type, po.is_synthetic
  FROM offers o
  JOIN merchant_listings l ON l.id = o.listing_id
  JOIN merchants m ON m.id = l.merchant_id
  JOIN product_variants v ON v.id = o.variant_id
  JOIN products p ON p.id = v.product_id
  LEFT JOIN LATERAL (
    SELECT amount_minor, currency, observed_at, created_at, status, source_type, is_synthetic
    FROM price_observations po
  WHERE po.offer_id = o.id AND po.status IN ('observed', 'illustrative')
    ORDER BY COALESCE(po.observed_at, po.created_at) DESC, po.created_at DESC
    LIMIT 1
  ) po ON true
`;

async function loadOffer(id: string) {
  const result = await db.query<OfferRow>(`${offerSelect} WHERE o.id = $1 AND o.status='published' AND p.state='published'`, [id]);
  return result.rows[0] ? mapOffer(result.rows[0]) : null;
}

async function requireActor(
  request: FastifyRequest,
  reply: FastifyReply,
  scope: "contribute" | "moderate",
) {
  try {
    const actor = await authorize(request, scope);
    if (actor) return actor;
  } catch (error) {
    request.log.error({ err: error }, "Authorization lookup failed");
    apiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Authentication is temporarily unavailable.");
    return null;
  }
  apiError(reply, request, 401, "UNAUTHORIZED", "An authorized API key or local demo role is required.");
  return null;
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/v1/health", { schema: { tags: ["System"], summary: "Check API and database availability" } }, async (_request, reply) => {
    try {
      await db.query("SELECT 1");
      return { status: "ok", service: "fulfillmenty-api", schema_version: "v1", timestamp: new Date().toISOString() };
    } catch {
      return reply.code(503).send({ status: "unavailable", service: "fulfillmenty-api", schema_version: "v1" });
    }
  });

  app.get("/v1/countries", { schema: { tags: ["Catalog"], summary: "List ISO country references and catalog coverage" } }, async (request) => {
    const result = await db.query(
      `SELECT c.code, c.name, c.default_currency, c.currency_codes, c.coverage_tier,
              COUNT(o.id)::int AS published_offer_count,
              MAX(po.observed_at) FILTER (WHERE po.is_synthetic = false) AS last_observed_at
       FROM countries c
       LEFT JOIN offers o ON o.destination_country = c.code AND o.status = 'published'
       LEFT JOIN LATERAL (
         SELECT observed_at, is_synthetic FROM price_observations pox
         WHERE pox.offer_id = o.id AND pox.status = 'observed'
         ORDER BY pox.observed_at DESC NULLS LAST LIMIT 1
       ) po ON true
       WHERE c.enabled = true
       GROUP BY c.code, c.name, c.default_currency, c.currency_codes, c.coverage_tier
       ORDER BY CASE c.coverage_tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END, c.name`,
    );
    return { data: result.rows, request_id: request.id, meta: { synthetic_demo_data: true } };
  });

  app.get("/v1/categories", { schema: { tags: ["Catalog"], summary: "List product categories" } }, async (request) => {
    const result = await db.query(
      `SELECT c.id, c.name, c.slug, c.parent_id, COUNT(p.id)::int AS product_count
       FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.state = 'published'
       GROUP BY c.id ORDER BY c.name`,
    );
    return { data: result.rows, request_id: request.id };
  });

  app.get("/v1/currencies", { schema: { tags: ["Catalog"], summary: "List active ISO 4217 currencies and minor-unit scales" } }, async (request) => {
    const result = await db.query(`SELECT code,numeric_code,name,symbol,decimals FROM currencies WHERE active=true ORDER BY code`);
    return { data: result.rows, request_id: request.id };
  });

  app.get("/v1/products", { schema: { tags: ["Catalog"], summary: "Search and list canonical products" } }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const limitResult = limitSchema.safeParse(query.limit);
    const search = (query.search ?? "").trim().slice(0, 120);
    const category = query.category_id;
    if (!limitResult.success) return apiError(reply, request, 400, "INVALID_QUERY", "limit must be between 1 and 100.");
    const limit = limitResult.data;
    const offset = decodeCursor(query.cursor);
    const values: unknown[] = [];
    const clauses = ["p.state = 'published'"];
    if (search) {
      values.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
      clauses.push(`(p.name ILIKE $${values.length} ESCAPE '\\' OR p.brand ILIKE $${values.length} ESCAPE '\\' OR p.model ILIKE $${values.length} ESCAPE '\\')`);
    }
    if (category) {
      values.push(category.slice(0, 100));
      clauses.push(`p.category_id = $${values.length}`);
    }
    const where = clauses.join(" AND ");
    const count = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM products p WHERE ${where}`, values);
    const rows = await db.query(
      `SELECT p.id, p.brand, p.name, p.model, p.category_id, c.name AS category_name,
              p.description, p.is_synthetic,
              (SELECT COUNT(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variant_count
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE ${where} ORDER BY p.brand, p.model, p.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );
    return {
      data: rows.rows,
      pagination: { limit, next_cursor: offset + rows.rows.length < count.rows[0].count ? encodeCursor(offset + rows.rows.length) : null, total: count.rows[0].count },
      request_id: request.id,
      meta: { synthetic_demo_data: rows.rows.some((row) => row.is_synthetic) },
    };
  });

  app.get<{ Params: { id: string } }>("/v1/products/:id", { schema: { tags: ["Catalog"], summary: "Get a product and its exact variants" } }, async (request, reply) => {
    const result = await db.query(
      `SELECT p.id, p.brand, p.name, p.model, p.category_id, c.name AS category_name,
              p.description, p.is_synthetic, p.created_at
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1 AND p.state = 'published'`,
      [request.params.id],
    );
    const product = result.rows[0];
    if (!product) return apiError(reply, request, 404, "UNKNOWN_PRODUCT", "No published product matches that ID.");
    const variants = await db.query(
      `SELECT id, mpn, gtin, sku, attributes, condition FROM product_variants WHERE product_id = $1 ORDER BY id`,
      [product.id],
    );
    const offers = await db.query(`SELECT COUNT(*)::int AS count FROM offers o JOIN product_variants v ON v.id = o.variant_id WHERE v.product_id = $1 AND o.status = 'published'`, [product.id]);
    return { data: { ...product, variants: variants.rows, published_offer_count: offers.rows[0].count }, request_id: request.id };
  });

  app.get("/v1/offers", { schema: { tags: ["Offers"], summary: "List destination-specific offers with price provenance" } }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const limitResult = limitSchema.safeParse(query.limit);
    if (!limitResult.success) return apiError(reply, request, 400, "INVALID_QUERY", "limit must be between 1 and 100.");
    if (query.ship_to && !alpha2Schema.safeParse(query.ship_to).success) return apiError(reply, request, 400, "INVALID_QUERY", "ship_to must be an ISO alpha-2 country code.");
    if (query.sort && !["item_price", "last_checked", "landed_cost", "relevance"].includes(query.sort)) return apiError(reply, request, 400, "INVALID_QUERY", "sort must be item_price, landed_cost, last_checked, or relevance.");
    if (query.include_stale && !["true", "false"].includes(query.include_stale)) return apiError(reply, request, 400, "INVALID_QUERY", "include_stale must be true or false.");
    const limit = limitResult.data;
    const offset = decodeCursor(query.cursor);
    const values: unknown[] = [];
    const clauses = ["o.status = 'published'", "p.state = 'published'"];
    if (query.ship_to) { values.push(query.ship_to); clauses.push(`o.destination_country = $${values.length}`); }
    if (query.product_id) { values.push(query.product_id); clauses.push(`p.id = $${values.length}`); }
    if (query.variant_id) { values.push(query.variant_id); clauses.push(`o.variant_id = $${values.length}`); }
    const includeStale = query.include_stale === "true";
    if (!includeStale) clauses.push("(po.is_synthetic = true OR po.observed_at IS NULL OR po.observed_at >= now() - interval '72 hours')");
    const where = clauses.join(" AND ");
    const sort = query.sort;
    const orderBy = sort === "item_price"
      ? "po.amount_minor ASC NULLS LAST, o.id ASC"
      : sort === "last_checked"
        ? "po.observed_at DESC NULLS LAST, o.id ASC"
        : sort === "landed_cost"
          ? "CASE WHEN po.amount_minor IS NOT NULL AND o.shipping_amount_minor IS NOT NULL AND o.shipping_currency = po.currency AND o.tax_inclusion IN ('included','not_applicable') THEN po.amount_minor + o.shipping_amount_minor ELSE NULL END ASC NULLS LAST, o.id ASC"
          : "o.id ASC";
    const result = await db.query<OfferRow>(
      `${offerSelect} WHERE ${where} ORDER BY ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit + 1, offset],
    );
    const hasNext = result.rows.length > limit;
    const pageRows = hasNext ? result.rows.slice(0, limit) : result.rows;
    return {
      data: pageRows.map(mapOffer),
      pagination: { limit, next_cursor: hasNext ? encodeCursor(offset + limit) : null },
      request_id: request.id,
      meta: { synthetic_demo_data: pageRows.some((row) => row.is_synthetic || row.listing_is_synthetic) },
    };
  });

  app.get<{ Params: { id: string } }>("/v1/offers/:id", { schema: { tags: ["Offers"], summary: "Get an offer and its provenance" } }, async (request, reply) => {
    const offer = await loadOffer(request.params.id);
    return offer ? { data: offer, request_id: request.id } : apiError(reply, request, 404, "NO_VERIFIED_OFFERS", "No published offer matches that ID.");
  });

  app.get<{ Params: { id: string } }>("/v1/offers/:id/history", { schema: { tags: ["Offers"], summary: "List actual price observations for an offer" } }, async (request, reply) => {
    const existing = await db.query("SELECT id FROM offers WHERE id = $1 AND status = 'published'", [request.params.id]);
    if (!existing.rowCount) return apiError(reply, request, 404, "NO_VERIFIED_OFFERS", "No published offer matches that ID.");
    const rows = await db.query(
      `SELECT id, amount_minor::text, currency, observed_at, status, source_type, method
       FROM price_observations WHERE offer_id = $1 AND is_synthetic = false AND status = 'observed'
       ORDER BY observed_at DESC NULLS LAST, created_at DESC LIMIT 200`,
      [request.params.id],
    );
    return { data: rows.rows, request_id: request.id, meta: { synthetic_observations_excluded: true } };
  });

  app.get("/v1/merchants", { schema: { tags: ["Catalog"], summary: "Search the merchant directory" } }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const limit = limitSchema.safeParse(query.limit).success ? limitSchema.parse(query.limit) : 25;
    const search = (query.search ?? "").trim().slice(0, 100);
    const result = await db.query(
      `SELECT m.id, m.name, m.home_country, m.site, m.seller_type, m.trust_status, m.is_synthetic,
              COUNT(o.id)::int AS published_offer_count
       FROM merchants m
       LEFT JOIN merchant_listings l ON l.merchant_id = m.id
       LEFT JOIN offers o ON o.listing_id = l.id AND o.status = 'published'
       WHERE ($1 = '' OR m.name ILIKE $2 OR m.site ILIKE $2)
         AND EXISTS (SELECT 1 FROM merchant_listings visible_l JOIN offers visible_o ON visible_o.listing_id=visible_l.id
                     WHERE visible_l.merchant_id=m.id AND visible_o.status='published')
       GROUP BY m.id ORDER BY m.name LIMIT $3`,
      [search, `%${search}%`, limit],
    );
    return { data: result.rows, request_id: request.id, meta: { synthetic_demo_data: result.rows.some((row) => row.is_synthetic) } };
  });

  app.get<{ Params: { id: string } }>("/v1/merchants/:id", { schema: { tags: ["Catalog"], summary: "Get a merchant and its public listings" } }, async (request, reply) => {
    const result = await db.query(
      `SELECT m.id,m.name,m.home_country,m.site,m.seller_type,m.trust_status,m.is_synthetic
       FROM merchants m WHERE m.id=$1 AND EXISTS (
         SELECT 1 FROM merchant_listings visible_l JOIN offers visible_o ON visible_o.listing_id=visible_l.id
         WHERE visible_l.merchant_id=m.id AND visible_o.status='published'
       )`,
      [request.params.id],
    );
    const merchant = result.rows[0];
    if (!merchant) return apiError(reply, request, 404, "UNKNOWN_MERCHANT", "No merchant matches that ID.");
    const listings = await db.query(
      `SELECT l.id,l.title,l.canonical_url,l.source_type,l.is_synthetic,
              COUNT(o.id)::int AS published_offer_count
       FROM merchant_listings l LEFT JOIN offers o ON o.listing_id=l.id AND o.status='published'
       WHERE l.merchant_id=$1 AND EXISTS (
         SELECT 1 FROM offers visible_o WHERE visible_o.listing_id=l.id AND visible_o.status='published'
       ) GROUP BY l.id ORDER BY l.title`,
      [merchant.id],
    );
    return { data: { ...merchant, listings: listings.rows }, request_id: request.id };
  });

  app.get("/v1/coverage", { schema: { tags: ["Catalog"], summary: "Summarize catalog coverage by destination country" } }, async (request) => {
    const result = await db.query(
      `SELECT c.code AS country, c.name, c.coverage_tier, COUNT(o.id)::int AS published_offers,
              COUNT(DISTINCT v.product_id)::int AS products_covered,
              COUNT(*) FILTER (WHERE po.is_synthetic = false AND po.observed_at >= now() - interval '72 hours')::int AS recent_observations
       FROM countries c
       LEFT JOIN offers o ON o.destination_country = c.code AND o.status = 'published'
       LEFT JOIN product_variants v ON v.id = o.variant_id
       LEFT JOIN LATERAL (
         SELECT is_synthetic, observed_at FROM price_observations pox WHERE pox.offer_id = o.id AND pox.status = 'observed'
         ORDER BY pox.observed_at DESC NULLS LAST LIMIT 1
       ) po ON true
       WHERE c.enabled = true
       GROUP BY c.code, c.name, c.coverage_tier
       ORDER BY CASE c.coverage_tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END, c.name`,
    );
    return { data: result.rows, request_id: request.id, meta: { source: "Fulfillmenty catalog coverage, not order volume", synthetic_demo_data: true } };
  });

  app.get("/v1/stats", { schema: { tags: ["System"], summary: "Show transparent catalog aggregate counts" } }, async (request) => {
    const result = await db.query(
      `SELECT (SELECT COUNT(*)::int FROM products WHERE state = 'published') AS products,
              (SELECT COUNT(*)::int FROM offers WHERE status = 'published') AS published_offers,
              (SELECT COUNT(*)::int FROM submissions WHERE status = 'pending') AS pending_submissions,
              (SELECT COUNT(*)::int FROM countries WHERE enabled = true) AS countries,
              (SELECT COUNT(*)::int FROM price_observations WHERE is_synthetic = false AND status = 'observed') AS actual_price_observations,
              (SELECT COUNT(*)::int FROM offers o JOIN merchant_listings l ON l.id = o.listing_id WHERE o.status = 'published' AND l.is_synthetic = true) AS illustrative_offers`,
    );
    return {
      data: result.rows[0], request_id: request.id,
      meta: { warning: "Catalog counts are not order or demand data. Illustrative records are not live prices or real merchant listings." },
    };
  });

  app.get("/v1/data/exports", { schema: { tags: ["Catalog"], summary: "List published data exports and terms" } }, async (request) => ({
    data: [],
    request_id: request.id,
    meta: { message: "No public snapshots are published yet.", terms: "No export license has been selected yet." },
  }));

  app.post("/v1/submissions", { schema: { tags: ["Community"], summary: "Submit a merchant offer suggestion for moderation", security: [{ BearerAuth: [] }, { LocalDemoRole: [] }] } }, async (request, reply) => {
    const actor = await requireActor(request, reply, "contribute");
    if (!actor) return;
    const parsed = submissionSchema.safeParse(request.body);
    if (!parsed.success) return apiError(reply, request, 400, "INVALID_QUERY", "Submission fields are invalid.", parsed.error.flatten().fieldErrors);
    let normalized: ReturnType<typeof normalizeSubmittedUrl>;
    try {
      normalized = normalizeSubmittedUrl(parsed.data.merchant_url);
    } catch (error) {
      if (error instanceof DisallowedUrlError) return apiError(reply, request, 400, "URL_DISALLOWED", error.message);
      throw error;
    }
    const references = await db.query(
      `SELECT p.id FROM products p JOIN countries c ON c.code = $2
       WHERE p.id = $1 AND p.state = 'published' AND c.enabled = true`,
      [parsed.data.product_id, parsed.data.destination_country],
    );
    if (!references.rowCount) return apiError(reply, request, 404, "UNKNOWN_PRODUCT", "The product or destination country is not available.");
    const id = `sub_${randomUUID()}`;
    const client = await db.connect();
    let createdAt: Date;
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ created_at: Date }>(
        `INSERT INTO submissions(id,type,product_id,destination_country,merchant_url,url_fingerprint,notes,creator_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (url_fingerprint,product_id,destination_country)
           WHERE status IN ('pending','accepted_for_research') DO NOTHING
         RETURNING created_at`,
        [id, parsed.data.type, parsed.data.product_id, parsed.data.destination_country, normalized.url, normalized.fingerprint, parsed.data.notes, actor.id],
      );
      if (!inserted.rowCount) {
        await client.query("ROLLBACK");
        return apiError(reply, request, 409, "SUBMISSION_DUPLICATE", "A matching submission is already in the review workflow.");
      }
      createdAt = inserted.rows[0].created_at;
      await client.query(
        `INSERT INTO audit_events(id,actor_id,action,subject_type,subject_id,request_id,metadata)
         VALUES($1,$2,'submission.created','submission',$3,$4,$5::jsonb)`,
        [`audit_${randomUUID()}`, actor.id, id, request.id,
          JSON.stringify({ product_id: parsed.data.product_id, destination_country: parsed.data.destination_country, hostname: normalized.hostname })],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      request.log.error({ err: error, submissionId: id }, "Submission could not be saved");
      return apiError(reply, request, 503, "SERVICE_UNAVAILABLE", "The submission could not be saved right now.");
    } finally {
      client.release();
    }
    request.log.info({ submissionId: id, hostname: normalized.hostname, demo: actor.demo }, "Merchant URL submitted for moderation; no fetch was performed");
    return reply.code(202).send({
      data: { id, status: "pending", created_at: createdAt.toISOString() },
      request_id: request.id,
      meta: { merchant_url_fetched: false },
    });
  });

  app.get<{ Params: { id: string } }>("/v1/submissions/:id", { schema: { tags: ["Community"], summary: "Get an owned submission status", security: [{ BearerAuth: [] }, { LocalDemoRole: [] }] } }, async (request, reply) => {
    const actor = await requireActor(request, reply, "contribute");
    if (!actor) return;
    const result = await db.query(
      `SELECT s.id, s.type, s.product_id, p.name AS product_name, s.destination_country,
              s.merchant_url, s.notes, s.status, s.decision_reason, s.created_at, s.decided_at, s.creator_id
       FROM submissions s JOIN products p ON p.id=s.product_id WHERE s.id=$1`,
      [request.params.id],
    );
    const row = result.rows[0];
    if (!row || (row.creator_id !== actor.id && !actor.scopes.includes("moderate"))) {
      return apiError(reply, request, 404, "UNKNOWN_SUBMISSION", "No submission is available for this account.");
    }
    const { creator_id: _privateCreatorId, ...data } = row;
    return { data, request_id: request.id };
  });

  app.get("/v1/admin/moderation", { schema: { tags: ["Moderation"], summary: "List moderation submissions", security: [{ BearerAuth: [] }, { LocalDemoRole: [] }] } }, async (request, reply) => {
    const actor = await requireActor(request, reply, "moderate");
    if (!actor) return;
    const query = request.query as Record<string, string | undefined>;
    const status = query.status && ["pending", "accepted_for_research", "rejected"].includes(query.status) ? query.status : "pending";
    const result = await db.query(
      `SELECT s.id, s.type, s.product_id, p.name AS product_name, p.brand, p.model,
              s.destination_country, c.name AS destination_name, s.merchant_url, s.notes,
              s.status, s.created_at, s.creator_id, provisional.id AS provisional_offer_id
       FROM submissions s JOIN products p ON p.id=s.product_id JOIN countries c ON c.code=s.destination_country
       LEFT JOIN LATERAL (
         SELECT o.id FROM offers o JOIN merchant_listings l ON l.id=o.listing_id
         JOIN product_variants v ON v.id=o.variant_id
         WHERE l.canonical_url=s.merchant_url AND v.product_id=s.product_id
           AND o.destination_country=s.destination_country AND o.status='provisional'
         ORDER BY o.created_at DESC LIMIT 1
       ) provisional ON true
       WHERE s.status=$1 ORDER BY s.created_at ASC LIMIT 100`,
      [status],
    );
    return { data: result.rows, request_id: request.id, meta: { local_demo_moderation: actor.demo } };
  });

  app.post<{ Params: { id: string } }>("/v1/admin/moderation/:id/decision", { schema: { tags: ["Moderation"], summary: "Accept or reject a submission with an audit record", security: [{ BearerAuth: [] }, { LocalDemoRole: [] }] } }, async (request, reply) => {
    const actor = await requireActor(request, reply, "moderate");
    if (!actor) return;
    const parsed = decisionSchema.safeParse(request.body);
    if (!parsed.success) return apiError(reply, request, 400, "INVALID_QUERY", "Provide an accept/reject outcome and a reason of at least 8 characters.");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query(
        `SELECT s.*, p.name AS product_name, p.brand
         FROM submissions s JOIN products p ON p.id=s.product_id WHERE s.id=$1 FOR UPDATE OF s`,
        [request.params.id],
      );
      const submission = selected.rows[0];
      if (!submission) {
        await client.query("ROLLBACK");
        return apiError(reply, request, 404, "UNKNOWN_SUBMISSION", "No submission matches that ID.");
      }
      if (submission.status !== "pending") {
        await client.query("ROLLBACK");
        return apiError(reply, request, 409, "MODERATION_REQUIRED", "This submission has already received a decision.");
      }

      const nextStatus = parsed.data.outcome === "accept" ? "accepted_for_research" : "rejected";
      await client.query(
        `UPDATE submissions SET status=$2, decision_reason=$3, decided_by=$4, decided_at=now() WHERE id=$1`,
        [submission.id, nextStatus, parsed.data.reason, actor.id],
      );

      let provisionalOfferId: string | null = null;
      if (parsed.data.outcome === "accept") {
        const variant = await client.query(`SELECT id FROM product_variants WHERE product_id=$1 ORDER BY id LIMIT 1`, [submission.product_id]);
        if (!variant.rowCount) {
          await client.query("ROLLBACK");
          return apiError(reply, request, 409, "MODERATION_REQUIRED", "Add an exact product variant before accepting a listing suggestion.");
        }
        const parsedUrl = new URL(submission.merchant_url);
        let merchant = await client.query(`SELECT id FROM merchants WHERE site=$1 ORDER BY id LIMIT 1`, [`https://${parsedUrl.hostname}`]);
        if (!merchant.rowCount) {
          const merchantId = `merchant_${randomUUID()}`;
          merchant = await client.query(
            `INSERT INTO merchants(id,name,site,seller_type,trust_status) VALUES($1,$2,$3,'unknown','unassessed') RETURNING id`,
            [merchantId, parsedUrl.hostname, `https://${parsedUrl.hostname}`],
          );
        }
        let listing = await client.query(`SELECT id FROM merchant_listings WHERE canonical_url=$1`, [submission.merchant_url]);
        if (!listing.rowCount) {
          listing = await client.query(
            `INSERT INTO merchant_listings(id,merchant_id,canonical_url,title,source_type)
             VALUES($1,$2,$3,$4,'community_submission') RETURNING id`,
            [`listing_${randomUUID()}`, merchant.rows[0].id, submission.merchant_url, `Community source for ${submission.product_name}`],
          );
        }
        const existingOffer = await client.query(
          `SELECT id FROM offers WHERE listing_id=$1 AND variant_id=$2 AND destination_country=$3 ORDER BY id LIMIT 1`,
          [listing.rows[0].id, variant.rows[0].id, submission.destination_country],
        );
        if (existingOffer.rowCount) {
          provisionalOfferId = existingOffer.rows[0].id;
        } else {
          const createdOffer = await client.query(
            `INSERT INTO offers(id,listing_id,variant_id,destination_country,status,availability,shipping_status,tax_inclusion)
             VALUES($1,$2,$3,$4,'provisional','unknown','unknown','unknown') RETURNING id`,
            [`offer_${randomUUID()}`, listing.rows[0].id, variant.rows[0].id, submission.destination_country],
          );
          provisionalOfferId = createdOffer.rows[0].id;
        }
      }

      await client.query(
        `INSERT INTO moderation_decisions(id,submission_id,actor_id,outcome,reason) VALUES($1,$2,$3,$4,$5)`,
        [`decision_${randomUUID()}`, submission.id, actor.id, parsed.data.outcome, parsed.data.reason],
      );
      await client.query(
        `INSERT INTO audit_events(id,actor_id,action,subject_type,subject_id,request_id,metadata)
         VALUES($1,$2,$3,'submission',$4,$5,$6::jsonb)`,
        [`audit_${randomUUID()}`, actor.id, `submission.${parsed.data.outcome}`, submission.id, request.id,
          JSON.stringify({ status: nextStatus, provisional_offer_id: provisionalOfferId })],
      );
      await client.query("COMMIT");
      return {
        data: { id: submission.id, status: nextStatus, decision_reason: parsed.data.reason, provisional_offer_id: provisionalOfferId },
        request_id: request.id,
        meta: { offer_published: false, next_step: parsed.data.outcome === "accept" ? "A moderator must record an observed price before the provisional offer is public." : null },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      request.log.error({ err: error, submissionId: request.params.id }, "Moderation decision failed");
      return apiError(reply, request, 500, "SERVICE_UNAVAILABLE", "The moderation decision could not be saved.");
    } finally {
      client.release();
    }
  });

  app.post<{ Params: { id: string } }>("/v1/admin/offers/:id/observations", { schema: { tags: ["Moderation"], summary: "Record a moderator-observed price and publish a provisional offer", security: [{ BearerAuth: [] }, { LocalDemoRole: [] }] } }, async (request, reply) => {
    const actor = await requireActor(request, reply, "moderate");
    if (!actor) return;
    const parsed = observationSchema.safeParse(request.body);
    if (!parsed.success) return apiError(reply, request, 400, "INVALID_QUERY", "Observation fields are invalid.", parsed.error.flatten().fieldErrors);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT o.id, o.status, l.canonical_url FROM offers o JOIN merchant_listings l ON l.id=o.listing_id WHERE o.id=$1 FOR UPDATE OF o`,
        [request.params.id],
      );
      const offer = result.rows[0];
      if (!offer) {
        await client.query("ROLLBACK");
        return apiError(reply, request, 404, "NO_VERIFIED_OFFERS", "No offer matches that ID.");
      }
      const currency = await client.query(`SELECT code FROM currencies WHERE code=$1 AND active=true`, [parsed.data.currency]);
      if (!currency.rowCount) {
        await client.query("ROLLBACK");
        return apiError(reply, request, 400, "INVALID_CURRENCY", "Use an active ISO 4217 currency code.");
      }
      const observationId = `obs_${randomUUID()}`;
      await client.query(
        `INSERT INTO price_observations(id,offer_id,amount_minor,currency,observed_at,status,source_type,source_url,method,is_synthetic)
         VALUES($1,$2,$3::bigint,$4,now(),'observed','moderator_manual',$5,'manual',false)`,
        [observationId, offer.id, parsed.data.amount_minor, parsed.data.currency, offer.canonical_url],
      );
      await client.query(
        `UPDATE offers SET status='published',availability=$2,tax_inclusion=$3 WHERE id=$1`,
        [offer.id, parsed.data.availability, parsed.data.tax_inclusion],
      );
      await client.query(
        `INSERT INTO audit_events(id,actor_id,action,subject_type,subject_id,request_id,metadata)
         VALUES($1,$2,'price_observation.created','offer',$3,$4,$5::jsonb)`,
        [`audit_${randomUUID()}`, actor.id, offer.id, request.id,
          JSON.stringify({ observation_id: observationId, currency: parsed.data.currency, source_type: "moderator_manual" })],
      );
      await client.query("COMMIT");
      return reply.code(201).send({
        data: { id: observationId, offer_id: offer.id, status: "observed", observed_at: new Date().toISOString(), currency: parsed.data.currency },
        request_id: request.id,
        meta: { source_url: offer.canonical_url, shipping: "unknown", price_observation_is_not_merchant_endorsement: true },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      request.log.error({ err: error, offerId: request.params.id }, "Manual observation could not be recorded");
      return apiError(reply, request, 500, "SERVICE_UNAVAILABLE", "The observation could not be saved.");
    } finally {
      client.release();
    }
  });
}
