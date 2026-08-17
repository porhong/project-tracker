"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2Icon,
  Clock4Icon,
  FilterIcon,
  LayoutGridIcon,
  ListIcon,
  MessageSquareTextIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMemberColorVariant, initialsFor } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";
import type {
  ActivityNote,
  ClientSprint,
  ClientSprintProgress,
  PlannedAllocation,
} from "../types";

type MemberActivityExplorerProps = {
  sprint: ClientSprint;
  progressRows: ClientSprintProgress[];
  totalPlannedHours: number;
};

const hours = (value: number) =>
  value.toLocaleString("en", { maximumFractionDigits: 1 });

function isPlannedAllocation(value: unknown): value is PlannedAllocation {
  return (
    typeof value === "object" &&
    value !== null &&
    "activity" in value &&
    "hours" in value &&
    typeof value.activity === "string" &&
    typeof value.hours === "number"
  );
}

function isActivityNote(value: unknown): value is ActivityNote {
  return (
    typeof value === "object" &&
    value !== null &&
    "activity" in value &&
    "note" in value &&
    "updated_at" in value &&
    typeof value.activity === "string" &&
    (typeof value.note === "string" || value.note === null) &&
    typeof value.updated_at === "string"
  );
}

function parseAllocations(value: ClientSprintProgress["planned_allocations"]) {
  return Array.isArray(value) ? value.filter(isPlannedAllocation) : [];
}

function parseActivityNotes(value: ClientSprintProgress["activity_notes"]) {
  return Array.isArray(value) ? value.filter(isActivityNote) : [];
}

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

type StatusFilter = "all" | "active-updates" | "awaiting-updates";

