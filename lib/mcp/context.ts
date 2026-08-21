import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Service-role client shared by every MCP tool handler. Type-only import so
 * this module stays loadable from plain scripts (scripts/verify-mcp.ts) that
 * cannot resolve `server-only`.
 */
export type ServiceClient = ReturnType<typeof createAdminClient>;

/** The admin identity resolved from the request's Bearer token. */
export type McpAdmin = { id: string; email: string };

export type ToolContext = { admin: McpAdmin; client: ServiceClient };
