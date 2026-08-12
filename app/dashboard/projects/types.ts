import type { Tables } from "@/lib/supabase/database.types";

export type ProjectRow = Pick<
  Tables<"projects">,
  "id" | "name" | "description" | "status" | "created_at"
>;
