"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: "Overview", exact: true },
    ...(isAdmin
      ? [
          { href: "/dashboard/projects", label: "Projects" },
          { href: "/dashboard/sprints", label: "Sprints" },
          { href: "/dashboard/users", label: "Users" },
          { href: "/dashboard/settings", label: "Settings" },
        ]
      : []),
  ];

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
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
    </nav>
  );
}
