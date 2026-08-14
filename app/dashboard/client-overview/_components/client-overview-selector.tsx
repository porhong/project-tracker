"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  const selectedSprint = sprints.find((item) => item.id === selectedSprintId);

  const updateSelection = (sprintId?: string | null) => {
    if (!sprintId || sprintId === selectedSprintId) return;
    const params = new URLSearchParams(searchParams);
    params.set("sprint", sprintId);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  };

  return (
    <div className="w-full sm:w-64">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              id="client-sprint"
              variant="outline"
              className="w-full justify-between bg-input/50 hover:bg-input/70"
              disabled={isPending || sprints.length === 0}
            />
          }
        >
          {selectedSprint
            ? `Sprint #${selectedSprint.sprint_number} · ${selectedSprint.version}`
            : "Select sprint"}
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {sprints.map((sprint) => (
            <DropdownMenuItem
              key={sprint.id}
              onClick={() => updateSelection(sprint.id)}
            >
              <span>
                Sprint #{sprint.sprint_number} · {sprint.version}
              </span>
              {sprint.id === selectedSprintId ? (
                <CheckIcon className="ml-auto" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
