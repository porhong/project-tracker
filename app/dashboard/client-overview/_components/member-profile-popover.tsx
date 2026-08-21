"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ActivityIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  Clock4Icon,
  MessageSquareTextIcon,
  UsersIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getMemberColorVariant, initialsFor } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";
import type { ActivityNote, PlannedAllocation } from "../types";

export type MemberProfileData = {
  name: string;
  competency: string;
  totalSprintHours: number;
  allocations?: PlannedAllocation[];
  notes?: ActivityNote[];
  latestNote?: ActivityNote | null;
};

export type ContextActivity = {
  activity: string;
  hours: number;
  percentage?: number;
};

type MemberProfilePopoverProps = {
  member: MemberProfileData;
  contextActivity?: ContextActivity;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  showTooltip?: boolean;
  tooltipText?: string;
};

const hours = (value: number) =>
  value.toLocaleString("en", { maximumFractionDigits: 2 });

function formatNoteDate(dateString: string) {
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.valueOf())) return null;
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return null;
  }
}

export function MemberProfilePopover({
  member,
  contextActivity,
  children,
  align = "center",
  side = "top",
  showTooltip = false,
  tooltipText,
}: MemberProfilePopoverProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const colorVariant = useMemo(
    () => getMemberColorVariant(member.name),
    [member.name],
  );

  const otherAllocations = useMemo(() => {
    if (!member.allocations) return [];
    if (!contextActivity) return member.allocations;
    return member.allocations.filter(
      (a) => a.activity !== contextActivity.activity,
    );
  }, [member.allocations, contextActivity]);

  const handleNavigateToActivity = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "activity");
    params.set("search", member.name);
    const query = params.toString();
    router.push(`${pathname}?${query}`, { scroll: false });
  };

  const triggerNode = showTooltip ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="inline-flex cursor-pointer transition-transform duration-150 hover:scale-110">
            {children}
          </div>
        }
      />
      <TooltipContent side="top" className="text-xs">
        {tooltipText || `${member.name} (${member.competency})`}
      </TooltipContent>
    </Tooltip>
  ) : (
    <div className="inline-flex cursor-pointer transition-transform duration-150 hover:scale-110">
      {children}
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger render={triggerNode} />
      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className="w-80 rounded-3xl p-4 shadow-xl border-border bg-popover/95 backdrop-blur-md"
      >
        <PopoverHeader className="pb-1">
          <div className="flex items-start justify-between gap-3">
            {/* Member Identity Header */}
            <div className="flex items-center gap-3 min-w-0">
              <Avatar size="lg" className={cn("bg-background ring-2", colorVariant.ringColor)}>
                <AvatarFallback
                  className={cn(
                    "font-semibold text-xs tracking-normal select-none",
                    colorVariant.avatarBg,
                  )}
                >
                  {initialsFor(member.name)}
                </AvatarFallback>
              </Avatar>


              <div className="space-y-1 min-w-0">
                <PopoverTitle className="text-sm font-semibold truncate leading-tight text-foreground">
                  {member.name}
                </PopoverTitle>
                <Badge variant="secondary" className="text-[11px] font-normal py-0">
                  {member.competency}
                </Badge>
              </div>
            </div>

            {/* Status indicator */}
            {member.notes && member.notes.length > 0 ? (
              <Badge variant="default" className="text-[10px] h-5 gap-1 shrink-0">
                <CheckCircle2Icon className="size-2.5" data-icon="inline-start" />
                Active
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] h-5 gap-1 shrink-0 text-muted-foreground"
              >
                <Clock4Icon className="size-2.5" data-icon="inline-start" />
                Planned
              </Badge>
            )}
          </div>
          <PopoverDescription className="sr-only">
            Profile details and sprint allocations for {member.name}
          </PopoverDescription>
        </PopoverHeader>

        <div className="space-y-3 pt-1 text-xs">
          {/* Context Activity Effort (if opened from activity card) */}
          {contextActivity ? (
            <div className="rounded-2xl border bg-muted/40 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="font-medium text-foreground">
                  {contextActivity.activity}
                </span>
                <span className="font-mono font-semibold text-primary">
                  {hours(contextActivity.hours)}h
                </span>
              </div>
              {contextActivity.percentage !== undefined ? (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Effort proportion</span>
                  <span className="font-medium text-foreground">
                    {contextActivity.percentage}% of activity
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Total sprint planned capacity */}
          <div className="rounded-2xl border bg-card p-2.5 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                <ActivityIcon className="size-3 text-primary" />
                Total Sprint Planned
              </span>
              <span className="font-mono font-bold text-foreground">
                {hours(member.totalSprintHours)}h
              </span>
            </div>

            {/* Other assigned activities */}
            {otherAllocations.length > 0 ? (
              <div className="pt-1 space-y-1">
                <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                  {contextActivity ? "Other sprint focus" : "Planned focus areas"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {otherAllocations.map((alloc) => (
                    <span
                      key={alloc.activity}
                      className="inline-flex items-center gap-1 rounded-xl bg-muted px-2 py-0.5 text-[10px] text-foreground font-medium"
                    >
                      <span>{alloc.activity}</span>
                      <span className="font-mono text-muted-foreground">
                        {hours(alloc.hours)}h
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Latest update note snippet */}
          {member.latestNote ? (
            <div className="rounded-2xl border bg-muted/20 p-2.5 space-y-1 shadow-2xs">
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <MessageSquareTextIcon className="size-3 text-primary shrink-0" />
                  Latest Update ({member.latestNote.activity})
                </span>
                {formatNoteDate(member.latestNote.updated_at) ? (
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {formatNoteDate(member.latestNote.updated_at)}
                  </span>
                ) : null}
              </div>
              {member.latestNote.note ? (
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  &ldquo;{member.latestNote.note}&rdquo;
                </p>
              ) : null}
            </div>
          ) : null}

          <Separator />

          {/* Action button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNavigateToActivity}
            className="w-full justify-center gap-1.5 rounded-xl text-xs font-medium h-8"
          >
            <UsersIcon className="size-3.5" data-icon="inline-start" />
            View in Member Activity
            <ArrowRightIcon className="size-3 text-muted-foreground" data-icon="inline-end" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
