import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const separator = arg.indexOf("=");
  return [arg.slice(2, separator), arg.slice(separator + 1)];
}));
const owner = args.get("owner")?.trim();
const scopes = (args.get("scopes") ?? "").split(",").map((scope) => scope.trim()).filter(Boolean);
const allowed = new Set(["contribute", "moderate", "admin"]);
if (!owner || owner.length > 120 || !scopes.length || scopes.some((scope) => !allowed.has(scope))) {
  console.error("Usage: pnpm --filter @fulfillmenty/api key:create -- --owner=handle --scopes=contribute,moderate");
  console.error("Allowed scopes: contribute, moderate, admin");
  process.exit(1);
}

const token = `fy_live_${randomBytes(32).toString("base64url")}`;
const prefix = token.slice(0, 18);
const secretHash = createHash("sha256").update(`${config.apiKeyPepper}:${token}`).digest("hex");
const expiresDays = Number(args.get("expires-days") ?? "90");
if (!Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 3650) {
  console.error("--expires-days must be between 1 and 3650");
  process.exit(1);
}

const pool = new Pool({ connectionString: config.databaseUrl });
try {
  await pool.query(
    `INSERT INTO api_keys(id,owner_id,prefix,secret_hash,scopes,expires_at)
     VALUES($1,$2,$3,$4,$5,now() + ($6::text || ' days')::interval)`,
    [`key_${randomUUID()}`, owner, prefix, secretHash, scopes, String(expiresDays)],
  );
  console.info(`Created key for ${owner} with scopes: ${scopes.join(", ")}; expires in ${expiresDays} days.`);
  console.info("Copy the secret now. Only its hash is stored and it cannot be retrieved later:");
  console.info(token);
} finally {
  await pool.end();
}
