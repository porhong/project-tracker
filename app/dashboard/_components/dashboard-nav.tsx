"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDownIcon,
  FolderKanbanIcon,
  SettingsIcon,
  SproutIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

export function DashboardNav({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = role === "admin";
  const primaryLinks = [
    { href: "/dashboard", label: "Overview", exact: true },
    ...(role !== "viewer"
      ? [{ href: "/dashboard/my-sprint-activity", label: "My sprint activity" }]
      : []),
  ];
  const managementLinks = [
    { href: "/dashboard/projects", label: "Projects", icon: FolderKanbanIcon },
    { href: "/dashboard/sprints", label: "Sprints", icon: SproutIcon },
    { href: "/dashboard/users", label: "Users", icon: UsersIcon },
    { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
  ];
  const isActive = (link: { href: string; exact?: boolean }) =>
    link.exact ? pathname === link.href : pathname.startsWith(link.href);
  const managementActive = managementLinks.some((link) => isActive(link));
  const projectHref = (href: string) => {
    const projectId = searchParams.get("project");
    return projectId ? `${href}?project=${encodeURIComponent(projectId)}` : href;
  };

  return (
    <nav aria-label="Dashboard navigation" className="flex items-center gap-1">
      {primaryLinks.map((link) => {
        const active = isActive(link);

        return (
          <Link
            key={link.href}
            href={projectHref(link.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-2xl px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-secondary text-secondary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
      {isAdmin ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={managementActive ? "Manage, current section" : "Manage"}
                size="sm"
                variant={managementActive ? "secondary" : "ghost"}
              />
            }
          >
            Manage
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              {managementLinks.slice(0, 2).map((link) => (
                <ManagementLink
                  key={link.href}
                  link={{ ...link, href: projectHref(link.href) }}
                  active={isActive(link)}
                />
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Administration</DropdownMenuLabel>
              {managementLinks.slice(2).map((link) => (
                <ManagementLink key={link.href} link={link} active={isActive(link)} />
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </nav>
  );
}

function ManagementLink({
  link,
  active,
}: {
  link: { href: string; label: string; icon: typeof FolderKanbanIcon };
  active: boolean;
}) {
  const Icon = link.icon;

  return (
    <DropdownMenuItem
      render={<Link href={link.href} />}
      className={cn(active && "bg-accent text-accent-foreground")}
    >
      <Icon />
      {link.label}
    </DropdownMenuItem>
  );
}
