import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { config } from "./config.js";
import { db } from "./db.js";

export type Scope = "contribute" | "moderate" | "admin";
export type Actor = { id: string; scopes: Scope[]; demo: boolean };

function tokenHash(token: string): string {
  return createHash("sha256").update(`${config.apiKeyPepper}:${token}`).digest("hex");
}

export async function authorize(request: FastifyRequest, required: Scope): Promise<Actor | null> {
  const demoRole = request.headers["x-demo-role"];
  if (config.nodeEnv === "development" && config.localDemo && typeof demoRole === "string") {
    if (demoRole === "contributor" && required === "contribute") {
      return { id: "local-demo-contributor", scopes: ["contribute"], demo: true };
    }
    if (demoRole === "moderator" && ["moderate", "contribute"].includes(required)) {
      return { id: "local-demo-moderator", scopes: ["moderate", "contribute"], demo: true };
    }
  }

  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || token.length > 256) return null;

  const prefix = token.slice(0, 18);
  const result = await db.query<{
    id: string;
    owner_id: string;
    secret_hash: string;
    scopes: Scope[];
    expires_at: Date | null;
  }>(
    `SELECT id, owner_id, secret_hash, scopes, expires_at FROM api_keys
     WHERE prefix = $1 AND revoked_at IS NULL LIMIT 1`,
    [prefix],
  );
  const key = result.rows[0];
  if (!key || (key.expires_at && key.expires_at.getTime() <= Date.now())) return null;

  const expected = Buffer.from(key.secret_hash, "hex");
  const actual = Buffer.from(tokenHash(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const hasScope = key.scopes.includes(required) ||
    (required === "moderate" && key.scopes.includes("admin")) ||
    (required === "contribute" && (key.scopes.includes("moderate") || key.scopes.includes("admin")));
  if (!hasScope) return null;

  return { id: key.owner_id || randomUUID(), scopes: key.scopes, demo: false };
}
