import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Successful tool result carrying a JSON payload. */
export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/** Failed tool result with a human-readable reason. */
export function fail(error: string): CallToolResult {
  return { content: [{ type: "text", text: error }], isError: true };
}
