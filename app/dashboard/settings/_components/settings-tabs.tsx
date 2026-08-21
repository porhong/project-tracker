"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const DEFAULT_TAB = "calendar";

const SETTINGS_TABS = ["calendar", "activities", "mcp"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}

type SettingsTabsProps = {
  calendar: ReactNode;
  activities: ReactNode;
  mcp: ReactNode;
};

export function SettingsTabs({ calendar, activities, mcp }: SettingsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requested = searchParams.get("tab");
  const activeTab = isSettingsTab(requested) ? requested : DEFAULT_TAB;

  const handleTabChange = (value: string | number | null) => {
    if (!value || typeof value !== "string" || !isSettingsTab(value)) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList aria-label="Settings sections" variant="line" className="w-full max-w-2xl">
        <TabsTrigger value="calendar">Work calendar</TabsTrigger>
        <TabsTrigger value="activities">Activities</TabsTrigger>
        <TabsTrigger value="mcp">AI agents (MCP)</TabsTrigger>
      </TabsList>
      <TabsContent value="calendar" className="pt-4">
        {calendar}
      </TabsContent>
      <TabsContent value="activities" className="pt-4">
        {activities}
      </TabsContent>
      <TabsContent value="mcp" className="pt-4">
        {mcp}
      </TabsContent>
    </Tabs>
  );
}
