/**
 * Mints a long-lived MCP personal access token (~30 days) for /api/mcp.
 *
 * Usage:
 *   bun run mcp:token <email> <password>
 *   MCP_ADMIN_EMAIL=... MCP_ADMIN_PASSWORD=... bun run mcp:token
 *
 * Optional 4th arg / MCP_TOKEN_NAME sets the token label stored in the dashboard.
 *
 * The token goes to stdout; everything else goes to stderr, so the token can
 * be captured with $(bun run --silent mcp:token ... 2>/dev/null).
 *
 * Short-lived Supabase Auth JWTs still work against /api/mcp for debugging,
 * but prefer these `ptmcp_…` tokens for AI clients.
 */
import { createClient } from "@supabase/supabase-js";
import { mintMcpPersonalAccessToken } from "../lib/mcp/token";
import type { Database } from "../lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const email = process.argv[2] ?? process.env.MCP_ADMIN_EMAIL;
const password = process.argv[3] ?? process.env.MCP_ADMIN_PASSWORD;
const tokenName =
  process.argv[4] ?? process.env.MCP_TOKEN_NAME ?? "CLI MCP token";

if (!url || !publishable || !secret) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or SUPABASE_SECRET_KEY.",
  );
  process.exit(1);
}
if (!email || !password) {
  console.error(
    "Usage: bun run mcp:token <email> <password> [token-name]\n   or: MCP_ADMIN_EMAIL=... MCP_ADMIN_PASSWORD=... bun run mcp:token",
  );
  process.exit(1);
}

const client = createClient<Database>(url, publishable, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await client.auth.signInWithPassword({
  email,
  password,
});
if (error || !data.session || !data.user) {
  console.error(`Sign-in failed: ${error?.message ?? "no session"}`);
  process.exit(1);
}

const { data: profile } = await client
  .from("profiles")
  .select("role, status")
  .eq("id", data.user.id)
  .single();
if (profile?.role !== "admin" || profile.status !== "active") {
  console.error(
    `Warning: ${email} is role=${profile?.role} status=${profile?.status}; /api/mcp requires an active admin.`,
  );
  process.exit(1);
}

const minted = mintMcpPersonalAccessToken();
const admin = createClient<Database>(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error: insertError } = await admin.from("mcp_access_tokens").insert({
  user_id: data.user.id,
  name: tokenName.slice(0, 80) || "CLI MCP token",
  token_prefix: minted.tokenPrefix,
  token_hash: minted.tokenHash,
  expires_at: minted.expiresAt.toISOString(),
});
if (insertError) {
  console.error(`Could not store MCP token: ${insertError.message}`);
  process.exit(1);
}

console.log(minted.token);
console.error(
  `MCP token for ${email} (${tokenName}) expires at ${minted.expiresAt.toISOString()}. Use it as: Authorization: Bearer <token>`,
);
