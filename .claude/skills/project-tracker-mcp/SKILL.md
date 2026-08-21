---
name: project-tracker-mcp
description: >-
  Operate this app’s admin MCP endpoint to manage projects, sprints, and users.
  Use whenever the user mentions MCP, /api/mcp, ptmcp_ tokens, AI agents (MCP),
  Cursor/Claude MCP config, admin MCP tools, or asks an agent to list/create/
  update/delete projects, sprints, or users via MCP — including 401/403 MCP auth
  errors and confirm:true failures.
---

# Project Tracker MCP (usage)

Call the live admin MCP at `{origin}/api/mcp`. This skill is for **using** tools,
not implementing new ones (see `AGENTS.md` for that).

Before any write or destructive call, read [references/tool-catalog.md](references/tool-catalog.md).

## Prerequisites

1. App running (`bun run dev` locally, or the deployed origin).
2. Active **admin** Bearer token. Prefer a `ptmcp_…` PAT (~30 days):
   - **Settings → AI agents (MCP)** (copy once), or
   - `bun run mcp:token <admin-email> <password> [token-name]`
3. Never invent tokens, commit secrets, or paste PATs into the repo.

Short-lived Supabase JWTs still work for debugging; prefer PAT for agents.

## Connect

| | |
| --- | --- |
| URL | `http://localhost:3000/api/mcp` (or deployed origin) |
| Auth | `Authorization: Bearer <ptmcp_…>` |
| Who | `profiles.role = admin` and `status = active` |

Client config shape:

```json
{
  "mcpServers": {
    "project-tracker": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer <paste-ptmcp-token-here>"
      }
    }
  }
}
```

Prefer the client’s configured MCP tools over raw HTTP when the server is already
wired. Full operator detail: [`docs/mcp.md`](../../../docs/mcp.md).

## Workflow

1. **Discover** — `list_projects` / `list_sprints` / `list_users` (or get-by-id) before mutate.
2. **Mutate** — pass exact schema fields; uuids, dates `YYYY-MM-DD`, sprint `version` must start with `v`.
3. **Confirm** — destructive deletes and sensitive sprint transitions need `confirm: true` (see catalog).
4. **Guardrails** — one active sprint per project; no self demote/suspend/delete; no last-active-admin demote/suspend/delete; delete project only after its sprints are gone; archived projects / suspended users block membership adds.
5. **Results** — success is JSON text; failures set `isError` with a human message — fix inputs, do not retry blindly.

## Out of scope (dashboard only)

Sprint release notes, member capacity/allocations, milestones, workspace settings, profile self-service.

## Troubleshoot

| Symptom | Likely cause |
| --- | --- |
| `401 Missing Authorization…` | No Bearer header |
| `401 Invalid or expired…` | Bad/expired JWT or unknown `ptmcp_` secret |
| `401 … revoked` / `… expired` | Mint or rotate token in Settings |
| `403 … admin role` | Caller is not admin |
| `403 … suspended` | Profile not `active` |
| Redirect to `/login` | Wrong route; only `/api/mcp` skips cookie proxy |
| Validation / confirm errors | Missing `confirm: true`, bad uuid/date, version without `v`, etc. |

`bun run verify:mcp` exercises tools in-process; it does **not** cover HTTP Bearer auth. Use a real client (or curl) with a PAT for that.

## Related

- Operator guide: [`docs/mcp.md`](../../../docs/mcp.md)
- Adding/changing tools (maintainers): [`AGENTS.md`](../../../AGENTS.md)