export function MemberActivityExplorer({
  sprint,
  progressRows,
  totalPlannedHours,
}: MemberActivityExplorerProps) {
  const searchParams = useSearchParams();
  const urlSearchParam = searchParams.get("search") || "";
  const [userQuery, setUserQuery] = useState<string | null>(null);
  const [prevUrlParam, setPrevUrlParam] = useState(urlSearchParam);

  if (prevUrlParam !== urlSearchParam) {
    setPrevUrlParam(urlSearchParam);
    setUserQuery(null);
  }

  const searchQuery = userQuery ?? urlSearchParam;
  const setSearchQuery = (val: string) => setUserQuery(val);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Normalized member data with parsed allocations, notes, and metrics
  const members = useMemo(() => {
    return progressRows.map((row) => {
      const memberAllocations = parseAllocations(row.planned_allocations);
      const memberNotes = parseActivityNotes(row.activity_notes);
      const memberTotalHours = memberAllocations.reduce(
        (sum, item) => sum + item.hours,
        0,
      );
      const hasUpdates = memberNotes.length > 0;
      const latestNote = memberNotes.length > 0 ? memberNotes[0] : null;

      return {
        id: `${row.sprint_id}-${row.member_name || "member"}`,
        name: row.member_name || "Project member",
        competency: row.competency || "Team member",
        allocations: memberAllocations,
        notes: memberNotes,
        latestNote,
        totalHours: memberTotalHours,
        hasUpdates,
        raw: row,
      };
    });
  }, [progressRows]);

  // Aggregate discipline/activity options for filter chips
  const activityOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const member of members) {
      for (const item of member.allocations) {
        map.set(item.activity, (map.get(item.activity) ?? 0) + item.hours);
      }
    }
    return Array.from(map.entries())
      .map(([activity, totalHours]) => ({
        activity,
        totalHours,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [members]);

  // Counts for filter pills
  const membersWithUpdatesCount = useMemo(
    () => members.filter((m) => m.hasUpdates).length,
    [members],
  );
  const membersAwaitingUpdatesCount = members.length - membersWithUpdatesCount;

  // Filtered members
  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return members.filter((member) => {
      // Status filter
      if (statusFilter === "active-updates" && !member.hasUpdates) return false;
      if (statusFilter === "awaiting-updates" && member.hasUpdates) return false;

      // Activity filter
      if (
        selectedActivity &&
        !member.allocations.some((a) => a.activity === selectedActivity)
      ) {
        return false;
      }

      // Search query
      if (query) {
        const matchesName = member.name.toLowerCase().includes(query);
        const matchesRole = member.competency.toLowerCase().includes(query);
        const matchesAllocation = member.allocations.some((a) =>
          a.activity.toLowerCase().includes(query),
        );
        const matchesNotes = member.notes.some(
          (n) =>
            n.activity.toLowerCase().includes(query) ||
            (n.note && n.note.toLowerCase().includes(query)),
        );
        if (!matchesName && !matchesRole && !matchesAllocation && !matchesNotes) {
          return false;
        }
      }

      return true;
    });
  }, [members, searchQuery, statusFilter, selectedActivity]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    selectedActivity !== null;

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setSelectedActivity(null);
  };

  if (members.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No team members are assigned to Sprint #{sprint.sprint_number}.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Interactive Toolbar: Search, Status Tabs, View Switcher */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Search input */}
        <div className="relative w-full md:max-w-xs">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search member, role, or focus area..."
            className="pl-9 pr-8"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>

        {/* Status filters & View mode */}
        <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={statusFilter === "all" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setStatusFilter("all")}
            >
              All members ({members.length})
            </Button>
            <Button
              type="button"
              variant={statusFilter === "active-updates" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setStatusFilter("active-updates")}
            >
              <CheckCircle2Icon className="size-3 text-primary" data-icon="inline-start" />
              With updates ({membersWithUpdatesCount})
            </Button>
            <Button
              type="button"
              variant={statusFilter === "awaiting-updates" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setStatusFilter("awaiting-updates")}
            >
              <Clock4Icon className="size-3 text-muted-foreground" data-icon="inline-start" />
              Awaiting ({membersAwaitingUpdatesCount})
            </Button>
          </div>

          <Separator orientation="vertical" className="hidden h-5 md:block" />

          {/* View toggle */}
          <div className="flex items-center rounded-2xl border bg-muted/30 p-0.5">
            <Button
              type="button"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="xs"
              className="px-2"
              onClick={() => setViewMode("grid")}
              aria-label="Cards view"
            >
              <LayoutGridIcon className="size-3.5" data-icon="inline-start" />
              Cards
            </Button>
            <Button
              type="button"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="xs"
              className="px-2"
              onClick={() => setViewMode("table")}
              aria-label="Table view"
            >
              <ListIcon className="size-3.5" data-icon="inline-start" />
              Table
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Focus Area Filter Chips */}
      {activityOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-xs font-medium text-muted-foreground mr-1">
            Focus Areas:
          </span>
          {activityOptions.map((item) => {
            const isSelected = selectedActivity === item.activity;
            return (
              <Button
                key={item.activity}
                type="button"
                variant={isSelected ? "default" : "outline"}
                size="xs"
                className="rounded-xl h-6 text-xs font-normal"
                onClick={() =>
                  setSelectedActivity(isSelected ? null : item.activity)
                }
              >
                <span>{item.activity}</span>
                <span className="opacity-70 ml-1 text-[11px]">
                  ({hours(item.totalHours)}h)
                </span>
              </Button>
            );
          })}
          {selectedActivity ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => setSelectedActivity(null)}
            >
              <XIcon className="size-3" data-icon="inline-start" />
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Filter status banner if filtered */}
      {hasActiveFilters ? (
        <div className="flex items-center justify-between rounded-2xl border bg-muted/40 px-4 py-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FilterIcon className="size-3.5" />
            <span>
              Showing <strong>{filteredMembers.length}</strong> of{" "}
              <strong>{members.length}</strong> team members
              {selectedActivity ? (
                <span>
                  {" "}
                  working on <strong>{selectedActivity}</strong>
                </span>
              ) : null}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={resetFilters}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset all filters
          </Button>
        </div>
      ) : null}

      {/* Member Display */}
      {filteredMembers.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <UsersIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">No team members match your filter</h3>
              <p className="text-xs text-muted-foreground">
                Try searching for a different keyword or clearing your active filters.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          </div>
        </Card>
      ) : viewMode === "grid" ? (
        /* Rich Card Grid View */
        <div className="grid gap-4 md:grid-cols-2">
          {filteredMembers.map((member) => {
            const colorVariant = getMemberColorVariant(member.name);
            const sprintPct =
              totalPlannedHours > 0
                ? Math.round((member.totalHours / totalPlannedHours) * 100)
                : 0;

            return (
              <Card
                key={member.id}
                className="flex flex-col justify-between transition-shadow hover:shadow-sm"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    {/* Member Identity: Avatar + Name + Role */}
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar
                        size="lg"
                        className={cn("bg-background ring-2", colorVariant.ringColor)}
                      >
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
                        <CardTitle className="text-base font-semibold truncate leading-tight text-foreground">
                          {member.name}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-xs font-normal">
                            {member.competency}
                          </Badge>
                          {sprintPct > 0 ? (
                            <span className="text-[11px] text-muted-foreground font-medium">
                              ({sprintPct}% of sprint)
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Total Planned Capacity */}
                    <div className="text-right shrink-0 space-y-0.5">
                      <Badge variant="outline" className="font-semibold text-xs">
                        {hours(member.totalHours)}h planned
                      </Badge>
                      <p className="text-[10px] text-muted-foreground">
                        {member.allocations.length} focus area
                        {member.allocations.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3.5 pt-0">
                  {/* Focus Areas Badges */}
                  {member.allocations.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Assigned Focus
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {member.allocations.map((allocation) => {
                          const isSelected = selectedActivity === allocation.activity;
                          return (
                            <Badge
                              key={allocation.activity}
                              variant={isSelected ? "default" : "secondary"}
                              className="cursor-pointer transition-all hover:opacity-90 text-xs py-0.5 px-2"
                              onClick={() =>
                                setSelectedActivity(
                                  isSelected ? null : allocation.activity,
                                )
                              }
                            >
                              <span>{allocation.activity}</span>
                              <span className="opacity-75 ml-1 font-mono text-[11px]">
                                · {hours(allocation.hours)}h
                              </span>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* Latest Activity Update (Executive Highlight) */}
                  <div className="rounded-2xl border bg-muted/20 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <MessageSquareTextIcon className="size-3.5 text-primary shrink-0" />
                        <span className="font-semibold">
                          {member.latestNote ? member.latestNote.activity : "Status Update"}
                        </span>
                      </div>
                      {member.latestNote && formatNoteDate(member.latestNote.updated_at) ? (
                        <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                          {formatNoteDate(member.latestNote.updated_at)}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                          Awaiting Update
                        </Badge>
                      )}
                    </div>

                    {member.latestNote?.note ? (
                      <p className="text-xs text-muted-foreground leading-relaxed pl-5">
                        &ldquo;{member.latestNote.note}&rdquo;
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/70 italic pl-5">
                        No progress updates logged for this sprint yet.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Detailed Table View */
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[240px]">Team Member</TableHead>
                <TableHead className="w-[120px]">Planned</TableHead>
                <TableHead className="w-[240px]">Focus Areas</TableHead>
                <TableHead>Latest Status Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.map((member) => {
                const colorVariant = getMemberColorVariant(member.name);
                return (
                  <TableRow key={member.id} className="align-top">
                    {/* Member identity */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar size="default" className={cn("bg-background ring-1", colorVariant.ringColor)}>
                          <AvatarFallback
                            className={cn(
                              "font-semibold text-[11px] select-none",
                              colorVariant.avatarBg,
                            )}
                          >
                            {initialsFor(member.name)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground leading-snug">
                            {member.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.competency}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Planned Hours */}
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="outline" className="font-semibold text-xs">
                          {hours(member.totalHours)}h
                        </Badge>
                      </div>
                    </TableCell>

                    {/* Planned allocations */}
                    <TableCell>
                      {member.allocations.length ? (
                        <div className="flex flex-wrap gap-1">
                          {member.allocations.map((allocation) => (
                            <Badge
                              key={allocation.activity}
                              variant="secondary"
                              className="text-xs py-0.5 px-2"
                            >
                              {allocation.activity} ({hours(allocation.hours)}h)
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Latest Note */}
                    <TableCell>
                      {member.latestNote ? (
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {member.latestNote.activity}
                            </span>
                            {formatNoteDate(member.latestNote.updated_at) ? (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                ({formatNoteDate(member.latestNote.updated_at)})
                              </span>
                            ) : null}
                          </div>
                          {member.latestNote.note ? (
                            <p className="text-muted-foreground">
                              &ldquo;{member.latestNote.note}&rdquo;
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Awaiting update
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
