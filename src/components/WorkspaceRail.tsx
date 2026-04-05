"use client";

import { useState, useEffect } from "react";

export type WorkspaceTab = "chat" | "gmail" | "calendar" | "notion" | "slack" | "linear";

interface WorkspaceRailProps {
  activeTab: WorkspaceTab | null;
  onTabChange: (tab: WorkspaceTab) => void;
}

const tabs: { id: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    id: "slack",
    label: "Slack",
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
      </svg>
    ),
  },
  {
    id: "gmail",
    label: "Gmail",
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
];

export function WorkspaceRail({ activeTab, onTabChange }: WorkspaceRailProps) {
  const [highlightedTab, setHighlightedTab] = useState<WorkspaceTab | null>(null);

  useEffect(() => {
    const handler = (e: any) => {
      const tab = e.detail?.tab;
      if (tab) {
        setHighlightedTab(tab);
        setTimeout(() => setHighlightedTab(null), 2000);
      }
    };
    window.addEventListener("highlight-tab", handler);
    return () => window.removeEventListener("highlight-tab", handler);
  }, []);

  const topTabs = tabs; // Move all tabs to the top section to be grouped together
  const bottomTabs: typeof tabs = []; // Empty the bottom section for now

  return (
    <div className="w-12 h-full bg-white border-r border-zinc-200 flex flex-col items-center pt-3 shrink-0">
      {/* Top Section */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {topTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const isHighlighted = highlightedTab === tab.id;
          return (
            <div key={tab.id} className="relative group">
              <button
                onClick={() => onTabChange(tab.id)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  isActive
                    ? "bg-zinc-900 text-white shadow-sm"
                    : isHighlighted
                    ? "bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] scale-110"
                    : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                }`}
                aria-label={tab.label}
              >
                {tab.icon}
              </button>
              {/* Active indicator */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-0.5 h-5 bg-zinc-900 rounded-full" />
              )}
              {/* Tooltip */}
              <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                <div className="bg-zinc-900 text-white text-[11px] font-medium px-2 py-1 rounded-lg whitespace-nowrap shadow-lg">
                  {tab.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Spacer to push items below to the absolute end */}
      <div className="flex-1" />

      {/* Bottom Section */}
      {bottomTabs.length > 0 && (
        <div className="flex flex-col items-center gap-1.5 w-full pt-3 pb-8 border-t border-zinc-100">
          {bottomTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isHighlighted = highlightedTab === tab.id;
            return (
              <div key={tab.id} className="relative group">
                <button
                  onClick={() => onTabChange(tab.id)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                    isActive
                      ? "bg-zinc-900 text-white shadow-sm"
                      : isHighlighted
                      ? "bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] scale-110"
                      : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                  }`}
                  aria-label={tab.label}
                >
                  {tab.icon}
                </button>
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-0.5 h-5 bg-zinc-900 rounded-full" />
                )}
                {/* Tooltip */}
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                  <div className="bg-zinc-900 text-white text-[11px] font-medium px-2 py-1 rounded-lg whitespace-nowrap shadow-lg">
                    {tab.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
