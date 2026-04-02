"use client";

import { useState, useEffect } from "react";

interface SlackWorkspace {
  id: string;
  teamId: string;
  teamName: string;
}

export function SlackPanel() {
  const [workspaces, setWorkspaces] = useState<SlackWorkspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/slack/workspaces")
      .then((r) => r.json())
      .then((data) => setWorkspaces(data.workspaces || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col items-center justify-center shrink-0 px-8">
        <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col items-center justify-center shrink-0 px-8 text-center pb-16">
        <div className="w-11 h-11 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-zinc-800 mb-1">Slack</p>
        <p className="text-xs text-zinc-400 mb-5">Post updates and read channels.</p>
        <a
          href="/api/auth/slack"
          className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors"
        >
          Connect Slack
        </a>
      </div>
    );
  }

  return (
    <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
      <div className="p-4 border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
            <span className="text-sm font-semibold text-zinc-800">Slack</span>
          </div>
          <a
            href="/api/auth/slack"
            className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            + Add workspace
          </a>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100"
          >
            <div className="w-8 h-8 rounded-lg bg-[#4A154B] flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{ws.teamName[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-800 truncate">{ws.teamName}</p>
              <p className="text-[10px] text-zinc-400">Connected</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
