import "server-only";

import { AVATAR_BUCKET } from "@/lib/profile/avatar";
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
