import "server-only";

import { AVATAR_BUCKET } from "@/lib/profile/avatar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const AVATAR_URL_TTL_SECONDS = 60 * 60;

export async function createAvatarUrl(path: string | null | undefined) {
  if (!path) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, AVATAR_URL_TTL_SECONDS);

  return error ? null : data.signedUrl;
}

export async function createAvatarUrls(
  paths: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const validPaths = Array.from(
    new Set(paths.filter((p): p is string => Boolean(p))),
  );
  if (!validPaths.length) return new Map();

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls(validPaths, AVATAR_URL_TTL_SECONDS);

  if (error || !data) return new Map();

  const map = new Map<string, string>();
  for (const item of data) {
    if (item.signedUrl && item.path) {
      map.set(item.path, item.signedUrl);
    }
  }
  return map;
}

export async function getProjectMemberAvatarMap(
  projectId: string,
): Promise<Map<string, string>> {
  const supabase = createAdminClient();
  const { data: members, error } = await supabase
    .from("project_members")
    .select("profiles(full_name, avatar_path)")
    .eq("project_id", projectId);

  if (error || !members) return new Map();

  const paths: string[] = [];
  const nameToPath = new Map<string, string>();

  for (const m of members) {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (prof?.full_name && prof?.avatar_path) {
      nameToPath.set(prof.full_name, prof.avatar_path);
      paths.push(prof.avatar_path);
    }
  }

  if (!paths.length) return new Map();

  const urlMap = await createAvatarUrls(paths);
  const nameToUrl = new Map<string, string>();

  for (const [name, path] of nameToPath) {
    const url = urlMap.get(path);
    if (url) {
      nameToUrl.set(name, url);
    }
  }

  return nameToUrl;
}
