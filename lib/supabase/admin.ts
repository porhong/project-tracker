import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses RLS entirely, so every caller must have already
 * authorized the request -- see `requireAdmin` in `lib/auth/guards.ts`.
 *
 * The key is read from SUPABASE_SECRET_KEY, deliberately without a NEXT_PUBLIC_
 * prefix: anything prefixed is bundled into the browser build.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Admin user management is unavailable.",
    );
  }

  return createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
