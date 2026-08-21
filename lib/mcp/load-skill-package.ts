import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { McpSkillPackage } from "./skill-package";

export type { McpSkillPackage } from "./skill-package";

const SKILL_DIR = path.join(
  process.cwd(),
  ".claude",
  "skills",
  "project-tracker-mcp",
);

/**
 * Rewrite repo-relative markdown links so a standalone export does not point at
 * `../../../docs/…` outside the skill folder.
 */
function rewriteExportLinks(markdown: string) {
  return markdown
    .replaceAll(
      "[`docs/mcp.md`](../../../docs/mcp.md)",
      "`docs/mcp.md` (in the Project Tracker repo)",
    )
    .replaceAll(
      "[`AGENTS.md`](../../../AGENTS.md)",
      "`AGENTS.md` (in the Project Tracker repo)",
    );
}

/**
 * Loads the admin MCP usage skill from the repo for Settings export.
 * Returns null when files are missing (e.g. incomplete deploy).
 */
export async function loadMcpSkillPackage(): Promise<McpSkillPackage | null> {
  try {
    const [skillRaw, catalogRaw] = await Promise.all([
      readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8"),
      readFile(path.join(SKILL_DIR, "references", "tool-catalog.md"), "utf8"),
    ]);
    return {
      skillMd: rewriteExportLinks(skillRaw),
      catalogMd: rewriteExportLinks(catalogRaw),
    };
  } catch {
    return null;
  }
}
