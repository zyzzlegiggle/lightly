"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";

interface NotionPanelProps {
  projectId: string;
}

export function NotionPanel({ projectId }: NotionPanelProps) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const resp = await fetch(`/api/projects/${projectId}/notion`);
        if (resp.ok) {
          const data = await resp.json();
          setConnected(data.connected);
          setPageId(data.pageId);
        }
      } catch (err) {
        console.error("Failed to check Notion connection:", err);
      } finally {
        setLoading(false);
      }
    };
    checkConnection();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50/50">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm text-center">
          <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-zinc-900 mb-2">Connect Notion</h2>
          <p className="text-zinc-500 mb-8 text-sm leading-relaxed">
            Link your Notion workspace to automatically create and sync project notes and documentation.
          </p>
          <a
            href={`/api/auth/notion?returnTo=/project/${projectId}`}
            className="w-full inline-flex items-center justify-center gap-2 bg-zinc-950 text-white rounded-xl px-4 py-3 text-sm font-bold hover:bg-zinc-800 transition-all shadow-md active:scale-95"
          >
            Connect Notion Account
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      <div className="h-14 border-b border-zinc-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center text-white font-bold text-xs">
            N
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Project Notes</h2>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Dedicated Page</span>
          </div>
        </div>
        {pageId && (
          <a
            href={`https://notion.so/${pageId.replace(/-/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
      <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
        <div className="max-w-md">
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Notion Project Page Active</h3>
          <p className="text-sm text-zinc-500 mb-6">
            Your dedicated project page is ready. The AI agent will auto-sync project architectural notes and task summaries here.
          </p>
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-left">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-tight mb-2">Connected Page ID</p>
            <code className="text-[10px] text-zinc-600 break-all">{pageId || "Default Workspace"}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
