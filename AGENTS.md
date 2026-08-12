<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# UI: shadcn preset `b27GcrRo`

All UI in this project comes from one shadcn preset. The preset code is a
checksum of the resolved design tokens, so it is the fastest way to prove
nothing has drifted:

```
bunx shadcn info --json
```

`preset.code` must be **`b27GcrRo`** and `preset.fallbacks` must be **`[]`**.
A different code means a token changed; a non-empty `fallbacks` means a token
could no longer be detected and was guessed. Either way, stop and fix it before
continuing. Run this after any change to `components.json`, `app/globals.css`,
or `app/layout.tsx`.

| | |
| --- | --- |
| style / base | `rhea` / `base` — **Base UI**, not Radix |
| baseColor, theme, chartColor | `neutral` |
| iconLibrary | `lucide` |
| font / fontHeading | `inter` / `inherit` |
| radius / menuAccent / menuColor | `default` / `subtle` / `default` |

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
   token blocks in `app/globals.css` — re-run the preset instead.

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
