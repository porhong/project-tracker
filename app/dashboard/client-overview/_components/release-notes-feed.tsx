"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpIcon,
  CalendarIcon,
  CheckCircle2Icon,
  LayersIcon,
  Loader2Icon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReleaseNotesEditor } from "../../sprints/_components/release-notes-editor";
import type { ClientReleaseSprint } from "../types";

type ReleaseNotesFeedProps = {
  releases: ClientReleaseSprint[];
};

type VersionGroup = {
  version: string;
  sprints: ClientReleaseSprint[];
};

const compactDateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

function formatSprintDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const startLabel = compactDateFormat.format(start);
  const endLabel = compactDateFormat.format(end);

  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${startLabel}, ${start.getUTCFullYear()} – ${endLabel}, ${end.getUTCFullYear()}`;
  }

  return startLabel === endLabel
    ? `${startLabel}, ${end.getUTCFullYear()}`
    : `${startLabel}–${endLabel}, ${end.getUTCFullYear()}`;
}

const PAGE_SIZE = 5;

export function ReleaseNotesFeed({ releases }: ReleaseNotesFeedProps) {
  const [visibleCount, setVisibleCount] = useState<number>(() =>
    Math.min(releases.length, PAGE_SIZE),
  );
  const [activeSprintId, setActiveSprintId] = useState<string>(
    () => releases[0]?.id ?? "",
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Group sprints by version in their chronological sequence
  const versionGroups = useMemo(() => {
    const groups: VersionGroup[] = [];
    for (const sprint of releases) {
      const v = sprint.version || "Unversioned";
      const existingGroup = groups.find((g) => g.version === v);
      if (existingGroup) {
        existingGroup.sprints.push(sprint);
      } else {
        groups.push({ version: v, sprints: [sprint] });
      }
    }
    return groups;
  }, [releases]);

  // Infinite scroll observer: load next batch when sentinel comes into view
  useEffect(() => {
    if (visibleCount >= releases.length) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(releases.length, prev + PAGE_SIZE));
        }
      },
      { rootMargin: "300px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, releases.length]);

  // Scroll spy: highlight the sprint currently in view
  useEffect(() => {
    if (releases.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const sprintId = entry.target.getAttribute("data-sprint-id");
            if (sprintId) {
              setActiveSprintId(sprintId);
            }
          }
        }
      },
      {
        rootMargin: "-15% 0px -65% 0px",
        threshold: 0,
      },
    );

    const elements = document.querySelectorAll("[data-sprint-id]");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [visibleCount, releases]);

  // Handle direct navigation to sprint or version
  const scrollToSprint = (sprintId: string) => {
    const targetIndex = releases.findIndex((s) => s.id === sprintId);
    if (targetIndex === -1) return;

    // Ensure the target sprint is rendered in DOM if beyond currently visible batch
    if (targetIndex >= visibleCount) {
      setVisibleCount(Math.min(releases.length, targetIndex + PAGE_SIZE));
    }

    setActiveSprintId(sprintId);

    // Give DOM time to update if batch size increased
    window.setTimeout(() => {
      const el = document.getElementById(`release-sprint-${sprintId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", `#release-sprint-${sprintId}`);
      }
    }, 60);
  };

  const scrollToVersion = (version: string) => {
    const group = versionGroups.find((g) => g.version === version);
    if (group && group.sprints[0]) {
      scrollToSprint(group.sprints[0].id);
    }
  };

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Check URL hash on initial mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.startsWith("#release-sprint-")) {
      const sprintId = hash.replace("#release-sprint-", "");
      const timer = window.setTimeout(() => {
        scrollToSprint(sprintId);
      }, 100);
      return () => window.clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (releases.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Sprint release notes will appear here once saved.
        </AlertDescription>
      </Alert>
    );
  }

  // Filter visible sprints according to infinite scroll count
  const visibleSprints = releases.slice(0, visibleCount);
  const visibleSprintIds = new Set(visibleSprints.map((s) => s.id));

  return (
    <div ref={topRef} className="space-y-6">
      {/* Mobile/Tablet Horizontal Quick Navigation Bar */}
      <div className="lg:hidden">
        <Card className="p-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Jump to release ({releases.length})
              </span>
              <span className="text-xs text-muted-foreground">
                {visibleCount} of {releases.length} loaded
              </span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {releases.map((sprint) => {
                const isActive = activeSprintId === sprint.id;
                return (
                  <Button
                    key={sprint.id}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    size="xs"
                    className="shrink-0"
                    onClick={() => scrollToSprint(sprint.id)}
                  >
                    <span>Sprint #{sprint.sprint_number}</span>
                    <span className="text-[11px] opacity-80">{sprint.version}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Main Grid: Infinite Scroll Feed on Left + Sticky Navigation Sidebar on Right */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        {/* Infinite Scroll Release Notes Feed (Left column) */}
        <main className="space-y-8 min-w-0">
          {versionGroups.map((group) => {
            const groupVisibleSprints = group.sprints.filter((s) =>
              visibleSprintIds.has(s.id),
            );
            if (groupVisibleSprints.length === 0) return null;

            return (
              <section
                key={group.version}
                className="space-y-6"
                aria-label={`Releases for version ${group.version}`}
              >
                {/* Version Group Break / Header */}
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <div className="flex items-center gap-2 rounded-2xl border bg-muted/40 px-3.5 py-1 text-xs font-medium text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Version {group.version}
                    </span>
                    <span>·</span>
                    <span>
                      {group.sprints.length}{" "}
                      {group.sprints.length === 1 ? "release" : "releases"}
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Sprints within this Version */}
                <div className="space-y-6">
                  {groupVisibleSprints.map((sprint) => (
                    <article
                      key={sprint.id}
                      id={`release-sprint-${sprint.id}`}
                      data-sprint-id={sprint.id}
                      className="scroll-mt-24 rounded-2xl border bg-card p-5 shadow-xs transition-colors space-y-4 sm:p-6"
                    >
                      <div className="space-y-2 border-b pb-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <h3 className="text-lg font-semibold">
                              Sprint #{sprint.sprint_number}
                            </h3>
                            <Badge variant="outline">{sprint.version}</Badge>
                            <Badge
                              variant={
                                sprint.status === "active"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {sprint.status === "active"
                                ? "Active sprint"
                                : "Completed"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarIcon className="size-3.5" />
                            <span>
                              {formatSprintDateRange(
                                sprint.start_date,
                                sprint.end_date,
                              )}
                            </span>
                          </div>
                        </div>

                        {sprint.description ? (
                          <p className="text-sm text-muted-foreground">
                            {sprint.description}
                          </p>
                        ) : null}
                      </div>

                      <ReleaseNotesEditor content={sprint.release_notes} />
                    </article>
                  ))}
                </div>
              </section>
            );
          })}

          {/* Infinite Scroll Sentinel & Status */}
          <div ref={sentinelRef} className="py-4">
            {visibleCount < releases.length ? (
              <Card className="p-4">
                <CardContent className="flex flex-col items-center justify-between gap-3 p-0 sm:flex-row">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" />
                    <span>
                      Showing {visibleCount} of {releases.length} releases. Scroll
                      down to load more…
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount(releases.length)}
                  >
                    Load all releases
                  </Button>
                </CardContent>
              </Card>
            ) : releases.length > 0 ? (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <CheckCircle2Icon className="size-4 text-primary" />
                <span>
                  All {releases.length}{" "}
                  {releases.length === 1 ? "release" : "releases"} loaded
                </span>
              </div>
            ) : null}
          </div>
        </main>

        {/* Desktop Sticky Navigation Sidebar (Right column) */}
        <aside className="hidden lg:sticky lg:top-4 lg:block">
          <Card className="max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <LayersIcon className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Release index</h3>
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {releases.length}
                </Badge>
              </div>

              <nav className="space-y-4" aria-label="Release notes index">
                {versionGroups.map((group) => (
                  <div key={group.version} className="space-y-1">
                    <div className="flex items-center justify-between px-2 py-0.5">
                      <button
                        type="button"
                        onClick={() => scrollToVersion(group.version)}
                        className="text-left text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Version {group.version}
                      </button>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {group.sprints.length} {group.sprints.length === 1 ? "sprint" : "sprints"}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {group.sprints.map((sprint) => {
                        const isActive = activeSprintId === sprint.id;
                        return (
                          <Button
                            key={sprint.id}
                            type="button"
                            variant={isActive ? "secondary" : "ghost"}
                            size="sm"
                            className="w-full justify-between font-normal"
                            onClick={() => scrollToSprint(sprint.id)}
                          >
                            <span className="truncate">
                              Sprint #{sprint.sprint_number}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-mono text-xs text-muted-foreground">
                                {sprint.version}
                              </span>
                              {sprint.status === "active" ? (
                                <Badge
                                  variant="default"
                                  className="h-4 px-1 text-[10px]"
                                >
                                  Active
                                </Badge>
                              ) : null}
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="border-t pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs text-muted-foreground"
                  onClick={scrollToTop}
                >
                  <ArrowUpIcon className="size-3.5" data-icon="inline-start" />
                  Back to top
                </Button>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
