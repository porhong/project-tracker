"use client";

import { useRef, useState } from "react";
import { DownloadIcon, ImageIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { domToPng } from "modern-screenshot";
import { SprintSummarySlide } from "./sprint-summary-slide";
import type { ClientSprint, ClientSprintMilestone, ClientSprintProgress } from "../types";

type ExportSummaryDialogProps = {
  projectName: string;
  projectDescription?: string | null;
  sprint: ClientSprint;
  progressRows: ClientSprintProgress[];
  totalPlannedHours: number;
  milestones?: ClientSprintMilestone[];
  activityScope?: "own" | "team";
};

const PREVIEW_SCALE = 0.4;

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function ExportSummaryDialog({
  projectName,
  projectDescription,
  sprint,
  progressRows,
  totalPlannedHours,
  milestones,
  activityScope = "team",
}: ExportSummaryDialogProps) {
  const slideProps = {
    projectName,
    projectDescription,
    sprint,
    progressRows,
    totalPlannedHours,
    milestones,
    activityScope,
  };

  const captureSlideRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileName = `${sanitizeFileName(projectName)}_Sprint-${sprint.sprint_number}_${sanitizeFileName(sprint.version)}.png`;

  const handleDownload = async () => {
    if (!captureSlideRef.current) return;
    setIsCapturing(true);
    setError(null);

    try {
      await document.fonts.ready;
      const dataUrl = await domToPng(captureSlideRef.current, {
        scale: 1,
        type: "image/png",
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Could not generate PNG: ${message}`);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" className="gap-1.5">
            <ImageIcon className="size-4" data-icon="inline-start" />
            Export slide
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[1100px] gap-6">
        <DialogHeader>
          <DialogTitle>Export sprint summary slide</DialogTitle>
          <DialogDescription>
            Preview the 16:9 slide below, then download it as a PNG to drop into Google
            Slides.
          </DialogDescription>
        </DialogHeader>

        {/* Preview */}
        <div className="rounded-2xl border bg-muted/30 p-4">
          <div
            className="relative mx-auto overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border"
            style={{
              width: 1920 * PREVIEW_SCALE,
              height: 1080 * PREVIEW_SCALE,
            }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{ transform: `scale(${PREVIEW_SCALE})` }}
            >
              <SprintSummarySlide
                projectName={projectName}
                projectDescription={projectDescription}
                sprint={sprint}
                progressRows={progressRows}
                totalPlannedHours={totalPlannedHours}
                milestones={milestones}
                activityScope={activityScope}
              />
            </div>
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={isCapturing}
            className="gap-1.5"
          >
            {isCapturing ? (
              <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />
            ) : (
              <DownloadIcon className="size-4" data-icon="inline-start" />
            )}
            {isCapturing ? "Generating PNG…" : "Download PNG"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Full-resolution capture target rendered off-screen */}
      <div className="fixed -left-[9999px] -top-[9999px] z-0">
        <SprintSummarySlide
          ref={captureSlideRef}
          {...slideProps}
        />
      </div>
    </Dialog>
  );
}
