# MCP tool catalog (19)

Admin-only. Read this before write/destructive calls. Full narrative: [`docs/mcp.md`](../../../docs/mcp.md).

Destructive / sensitive tools require `confirm: true` (literal boolean).

## Projects (7)

| Tool | Key inputs | Notes |
| --- | --- | --- |
| `list_projects` | — | All projects + members |
| `get_project` | `id` | + members + sprints |
| `create_project` | `name`, opt `description` | Name unique; ≤160 / ≤2000 chars |
| `update_project` | `id` + opt `name` / `description` / `status` | `status`: `active` \| `archived` |
| `delete_project` | `id`, **`confirm: true`** | Blocked while sprints exist |
| `add_project_member` | `project_id`, `user_id` | Rejects archived project / suspended user |
| `remove_project_member` | `project_id`, `user_id` | — |

## Sprints (6)

| Tool | Key inputs | Notes |
| --- | --- | --- |
| `list_sprints` | opt `project_id`, `status` | — |
| `get_sprint` | `id` | + project name |
| `create_sprint` | `project_id`, `sprint_number`, `version`, `start_date`, `end_date`; opt `description`, `working_days`, `daily_work_hours` | Active project only; `version` must start with `v`; dates `YYYY-MM-DD`; `working_days` ints `1`–`7` (Mon–Sun) |
| `update_sprint` | `id` + updatable fields | Draft/active only; completed/archived read-only |
| `set_sprint_status` | `id`, `status`; **`confirm: true`** when archiving or completed→active | Lifecycle: `draft` → `active` → `completed`; `archived` → `draft`. One `active` sprint per project |
| `delete_sprint` | `id`, **`confirm: true`** | Cascades member plans |

## Users (6)

| Tool | Key inputs | Notes |
| --- | --- | --- |
| `list_users` | — | All profiles |
| `get_user` | `id` | + project memberships |
| `create_user` | `email`, `password` (≥8), `role`; opt `full_name`, `competency` | `role`: `admin` \| `user` \| `viewer`; email confirmed immediately |
| `update_user` | `id` + fields; opt `remove_avatar: true` | No self-demote; no demote last active admin |
| `set_user_status` | `id`, `status` (`active` \| `suspended`) | No self-suspend; no suspend last active admin |
| `delete_user` | `id`, **`confirm: true`** | No self-delete; no delete last active admin |

## Confirm checklist

Always pass `confirm: true` for:

- `delete_project`
- `delete_sprint`
- `delete_user`
- `set_sprint_status` when `status` is `archived`
- `set_sprint_status` when re-enabling (`completed` → `active`)
