import type { Tables } from "@/lib/supabase/database.types";

export type SprintRow = Pick<
  Tables<"sprints">,
  | "id"
  | "project_id"
  | "sprint_number"
  | "version"
  | "name"
  | "description"
  | "release_notes"
  | "start_date"
  | "end_date"
  | "working_days"
  | "daily_work_hours"
  | "planned_capacity_hours"
  | "status"
>;

export type ProjectOption = Pick<Tables<"projects">, "id" | "name" | "status">;
