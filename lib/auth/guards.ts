import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { readRoleClaims, type AppRole, type UserStatus } from "./roles";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarPath: string | null;
  role: AppRole;
  status: UserStatus;
  /** Null when resolved from claims alone -- only the profile carries it. */
  createdAt: string | null;
};

/**
 * Reads the signed-in user from the verified access token.
 *
 * Always `getClaims()`, never `getSession()` -- the session's embedded user
 * object is not revalidated and must not be trusted in server code.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  const { role, status } = readRoleClaims(data.claims);

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : "",
    fullName: null,
    avatarPath: null,
    // A user whose token predates the auth hook carries no role claim. Treat
    // that as the least-privileged role rather than failing open.
    role: role ?? "viewer",
    status: status ?? "active",
    createdAt: null,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "suspended") redirect("/login?error=suspended");
  return user;
}

/**
 * Like `requireUser`, but re-reads role and status from `public.profiles`
 * instead of trusting the JWT claims, which can be up to one token lifetime
 * stale. The read goes through the RLS-bound client and is permitted by the
 * `profiles_select_own_or_admin` policy.
 */
export const requireProfile = cache(async (): Promise<CurrentUser> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, avatar_path, role, status, created_at")
    .eq("id", user.id)
    .single();

  if (error || !profile) redirect("/login");
  if (profile.status === "suspended") redirect("/login?error=suspended");

  return {
    ...user,
    fullName: profile.full_name,
    avatarPath: profile.avatar_path,
    role: profile.role,
    status: profile.status,
    createdAt: profile.created_at,
  };
});

/**
 * Authorizes an admin-only page or Server Function.
 *
 * Every mutating action calls this. Proxy protection alone is not enough: a
 * matcher change or moving a Server Function to another route silently drops
 * proxy coverage, so authorization is re-checked at the point of use.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireProfile();
  if (user.role !== "admin") redirect("/dashboard?error=forbidden");
  return user;
}

/**
 * Authorizes the read-only client overview. Viewer accounts are the client
 * audience; other roles retain their existing, role-specific dashboards.
 */
export async function requireViewer(): Promise<CurrentUser> {
  const user = await requireProfile();
  if (user.role !== "viewer") redirect("/dashboard?error=forbidden");
  return user;
}

/**
 * Verifies the current admin's password for sensitive operations (e.g. archiving or deleting).
 * Uses an isolated client without persisting session cookies so it doesn't disrupt active sessions.
 */
export async function verifyCurrentAdminPassword(
  password: string,
): Promise<{ ok: true; user: CurrentUser } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const trimmed = String(password ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "Password is required to confirm this action." };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publishableKey) {
    return { ok: false, error: "Authentication service is not configured." };
  }

  const authClient = createSupabaseClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.signInWithPassword({
    email: user.email,
    password: trimmed,
  });

  if (error || !data.user) {
    return { ok: false, error: "Incorrect password. Please try again." };
  }

  return { ok: true, user };
}
