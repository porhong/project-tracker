"use client";

import { useMemo, useState } from "react";
import {
  ActivityIcon,
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
  CardDescription,
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
  value.toLocaleString("en", { maximumFractionDigits: 2 });

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

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  const [searchQuery, setSearchQuery] = useState("");
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

      return {
        id: `${row.sprint_id}-${row.member_name || "member"}`,
        name: row.member_name || "Project member",
        competency: row.competency || "Team member",
        allocations: memberAllocations,
        notes: memberNotes,
        totalHours: memberTotalHours,
        hasUpdates,
        raw: row,
      };
    });
  }, [progressRows]);

  // Aggregate sprint-level discipline/activity distribution
  const activityDistribution = useMemo(() => {
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
        percentage:
          totalPlannedHours > 0
            ? Math.round((totalHours / totalPlannedHours) * 100)
            : 0,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [members, totalPlannedHours]);

  // Counts for filters
  const membersWithUpdatesCount = useMemo(
    () => members.filter((m) => m.hasUpdates).length,
    [members],
  );
  const membersAwaitingUpdatesCount = members.length - membersWithUpdatesCount;

  // Filtered members based on search, status filter, and activity filter
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
          No project members are assigned to Sprint #{sprint.sprint_number}.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* High-level sprint discipline distribution / focus overview */}
      {activityDistribution.length > 0 ? (
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ActivityIcon className="size-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  Sprint Effort Distribution
                </CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                Click any activity to filter team members
              </span>
            </div>
            <CardDescription>
              How the team&apos;s {hours(totalPlannedHours)}h allocation is distributed across disciplines.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {activityDistribution.map((item) => {
                const isSelected = selectedActivity === item.activity;
                return (
                  <Button
                    key={item.activity}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="h-auto py-1.5 px-3 text-xs"
                    onClick={() =>
                      setSelectedActivity(isSelected ? null : item.activity)
                    }
                  >
                    <span className="font-medium">{item.activity}</span>
                    <span
                      className={
                        isSelected
                          ? "text-primary-foreground/90 font-mono text-[11px]"
                          : "text-muted-foreground font-mono text-[11px]"
                      }
                    >
                      · {hours(item.totalHours)}h ({item.percentage}%)
                    </span>
                  </Button>
                );
              })}
              {selectedActivity ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto py-1.5 px-2 text-xs text-muted-foreground"
                  onClick={() => setSelectedActivity(null)}
                >
                  <XIcon className="size-3.5" data-icon="inline-start" />
                  Clear focus filter
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Interactive Toolbar: Search, Status Tabs, View Switcher */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Search input */}
        <div className="relative w-full md:max-w-xs">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search member, role, activity..."
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
              aria-label="Grid view"
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
                  allocated to <strong>{selectedActivity}</strong>
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
          {filteredMembers.map((member) => (
            <Card key={member.id} className="flex flex-col justify-between">
              <div>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-3">
                    {/* Member Identity: Avatar + Name + Competency */}
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar size="lg">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-1 min-w-0">
                        <CardTitle className="text-base font-semibold truncate leading-tight">
                          {member.name}
                        </CardTitle>
                        <Badge variant="secondary" className="text-xs font-normal">
                          {member.competency}
                        </Badge>
                      </div>
                    </div>

                    {/* Total Planned Capacity */}
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className="font-mono font-semibold text-xs">
                        {hours(member.totalHours)}h planned
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  {/* Status Indicator Bar */}
                  <div className="flex items-center justify-between rounded-2xl border bg-muted/30 px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground font-medium">Progress Status</span>
                    {member.hasUpdates ? (
                      <Badge variant="default" className="gap-1.5 text-[11px]">
                        <CheckCircle2Icon className="size-3" data-icon="inline-start" />
                        {member.notes.length}{" "}
                        {member.notes.length === 1 ? "update logged" : "updates logged"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1.5 text-[11px] text-muted-foreground">
                        <Clock4Icon className="size-3" data-icon="inline-start" />
                        Awaiting progress update
                      </Badge>
                    )}
                  </div>

                  {/* Planned Activities Section */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                      Planned Focus &amp; Hours
                    </p>
                    {member.allocations.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {member.allocations.map((allocation) => {
                          const isSelected =
                            selectedActivity === allocation.activity;
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
                              <span
                                className={
                                  isSelected
                                    ? "font-mono text-primary-foreground/90 text-[11px]"
                                    : "font-mono text-muted-foreground text-[11px]"
                                }
                              >
                                · {hours(allocation.hours)}h
                              </span>
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        No planned activities recorded for this sprint.
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Reported Activities & Notes Section */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                        Reported Activity &amp; Notes
                      </p>
                      {member.notes.length > 0 ? (
                        <span className="text-[11px] text-muted-foreground">
                          {member.notes.length} {member.notes.length === 1 ? "entry" : "entries"}
                        </span>
                      ) : null}
                    </div>

                    {member.notes.length ? (
                      <div className="space-y-2">
                        {member.notes.map((note, index) => {
                          const dateLabel = formatNoteDate(note.updated_at);
                          return (
                            <div
                              key={`${note.activity}-${note.updated_at}-${index}`}
                              className="rounded-2xl border bg-card p-3 shadow-2xs space-y-1.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 font-medium text-foreground">
                                  <MessageSquareTextIcon className="size-3.5 text-primary shrink-0" />
                                  <span className="font-semibold">{note.activity}</span>
                                </div>
                                {dateLabel ? (
                                  <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                                    {dateLabel}
                                  </span>
                                ) : null}
                              </div>
                              {note.note ? (
                                <p className="text-muted-foreground leading-relaxed pl-5">
                                  {note.note}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed bg-muted/20 p-3 text-center">
                        <p className="text-xs text-muted-foreground">
                          No progress notes reported yet for this sprint.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* Detailed Table View */
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[260px]">Team Member</TableHead>
                <TableHead className="w-[140px]">Status</TableHead>
                <TableHead className="w-[280px]">Planned Focus</TableHead>
                <TableHead>Reported Activity &amp; Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.map((member) => (
                <TableRow key={member.id} className="align-top">
                  {/* Member identity */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar size="default">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                          {getInitials(member.name)}
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

                  {/* Status & Total Hours */}
                  <TableCell>
                    <div className="space-y-1.5">
                      {member.hasUpdates ? (
                        <Badge variant="default" className="text-[11px]">
                          <CheckCircle2Icon className="size-3" data-icon="inline-start" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-muted-foreground">
                          <Clock4Icon className="size-3" data-icon="inline-start" />
                          Awaiting
                        </Badge>
                      )}
                      <p className="font-mono text-xs text-muted-foreground">
                        {hours(member.totalHours)}h total
                      </p>
                    </div>
                  </TableCell>

                  {/* Planned allocations */}
                  <TableCell>
                    {member.allocations.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {member.allocations.map((allocation) => {
                          const isSelected =
                            selectedActivity === allocation.activity;
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
                              <span
                                className={
                                  isSelected
                                    ? "font-mono text-primary-foreground/90 text-[11px]"
                                    : "font-mono text-muted-foreground text-[11px]"
                                }
                              >
                                · {hours(allocation.hours)}h
                              </span>
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Reported notes */}
                  <TableCell>
                    {member.notes.length ? (
                      <ul className="space-y-2">
                        {member.notes.map((note, index) => {
                          const dateLabel = formatNoteDate(note.updated_at);
                          return (
                            <li
                              key={`${note.activity}-${note.updated_at}-${index}`}
                              className="text-xs space-y-0.5"
                            >
                              <div className="flex items-center gap-1.5 font-medium">
                                <span className="font-semibold text-foreground">
                                  {note.activity}
                                </span>
                                {dateLabel ? (
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    ({dateLabel})
                                  </span>
                                ) : null}
                              </div>
                              {note.note ? (
                                <p className="text-muted-foreground">
                                  {note.note}
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        No updates reported yet
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
