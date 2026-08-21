import type { Tables } from "@/lib/supabase/database.types";

export type ProjectRow = Pick<
  Tables<"projects">,
  "id" | "name" | "description" | "status" | "created_at"
>;

export type ProjectMemberRow = Pick<
  Tables<"project_members">,
  "project_id" | "user_id"
>;

export type UserOption = Pick<
  Tables<"profiles">,
  "id" | "email" | "full_name" | "competency" | "status"
>;
