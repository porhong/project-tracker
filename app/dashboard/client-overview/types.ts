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
  avatar_url?: string | null;
  planned_allocations: Json;
  activity_notes: Json;
};

export type ClientSprintMilestone = {
  id: string;
  sprint_id: string;
  title: string;
  description: string | null;
  target_date: string;
  status: "upcoming" | "in_progress" | "completed" | "delayed";
  icon: "compass" | "sparkles" | "code" | "shield" | "rocket" | "flag" | "check" | "users";
  order_index: number;
};

export type ClientSprintRetrospectiveQuestion = {
  id: string;
  sprint_id: string;
  question: string;
  description: string | null;
  order_index: number;
};

export type ClientSprintRetrospectiveResponse = {
  answer_id: string;
  sprint_id: string;
  question_id: string;
  user_id: string;
  member_name: string;
  competency: string;
  avatar_path: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type ClientRetrospectiveUserGroup = {
  userId: string;
  memberName: string;
  competency: string;
  avatarUrl: string | null;
  updatedAt: string;
  answers: {
    questionId: string;
    question: string;
    questionDescription: string | null;
    content: string;
  }[];
};


