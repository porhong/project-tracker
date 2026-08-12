import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readRoleClaims, type AppRole, type UserStatus } from "./roles";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
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
    .select("full_name, role, status, created_at")
    .eq("id", user.id)
    .single();

  if (error || !profile) redirect("/login");
  if (profile.status === "suspended") redirect("/login?error=suspended");

  return {
    ...user,
    fullName: profile.full_name,
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
