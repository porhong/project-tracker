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
import type { ClientSprint } from "../types";

type ClientOverviewSelectorProps = {
  sprints: ClientSprint[];
  selectedSprintId: string | null;
};

export function ClientOverviewSelector({
  sprints,
  selectedSprintId,
}: ClientOverviewSelectorProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateSelection = (sprintId?: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (sprintId) params.set("sprint", sprintId);
    else params.delete("sprint");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  };

  return (
    <div className="rounded-2xl border bg-muted/40 p-4">
      <div className="max-w-sm space-y-2">
        <Label htmlFor="client-sprint">Sprint</Label>
        <Select
          value={selectedSprintId ?? undefined}
          disabled={isPending || sprints.length === 0}
          onValueChange={(value) => updateSelection(value)}
        >
          <SelectTrigger id="client-sprint" className="w-full">
            <SelectValue>
              {(value) => {
                const sprint = sprints.find((item) => item.id === value);
                return sprint
                  ? `Sprint #${sprint.sprint_number} · ${sprint.version}`
                  : "No visible sprint";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sprints.map((sprint) => (
              <SelectItem key={sprint.id} value={sprint.id}>
                Sprint #{sprint.sprint_number} · {sprint.version}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
