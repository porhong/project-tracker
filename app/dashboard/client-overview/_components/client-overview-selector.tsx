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
import { MarqueeLabel } from "../../_components/marquee-label";
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
  const selectedLabel = selectedSprint
    ? `Sprint #${selectedSprint.sprint_number} · ${selectedSprint.version}`
    : "Select sprint";

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
              className="w-full min-w-0 justify-between overflow-hidden bg-input/50 hover:bg-input/70"
              disabled={isPending || sprints.length === 0}
            />
          }
        >
          <MarqueeLabel>{selectedLabel}</MarqueeLabel>
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
