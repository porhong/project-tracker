import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./context";
import { registerProjectTools } from "./tools/projects";
import { registerSprintTools } from "./tools/sprints";
import { registerUserTools } from "./tools/users";

/**
 * Builds the admin MCP server for one request. The context carries the
 * verified admin identity (for self-lockout guardrails) and a service-role
 * client; every tool mirrors the validation and guardrails of the matching
 * server action in app/dashboard.
 */
export function createMcpServer(ctx: ToolContext) {
  const server = new McpServer({
    name: "project-tracker-admin",
    version: "1.0.0",
  });

  registerProjectTools(server, ctx);
  registerSprintTools(server, ctx);
  registerUserTools(server, ctx);

  return server;
}
