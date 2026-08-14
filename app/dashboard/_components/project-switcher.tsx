"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type ProjectOption = {
  id: string;
  name: string;
  status: string;
};

export function ProjectSwitcher({ projects }: { projects: ProjectOption[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const requestedProjectId = searchParams.get("project");
  const selectedProjectId =
    projects.find((project) => project.id === requestedProjectId)?.id ??
    projects[0]?.id;
  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  if (!selectedProjectId) return null;

  const updateSelection = (projectId: string | null) => {
    if (!projectId || projectId === selectedProjectId) return;
    const params = new URLSearchParams(searchParams);
    params.set("project", projectId);
    params.delete("sprint");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  };

  return (
    <div className="w-full sm:w-64">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button id="dashboard-project" variant="outline" className="w-full justify-between bg-input/50 hover:bg-input/70" disabled={isPending} />}>
          {selectedProject?.name ?? "Select project"}<ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {projects.map((project) => (
            <DropdownMenuItem key={project.id} onClick={() => updateSelection(project.id)}>
              {project.name}
              {project.status === "archived" ? " (archived)" : ""}
              {project.id === selectedProjectId ? <CheckIcon className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
