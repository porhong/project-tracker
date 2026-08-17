"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowRightIcon, UsersIcon } from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getMemberColorVariant, initialsFor } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";
import {
  MemberProfilePopover,
  type MemberProfileData,
} from "./member-profile-popover";

type ActivityContributorsGroupProps = {
  contributors: string[];
  activityName: string;
  activityTotalHours: number;
  memberProfilesMap: Map<string, MemberProfileData>;
  maxVisible?: number;
};

const hours = (value: number) =>
  value.toLocaleString("en", { maximumFractionDigits: 2 });

export function ActivityContributorsGroup({
  contributors,
  activityName,
  activityTotalHours,
  memberProfilesMap,
  maxVisible = 3,
}: ActivityContributorsGroupProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const visibleContributors = contributors.slice(0, maxVisible);
  const overflowContributors = contributors.slice(maxVisible);
  const hasOverflow = overflowContributors.length > 0;

  const handleNavigateToMember = (name: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "activity");
    params.set("search", name);
    const query = params.toString();
    router.push(`${pathname}?${query}`, { scroll: false });
  };

  return (
    <div className="flex items-center">
      <AvatarGroup className="-space-x-2">
        {visibleContributors.map((name) => {
          const profile = memberProfilesMap.get(name) ?? {
            name,
            competency: "Team member",
            totalSprintHours: 0,
            allocations: [],
            notes: [],
          };
          const colorVariant = getMemberColorVariant(name);
          const memberAlloc = profile.allocations?.find(
            (a) => a.activity === activityName,
          );
          const memberHours = memberAlloc ? memberAlloc.hours : 0;
          const percentage =
            activityTotalHours > 0
              ? Math.round((memberHours / activityTotalHours) * 100)
              : 0;

          return (
            <MemberProfilePopover
              key={name}
              member={profile}
              contextActivity={{
                activity: activityName,
                hours: memberHours,
                percentage,
              }}
              showTooltip
              tooltipText={`${name} (${profile.competency}) · ${hours(memberHours)}h`}
            >
              <Avatar size="sm" className="border-2 border-background bg-background ring-1 ring-border/50">
                <AvatarFallback
                  className={cn(
                    "text-[9px] font-semibold select-none",
                    colorVariant.avatarBg,
                  )}
                >
                  {initialsFor(name)}
                </AvatarFallback>
              </Avatar>


            </MemberProfilePopover>
          );
        })}

        {hasOverflow ? (
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring transition-transform hover:scale-110"
                  aria-label={`View all ${contributors.length} contributors for ${activityName}`}
                >
                  <AvatarGroupCount className="text-[10px] font-semibold bg-muted hover:bg-muted/80 text-muted-foreground border-2 border-background">
                    +{overflowContributors.length}
                  </AvatarGroupCount>
                </button>
              }
            />
            <PopoverContent
              align="end"
              side="top"
              sideOffset={8}
              className="w-80 rounded-3xl p-4 shadow-xl border-border bg-popover/95 backdrop-blur-md"
            >
              <PopoverHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <PopoverTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <UsersIcon className="size-3.5 text-primary" />
                    {activityName} Contributors
                  </PopoverTitle>
                  <Badge variant="secondary" className="text-[10px]">
                    {contributors.length} members
                  </Badge>
                </div>
                <PopoverDescription className="text-xs text-muted-foreground">
                  Team members assigned to {activityName} ({hours(activityTotalHours)}h total)
                </PopoverDescription>
              </PopoverHeader>

              <div className="space-y-2 pt-1 max-h-64 overflow-y-auto">
                {contributors.map((name) => {
                  const profile = memberProfilesMap.get(name) ?? {
                    name,
                    competency: "Team member",
                    totalSprintHours: 0,
                    allocations: [],
                    notes: [],
                  };
                  const colorVariant = getMemberColorVariant(name);
                  const memberAlloc = profile.allocations?.find(
                    (a) => a.activity === activityName,
                  );
                  const memberHours = memberAlloc ? memberAlloc.hours : 0;
                  const pct =
                    activityTotalHours > 0
                      ? Math.round((memberHours / activityTotalHours) * 100)
                      : 0;

                  return (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded-2xl border bg-muted/20 p-2 text-xs transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar size="sm" className="bg-background">
                          <AvatarFallback
                            className={cn(
                              "text-[10px] font-semibold select-none",
                              colorVariant.avatarBg,
                            )}
                          >
                            {initialsFor(name)}
                          </AvatarFallback>
                        </Avatar>


                        <div className="space-y-0.5 min-w-0">
                          <p className="font-semibold text-foreground truncate leading-snug">
                            {name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {profile.competency}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className="font-mono font-semibold text-primary text-[11px]">
                            {hours(memberHours)}h
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {pct}%
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-6 rounded-lg text-muted-foreground hover:text-foreground"
                          onClick={() => handleNavigateToMember(name)}
                          title={`View ${name}'s activity`}
                        >
                          <ArrowRightIcon className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </AvatarGroup>
    </div>
  );
}
