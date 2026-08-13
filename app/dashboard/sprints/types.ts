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

export type ActivityTypeRow = Pick<
  Tables<"activity_types">,
  "id" | "name" | "is_active"
>;

export type SprintMemberRow = Pick<
  Tables<"profiles">,
  "id" | "email" | "full_name" | "competency"
> & { project_id: string };

export type SprintMemberAllocationRow = Pick<
  Tables<"sprint_member_allocations">,
  "id" | "sprint_id" | "user_id" | "activity_id" | "hours_per_day"
>;

export type SprintMemberTimeOffRow = Pick<
  Tables<"sprint_member_time_off">,
  "id" | "sprint_id" | "user_id" | "start_date" | "end_date"
>;

export type SprintMemberActivityNoteRow = Pick<
  Tables<"sprint_member_activity_notes">,
  "id" | "sprint_id" | "user_id" | "activity" | "note"
>;
