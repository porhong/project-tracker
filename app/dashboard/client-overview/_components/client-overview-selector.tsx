"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClientProject, ClientSprint } from "../types";

type ClientOverviewSelectorProps = {
  projects: ClientProject[];
  selectedProjectId: string;
  sprints: ClientSprint[];
  selectedSprintId: string | null;
};

export function ClientOverviewSelector({
  projects,
  selectedProjectId,
  sprints,
  selectedSprintId,
}: ClientOverviewSelectorProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateSelection = (projectId: string, sprintId?: string | null) => {
    const params = new URLSearchParams(searchParams);
    params.set("project", projectId);
    if (sprintId) params.set("sprint", sprintId);
    else params.delete("sprint");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  };

  return (
    <div className="grid gap-4 rounded-2xl border bg-muted/40 p-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="client-project">Project</Label>
        <Select
          value={selectedProjectId}
          disabled={isPending}
          onValueChange={(value) => value && updateSelection(value)}
        >
          <SelectTrigger id="client-project" className="w-full">
            <SelectValue>
              {(value) =>
                projects.find((project) => project.id === value)?.name ??
                "Select project"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
                {project.status === "archived" ? " (archived)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="client-sprint">Sprint</Label>
        <Select
          value={selectedSprintId ?? undefined}
          disabled={isPending || sprints.length === 0}
          onValueChange={(value) => updateSelection(selectedProjectId, value)}
        >
          <SelectTrigger id="client-sprint" className="w-full">
            <SelectValue>
              {(value) => {
                const sprint = sprints.find((item) => item.id === value);
                return sprint?.name ?? "No visible sprint";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sprints.map((sprint) => (
              <SelectItem key={sprint.id} value={sprint.id}>
                {sprint.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
