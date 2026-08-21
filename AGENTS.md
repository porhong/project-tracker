<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MCP: admin endpoint at `/api/mcp`

Usage guide for clients and operators: [`docs/mcp.md`](docs/mcp.md).

A stateless Streamable HTTP MCP server lets AI agents manage projects,
sprints, and users (admin only). Route: `app/api/mcp/route.ts` — a fresh
`McpServer` + `WebStandardStreamableHTTPServerTransport`
(`sessionIdGenerator: undefined`, `enableJsonResponse: true`) per request.

- **Auth.** `Authorization: Bearer <token>`, verified in `lib/mcp/auth.ts`
  (`requireMcpAdmin`). Accepts a long-lived `ptmcp_…` personal access token
  (~30 days, hashed in `mcp_access_tokens`) or a short-lived Supabase Auth JWT
  (~1 h). The `profiles` row is re-read — only `role='admin'` **and**
  `status='active'` pass. `lib/supabase/proxy.ts` returns early for `/api/mcp`;
  never route it through the cookie session flow.
- **Tools.** Registered in `lib/mcp/server.ts`; handlers live in
  `lib/mcp/tools/{projects,sprints,users}.ts`. They use zod input schemas
  (zod is the MCP SDK's peer dep — do not introduce zod into the dashboard
  actions, which stay hand-validated) and run on the service-role client, so
  every handler must mirror the validation and guardrails of the matching
  `app/dashboard/*/actions.ts` action (active-project checks, sprint status
  transitions, one-active-sprint-per-project, last-active-admin and
  self-lockout guards). Destructive tools take `confirm: z.literal(true)`.
- **Adding a tool.** Register it in the matching `lib/mcp/tools/*.ts` file,
  reusing `ok`/`fail` from `lib/mcp/result.ts`, then cover it in
  `scripts/verify-mcp.ts` and bump the tool-count assertion there.
- **Client token.** Prefer **Settings → AI agents (MCP)** to create a 30-day
  token, or `bun run mcp:token <email> <password>` (same). Do not add new env
  vars — the endpoint reuses `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`.
- **Verify.** `bun run typecheck && bun run lint && bun run build` and
  `bun run verify:mcp` (spins the server up over `InMemoryTransport` with a
  throwaway admin; self-cleaning).

# UI: shadcn preset `b2qKnttz6` + brand primary

All UI in this project comes from one shadcn preset, re-applied with:

```
bunx shadcn apply b2qKnttz6
```

On top of that, `--primary` is hand-set to the brand colour **`#006239`**
(`oklch(0.4365 0.1044 156.756)`, same value in `:root` and `.dark`). No shadcn
preset theme encodes that hex — the nearest, `green`, is `#008236` — so the
preset supplies every *derived* green token (chart ramp, sidebar, foregrounds)
and only `--primary` is overridden. Both occurrences are commented in
`app/globals.css`; **re-applying the preset silently reverts them**, so restore
the override afterwards.

The preset code is a checksum of the resolved design tokens, so it is the
fastest way to prove nothing else has drifted:

```
bunx shadcn info --json
```

`preset.code` must be **`b2qKlLVoW`** and `preset.fallbacks` must be exactly
**`["theme"]`**. That single fallback is expected and load-bearing: the brand
`--primary` no longer matches the `green` theme, so detection cannot recognise
it and guesses (reporting `theme: neutral`, which is wrong — ignore it).
Any *other* code, or any fallback beyond `theme`, means real drift — stop and
fix it before continuing. Run this after any change to `components.json`,
`app/globals.css`, or `app/layout.tsx`.

| | |
| --- | --- |
| style / base | `rhea` / `base` — **Base UI**, not Radix |
| baseColor | `neutral` |
| theme, chartColor | `green` — but `--primary` is overridden to `#006239` |
| iconLibrary | `lucide` |
| font / fontHeading | `inter` / `inherit` |
| radius / menuAccent / menuColor | `small` (`0.45rem`) / `subtle` / `default` |

## Rules

1. **Base UI, not Radix.** Components import from `@base-ui/react`. Composition
   uses the `render` prop (`<DialogClose render={<Button variant="outline" />}>`),
   **never** Radix's `asChild`. Parts differ too — `DialogPrimitive.Popup`,
   `SelectPrimitive.Positioner`, `MenuPrimitive`. Most shadcn snippets found
   online are Radix-based and will not work here; read the actual file in
   `components/ui/` before using a component.

2. **Never hand-write a file into `components/ui/`.** Add components with
   `bunx shadcn@latest add <name>` so they come from the `base-rhea` registry.
   Never hand-edit the `style`/`baseColor` fields in `components.json` or the
   token blocks in `app/globals.css` — re-run the preset instead. The two
   commented `--primary` lines are the one sanctioned exception; every other
   token must come from the preset.

3. **Check `components/ui/` before building any UI.** If a component exists,
   use it. Do not hand-roll markup that duplicates one — that is how the app
   ended up with six ad-hoc error boxes at the wrong radius while
   `components/ui/alert.tsx` sat unused.

4. **Semantic tokens only.** `bg-card`, `text-muted-foreground`,
   `text-destructive`, `border-border`. No `bg-red-500`-style palette classes and
   no raw hex/`rgb()`/`oklch()` anywhere outside `app/globals.css`.

5. **Radius comes from `--radius`.** Registry controls use `rounded-2xl`; match
   the surrounding component rather than introducing `rounded-md`/`rounded-lg`
   ad hoc.

6. **Icons: lucide only.** An icon placed beside text inside `Button` or `Badge`
   needs `data-icon="inline-start"` or `"inline-end"` — the size variants key
   their padding off `has-data-[icon=inline-start]:…`, so without it the control
   renders with the wrong padding.

7. **Fonts.** Only `--font-sans` (Inter, per the preset) and `--font-mono` are
   wired into `@theme`. Do not add font families, and never leave a `next/font`
   variable that `app/globals.css` does not reference — it downloads a font that
   never renders.

8. **Base UI `SelectValue` renders the raw value.** Pass a formatter child to
   display a label: `<SelectValue>{(v) => LABELS[v] ?? String(v)}</SelectValue>`.

After touching UI, run `bun run typecheck && bun run lint && bun run build`, then
re-check `bunx shadcn info --json` per above.
