import { createHash } from "node:crypto";
import { isIP } from "node:net";

const sensitiveQueryKey = /(^|_)(token|secret|auth|authorization|session|password|passwd|signature|sig|key|code)(_|$)/i;
const trackingQueryKey = /^(utm_.+|gclid|fbclid|msclkid|ref_src)$/i;
const blockedSuffixes = [".localhost", ".local", ".internal", ".home", ".lan", ".test"];

export class DisallowedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisallowedUrlError";
  }
}

/**
 * Validates and normalizes a URL for storage only. This does not resolve DNS or
 * fetch content; submitted URLs are never fetched by the public API.
 */
export function normalizeSubmittedUrl(raw: string): { url: string; hostname: string; fingerprint: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new DisallowedUrlError("Enter a complete HTTPS product URL.");
  }

  if (url.protocol !== "https:") throw new DisallowedUrlError("Only HTTPS merchant URLs are accepted.");
  if (url.username || url.password) throw new DisallowedUrlError("URLs containing embedded credentials are not accepted.");
  if (url.port && url.port !== "443") throw new DisallowedUrlError("Custom ports are not accepted.");
  if (isIP(url.hostname) !== 0) throw new DisallowedUrlError("IP-address URLs are not accepted.");

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname.includes(".") || hostname === "localhost" || blockedSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw new DisallowedUrlError("This hostname is not accepted as a public merchant domain.");
  }
  if (hostname.length > 253 || hostname.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
    throw new DisallowedUrlError("Enter a valid public merchant hostname.");
  }

  for (const key of url.searchParams.keys()) {
    if (sensitiveQueryKey.test(key)) throw new DisallowedUrlError("Remove access tokens or private parameters from the URL.");
  }
  for (const key of [...url.searchParams.keys()]) {
    if (trackingQueryKey.test(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  url.hostname = hostname;
  const canonicalUrl = url.toString();
  return {
    url: canonicalUrl,
    hostname,
    fingerprint: createHash("sha256").update(canonicalUrl).digest("hex"),
  };
}
