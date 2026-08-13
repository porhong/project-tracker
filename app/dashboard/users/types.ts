import type { Tables } from "@/lib/supabase/database.types";

export type UserRow = Pick<
  Tables<"profiles">,
  | "id"
  | "avatar_path"
  | "email"
  | "full_name"
  | "competency"
  | "role"
  | "status"
  | "created_at"
>;

export type UserWithAvatar = UserRow & { avatarUrl: string | null };
