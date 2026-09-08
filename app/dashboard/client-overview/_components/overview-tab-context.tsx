"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

type OverviewTabContextType = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
};

const OverviewTabContext = createContext<OverviewTabContextType | null>(null);

export function OverviewTabProvider({
  children,
  initialTab = "timeline",
}: {
  children: ReactNode;
  initialTab?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setLocalActiveTab] = useState<string>(
    () => searchParams.get("tab") || initialTab,
  );

  const setActiveTab = useCallback(
    (tab: string) => {
      setLocalActiveTab(tab);
      const params = new URLSearchParams(window.location.search);
      if (tab === "timeline") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      const newUrl = query ? `${pathname}?${query}` : pathname;
      window.history.replaceState(null, "", newUrl);
    },
    [pathname],
  );

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setLocalActiveTab(params.get("tab") || "timeline");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return (
    <OverviewTabContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </OverviewTabContext.Provider>
  );
}

export function useOverviewTab() {
  const context = useContext(OverviewTabContext);
  if (!context) {
    throw new Error("useOverviewTab must be used within an OverviewTabProvider");
  }
  return context;
}
