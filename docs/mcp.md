# Admin MCP usage

The app exposes a [Model Context Protocol](https://modelcontextprotocol.io)
endpoint so AI agents can manage **projects**, **sprints**, and **users**.

| | |
| --- | --- |
| URL | `http://localhost:3000/api/mcp` (or your deployed origin) |
| Transport | Streamable HTTP, **stateless** (JSON responses, no session sticky) |
| Auth | `Authorization: Bearer <ptmcp_…>` (30-day PAT) or a short-lived Supabase JWT |
| Who | Active profile with `role = admin` only |
| Tools | 19 (see [Tool reference](#tool-reference)) |

Implementation lives under `app/api/mcp/route.ts` and `lib/mcp/`. Agent notes for
contributors are in `AGENTS.md`. Agent **usage** skill (connect + call tools):
[`.claude/skills/project-tracker-mcp/`](../.claude/skills/project-tracker-mcp/).

---

## Quick start

1. Start the app (`bun run dev`).
2. Mint a **30-day** admin MCP token (`ptmcp_…`), either:

   - **In the app:** open **Settings → AI agents (MCP)** while signed in
     as an active admin — create a token, copy it once, and optionally copy the
     ready-made Cursor / Claude Desktop config JSON.
   - **CLI:**

     ```bash
     bun run mcp:token <admin-email> <password> [token-name]
     ```

     Or via env:

     ```bash
     MCP_ADMIN_EMAIL=... MCP_ADMIN_PASSWORD=... bun run mcp:token
     ```

     The token is printed on **stdout**; expiry info on stderr. Manage/revoke
     tokens later from Settings.

3. Point an MCP client at the endpoint with that Bearer token (examples below).
4. Create a new token (or re-run `mcp:token`) when it expires, or revoke it in
   Settings if it is compromised.

---

## Connect a client

### Cursor / Claude Desktop–style config

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

Use your production URL when the app is deployed. The endpoint allows CORS
preflight (`OPTIONS` is unauthenticated); every other request must carry a
valid admin Bearer token.

### Smoke-check with curl

Initialize (example — adjust body if your client uses a different MCP version):

```bash
TOKEN=$(bun run --silent mcp:token "$EMAIL" "$PASSWORD" 2>/dev/null)

curl -sS http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.1"}}}'
```

Missing / invalid tokens return `401`. Non-admin or suspended accounts return
`403`.

---

## Authentication details

- Prefer a **`ptmcp_…` personal access token** (~30 days). Plaintext is shown
  once at creation; only a SHA-256 hash is stored in `mcp_access_tokens`.
  Revoke anytime from Settings.
- Short-lived **Supabase Auth access JWTs** (~1 hour) still work for debugging
  (Auth’s `jwt_expiry` max is one week — do not raise it for MCP).
- The server always **re-reads** `profiles.role` and `profiles.status` (JWT role
  claims alone are not enough).
- Only `role = admin` **and** `status = active` may call tools.
- Cookie session middleware does **not** apply to `/api/mcp`
  (`lib/supabase/proxy.ts` returns early for that path).

Required env (already used by the app — no MCP-specific secrets):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (for `mcp:token` sign-in)
- `SUPABASE_SECRET_KEY` (for token verification, CLI insert, and tool writes)

---

## Tool reference

All tools are admin-only. Successful results return JSON text; failures set
`isError` with a human-readable message. Destructive tools require
`confirm: true`.

### Projects (7)

| Tool | Purpose | Key inputs |
| --- | --- | --- |
| `list_projects` | All projects + members | — |
| `get_project` | One project + members + sprints | `id` (uuid) |
| `create_project` | Create (name unique) | `name`, optional `description` |
| `update_project` | Name / description / status | `id`, optional `name`, `description`, `status` (`active` \| `archived`) |
| `delete_project` | Permanent delete | `id`, `confirm: true` — blocked while sprints exist |
| `add_project_member` | Assign user | `project_id`, `user_id` — rejects archived projects and suspended users |
| `remove_project_member` | Unassign user | `project_id`, `user_id` |

Limits: name ≤ 160 chars, description ≤ 2 000 chars.

### Sprints (6)

| Tool | Purpose | Key inputs |
| --- | --- | --- |
| `list_sprints` | List / filter | optional `project_id`, `status` |
| `get_sprint` | One sprint + project name | `id` |
| `create_sprint` | Draft sprint on active project | `project_id`, `sprint_number`, `version` (must start with `v`), `start_date` / `end_date` (`YYYY-MM-DD`), optional `description`, `working_days`, `daily_work_hours` |
| `update_sprint` | Edit draft/active fields | `id` + any updatable fields — completed/archived are read-only |
| `set_sprint_status` | Lifecycle transitions | `id`, `status`; see transitions below |
| `delete_sprint` | Permanent delete | `id`, `confirm: true` |

Statuses: `draft` → `active` → `completed`; `archived` restores to `draft`.

- A project may have **only one** `active` sprint.
- `completed` → `active` (re-enable) and any → `archived` require `confirm: true`.
- `working_days`: integers `1` (Mon) … `7` (Sun). If omitted with
  `daily_work_hours`, workspace defaults from `workspace_settings` apply.
- `planned_capacity_hours` is computed by the database on write.

### Users (6)

| Tool | Purpose | Key inputs |
| --- | --- | --- |
| `list_users` | All profiles | — |
| `get_user` | Profile + project memberships | `id` |
| `create_user` | Provision account (email confirmed immediately) | `email`, `password` (≥ 8), `role` (`admin` \| `user` \| `viewer`), optional `full_name`, `competency` |
| `update_user` | Email / name / competency / password / role / clear avatar | `id` + fields; optional `remove_avatar: true` |
| `set_user_status` | Suspend or reactivate | `id`, `status` (`active` \| `suspended`) |
| `delete_user` | Permanent delete | `id`, `confirm: true` |

Guardrails:

- You cannot demote, suspend, or delete **yourself**.
- You cannot demote, suspend, or delete the **last active admin**.
- Suspension bans at Auth and sets `profiles.status` so existing tokens stop
  working through the app proxy.

---

## What MCP does **not** cover

These remain dashboard-only:

- Sprint release notes
- Sprint member capacity / allocations
- Sprint milestones
- Workspace settings
- Profile self-service / my-sprint-activity

---

## Verify and troubleshoot

```bash
bun run typecheck && bun run lint && bun run build
bun run verify:mcp
```

`verify:mcp` spins an in-process MCP server (`InMemoryTransport`), exercises
every tool’s happy path and guardrails with throwaway users/projects, then
cleans up. It does **not** hit HTTP Bearer auth on `/api/mcp` — use
`mcp:token` + a real client (or curl) for that.

| Symptom | Likely cause |
| --- | --- |
| `401 Missing Authorization…` | No `Authorization: Bearer …` header |
| `401 Invalid or expired…` | Wrong token, expired JWT, or unknown `ptmcp_` secret |
| `401 … revoked` / `… expired` | Revoke or mint a new MCP token in Settings |
| `403 … admin role` | Caller is not `admin` |
| `403 … suspended` | Profile `status` is not `active` |
| Redirect to `/login` | Hitting a non-MCP route, or proxy not skipping `/api/mcp` |
| Tool validation error | Missing `confirm: true`, bad uuid/date, version not starting with `v`, etc. |

---

## Adding tools (maintainers)

1. Implement in `lib/mcp/tools/{projects,sprints,users}.ts` with zod schemas.
2. Mirror validation/guardrails from the matching `app/dashboard/*/actions.ts`.
3. Reuse `ok` / `fail` from `lib/mcp/result.ts`.
4. Cover the tool in `scripts/verify-mcp.ts` and bump the tool-count assertion.
5. Keep this doc’s tables in sync.
