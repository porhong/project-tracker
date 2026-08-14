import type { Json } from "@/lib/supabase/database.types";

export type ClientProject = {
  id: string;
  name: string;
  description: string | null;
  status: string;
};

export type ClientSprint = {
  id: string;
  sprint_number: number;
  version: string;
  description?: string | null;
  release_notes?: Json;
  start_date: string;
  end_date: string;
  working_days: number[];
  daily_work_hours: number;
  status: string;
};

export type ClientReleaseSprint = {
  id: string;
  sprint_number: number;
  version: string;
  description: string | null;
  release_notes: Json;
  start_date: string;
  end_date: string;
  working_days: number[];
  daily_work_hours: number;
  status: string;
};

export type PlannedAllocation = { activity: string; hours: number };
export type ActivityNote = {
  activity: string;
  note: string | null;
  updated_at: string;
};

export type ClientSprintProgress = {
  sprint_id: string;
  sprint_number: number;
  version: string;
  start_date: string;
  end_date: string;
  sprint_status: string;
  member_name: string;
  competency: string;
  planned_allocations: Json;
  activity_notes: Json;
};
