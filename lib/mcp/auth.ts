import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { McpAdmin } from "./context";
import {
  hashMcpToken,
  isMcpPersonalAccessToken,
  mcpTokenHashesEqual,
} from "./token";

function reject(status: 401 | 403, error: string) {
  return Response.json({ error }, { status });
}

async function requireActiveAdmin(
  client: ReturnType<typeof createAdminClient>,
  userId: string,
  emailFallback: string,
): Promise<{ admin: McpAdmin } | { response: Response }> {
  const { data: profile } = await client
    .from("profiles")
    .select("role, status, email")
    .eq("id", userId)
    .single();

  if (!profile || profile.status !== "active") {
    return {
      response: reject(403, "This account is suspended or has no profile."),
    };
  }
  if (profile.role !== "admin") {
    return { response: reject(403, "MCP access requires the admin role.") };
  }

  return {
    admin: { id: userId, email: profile.email || emailFallback },
  };
}

async function authenticatePersonalAccessToken(
  client: ReturnType<typeof createAdminClient>,
  token: string,
): Promise<{ admin: McpAdmin } | { response: Response }> {
  const tokenHash = hashMcpToken(token);
  const { data: row, error } = await client
    .from("mcp_access_tokens")
    .select("id, user_id, token_hash, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !row || !mcpTokenHashesEqual(row.token_hash, tokenHash)) {
    return { response: reject(401, "Invalid or expired access token.") };
  }
  if (row.revoked_at) {
    return { response: reject(401, "This MCP token has been revoked.") };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { response: reject(401, "This MCP token has expired.") };
  }

  const authorized = await requireActiveAdmin(client, row.user_id, "");
  if ("response" in authorized) return authorized;

  // Best-effort activity stamp; do not fail the request if the update misses.
  void client
    .from("mcp_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return authorized;
}

async function authenticateSupabaseAccessToken(
  client: ReturnType<typeof createAdminClient>,
  token: string,
): Promise<{ admin: McpAdmin } | { response: Response }> {
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { response: reject(401, "Invalid or expired access token.") };
  }

  return requireActiveAdmin(client, data.user.id, data.user.email ?? "");
}

/**
 * Authenticates an MCP request. Accepts either:
 * - a long-lived `ptmcp_…` personal access token (hashed in mcp_access_tokens), or
 * - a short-lived Supabase Auth access JWT (~1 hour).
 *
 * The profile row is re-read rather than trusting JWT role claims, so a
 * demotion takes effect immediately (same reasoning as lib/supabase/proxy.ts).
 */
export async function requireMcpAdmin(
  request: Request,
): Promise<{ admin: McpAdmin } | { response: Response }> {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1];
  if (!token) {
    return {
      response: reject(401, "Missing Authorization: Bearer <access token>."),
    };
  }

  const client = createAdminClient();
  if (isMcpPersonalAccessToken(token)) {
    return authenticatePersonalAccessToken(client, token);
  }
  return authenticateSupabaseAccessToken(client, token);
}
