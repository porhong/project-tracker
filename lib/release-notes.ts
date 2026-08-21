import type { Json } from "@/lib/supabase/database.types";

export const EMPTY_RELEASE_NOTES: Json = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const MAX_RELEASE_NOTES_LENGTH = 50_000;
const NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "horizontalRule",
]);
const MARK_TYPES = new Set(["bold", "italic", "strike"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function hasValidAttributes(type: string, attributes: unknown) {
  if (attributes === undefined) return true;
  if (!isRecord(attributes)) return false;

  if (type === "heading") {
    return hasOnlyKeys(attributes, ["level"]) && (attributes.level === 2 || attributes.level === 3);
  }

  if (type === "orderedList") {
    return hasOnlyKeys(attributes, ["start", "type"])
      && Number.isInteger(attributes.start)
      && Number(attributes.start) >= 1
      && (attributes.type === null || ["1", "a", "A", "i", "I"].includes(String(attributes.type)));
  }

  return false;
}

function isValidMark(value: unknown) {
  return isRecord(value) && hasOnlyKeys(value, ["type"]) && typeof value.type === "string" && MARK_TYPES.has(value.type);
}

function isValidNode(value: unknown, depth = 0): boolean {
  if (depth > 20 || !isRecord(value) || !hasOnlyKeys(value, ["type", "attrs", "content", "text", "marks"])) return false;
  if (typeof value.type !== "string" || !NODE_TYPES.has(value.type) || !hasValidAttributes(value.type, value.attrs)) return false;
  if (value.type === "text" && typeof value.text !== "string") return false;
  if (value.type !== "text" && value.text !== undefined) return false;
  if (value.type !== "text" && value.marks !== undefined) return false;
  if (value.marks !== undefined && (!Array.isArray(value.marks) || !value.marks.every(isValidMark))) return false;
  if (value.content !== undefined && (!Array.isArray(value.content) || !value.content.every((node) => isValidNode(node, depth + 1)))) return false;

  const content = value.content;
  if (value.type === "doc") return Array.isArray(content) && content.every((node) => isRecord(node) && ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "horizontalRule"].includes(String(node.type)));
  if (value.type === "paragraph" || value.type === "heading") return content === undefined || (Array.isArray(content) && content.every((node) => isRecord(node) && (node.type === "text" || node.type === "hardBreak")));
  if (value.type === "bulletList" || value.type === "orderedList") return Array.isArray(content) && content.every((node) => isRecord(node) && node.type === "listItem");
  if (value.type === "listItem") return Array.isArray(content) && content.length > 0 && content.every((node) => isRecord(node) && ["paragraph", "bulletList", "orderedList"].includes(String(node.type)));
  if (value.type === "blockquote") return Array.isArray(content) && content.length > 0 && content.every((node) => isRecord(node) && ["paragraph", "heading", "bulletList", "orderedList"].includes(String(node.type)));
  return content === undefined;
}

export function parseReleaseNotes(value: FormDataEntryValue | null): { data: Json } | { error: string } {
  if (typeof value !== "string" || value.length > MAX_RELEASE_NOTES_LENGTH) return { error: "Release notes must be a valid document of at most 50,000 characters." };

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.type !== "doc" || !Array.isArray(parsed.content) || !isValidNode(parsed)) {
      return { error: "Release notes contain unsupported formatting." };
    }
    return { data: parsed as Json };
  } catch {
    return { error: "Release notes must be a valid document." };
  }
}
