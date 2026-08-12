import type { Tables } from "@/lib/supabase/database.types";

export type UserRow = Pick<
  Tables<"profiles">,
  "id" | "email" | "full_name" | "role" | "status" | "created_at"
>;
