import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireMcpAdmin } from "@/lib/mcp/auth";
import { createMcpServer } from "@/lib/mcp/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

type JsonRpcMessage = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

function normalizeMcpMessage(message: JsonRpcMessage): JsonRpcMessage {
  if (
    message &&
    typeof message === "object" &&
    !Array.isArray(message) &&
    message.params === null
  ) {
    return { ...message, params: {} };
  }
  return message;
}

async function parseMcpBody(
  request: Request,
): Promise<unknown | undefined> {
  if (request.method !== "POST") return undefined;
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return undefined;

  try {
    const raw = await request.clone().json();
    return Array.isArray(raw)
      ? raw.map(normalizeMcpMessage)
      : normalizeMcpMessage(raw);
  } catch {
    // Leave parsing to the transport so it can emit the canonical JSON-RPC
    // parse error response.
    return undefined;
  }
}

/**
 * Admin MCP endpoint (Streamable HTTP, stateless). Each request builds a
 * fresh server + transport, so nothing is shared between requests. Access
 * requires `Authorization: Bearer <Supabase access token>` for an active
 * admin -- see lib/mcp/auth.ts. lib/supabase/proxy.ts skips this path.
 *
 * OPTIONS is unauthenticated so CORS preflight can succeed; every other
 * response (including 401/403) still carries CORS headers.
 */
async function handle(request: Request): Promise<Response> {
  const auth = await requireMcpAdmin(request);
  if ("response" in auth) return withCors(auth.response);

  const server = createMcpServer({
    admin: auth.admin,
    client: createAdminClient(),
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless mode: no session tracking, plain JSON responses.
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const parsedBody = await parseMcpBody(request);
    return withCors(await transport.handleRequest(request, { parsedBody }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "MCP request failed.";
    return withCors(Response.json({ error: message }, { status: 500 }));
  } finally {
    await transport.close();
    await server.close();
  }
}

export function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
