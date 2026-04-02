import { ValidationError } from "./errors.js";

const BLOCKED_PROTOCOLS = new Set(["file:", "ftp:", "data:", "javascript:"]);
const PRIVATE_HOSTNAME_PATTERNS = [
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, /^0\.0\.0\.0$/, /^::1$/, /^fc/, /^fd/, /^fe80:/,
];

export function assertPublicUrl(raw: string, label = "URL"): void {
  const parsed = new URL(raw);
  if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
    throw new ValidationError(`${label} scheme "${parsed.protocol}" is not allowed. Use https:// or http://.`);
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || PRIVATE_HOSTNAME_PATTERNS.some(r => r.test(host))) {
    throw new ValidationError(`${label} points to a private/internal address and is not allowed.`);
  }
}
