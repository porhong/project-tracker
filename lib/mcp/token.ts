import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { MCP_TOKEN_PREFIX, MCP_TOKEN_TTL_DAYS } from "./token-constants";

export { MCP_TOKEN_PREFIX, MCP_TOKEN_TTL_DAYS } from "./token-constants";

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isMcpPersonalAccessToken(token: string): boolean {
  return token.startsWith(MCP_TOKEN_PREFIX);
}

/**
 * Issues a high-entropy Bearer secret. Only the returned `token` is shown to
 * the admin once; store `tokenHash` (+ `tokenPrefix` for UI) in the database.
 */
export function mintMcpPersonalAccessToken() {
  const secret = randomBytes(32).toString("base64url");
  const token = `${MCP_TOKEN_PREFIX}${secret}`;
  return {
    token,
    tokenHash: hashMcpToken(token),
    tokenPrefix: token.slice(0, 12),
    expiresAt: new Date(
      Date.now() + MCP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    ),
  };
}

/** Constant-time hex compare for defense in depth (hash lookup is primary). */
export function mcpTokenHashesEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    if (left.length !== right.length || left.length === 0) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
