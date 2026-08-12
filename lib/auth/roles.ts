import type { Enums } from "@/lib/supabase/database.types";

export type AppRole = Enums<"app_role">;
export type UserStatus = Enums<"user_status">;

export const APP_ROLES = ["admin", "viewer"] as const satisfies readonly AppRole[];
export const USER_STATUSES = [
  "active",
  "suspended",
] as const satisfies readonly UserStatus[];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  viewer: "Viewer",
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: "Active",
  suspended: "Suspended",
};

/** Ban length used to suspend a user at the Supabase Auth layer (~100 years). */
export const SUSPEND_BAN_DURATION = "876000h";
export const UNSUSPEND_BAN_DURATION = "none";

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function isUserStatus(value: unknown): value is UserStatus {
  return (
    typeof value === "string" && USER_STATUSES.includes(value as UserStatus)
  );
}

/** Claims added to the access token by `public.custom_access_token_hook`. */
export type RoleClaims = {
  role: AppRole | null;
  status: UserStatus | null;
};

export function readRoleClaims(
  claims: Record<string, unknown> | null | undefined,
): RoleClaims {
  return {
    role: isAppRole(claims?.user_role) ? claims.user_role : null,
    status: isUserStatus(claims?.user_status) ? claims.user_status : null,
  };
}

/** Paths reachable without a session. Everything else requires one. */
export const PUBLIC_PATHS = ["/login", "/auth"] as const;

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/** Paths only an admin may reach. */
export const ADMIN_PATHS = [
  "/dashboard/users",
  "/dashboard/projects",
  "/dashboard/sprints",
  "/dashboard/settings",
] as const;

export function isAdminPath(pathname: string) {
  return ADMIN_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
