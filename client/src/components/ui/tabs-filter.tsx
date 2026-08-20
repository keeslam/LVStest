import React from "react";
import { cn } from "@/lib/utils";

interface TabsFilterProps {
  tabs: {
    id: string;
    label: string;
    count?: number;
  }[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function TabsFilter({ tabs, activeTab, onChange, className }: TabsFilterProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            activeTab === tab.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted hover:bg-muted/80 text-muted-foreground"
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn(
              "ml-2 px-1.5 py-0.5 rounded-full text-xs",
              activeTab === tab.id
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted-foreground/20 text-muted-foreground"
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}