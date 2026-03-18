"use client";

import { useSearchParams, useParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params?.id as string;
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(searchParams.get("preview") || null);
  const [statusData, setStatusData] = useState<any>(null);
  const phase = statusData?.phase || "BUILDING";

  // Extract the clean base domain from the full URL
  const displayDomain = useMemo(() => {
    if (!previewUrl) return "";
    try {
      const url = new URL(previewUrl);
      return url.hostname;
    } catch {
      return previewUrl;
    }
  }, [previewUrl]);

  // The Polling Hustle
  useEffect(() => {
    let isActive = true;
    
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/status`);
        if (!res.ok) throw new Error("Status API error");
        
        const data = await res.json();
        if (!isActive) return;

        setStatusData(data);

        // Wire up the live URL when it arrives
        if (data.liveUrl && !previewUrl) {
          setPreviewUrl(data.liveUrl);
        }

        if (data.phase !== "ACTIVE" && data.phase !== "ERROR") {
          setTimeout(fetchStatus, 3000);
        }
      } catch (err) {
        console.error("Polling error", err);
        if (isActive) setTimeout(fetchStatus, 5000);
      }
    };

    if (projectId) {
      fetchStatus();
    }

    return () => { isActive = false; };
  }, [projectId]);

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-100 font-sans">
      {/* Minimal top nav */}
      <div className="h-12 bg-white border-b border-zinc-200 flex items-center px-4 gap-3 shrink-0 z-10">
        <Link href="/" className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400 hover:text-zinc-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </Link>
        <div className="w-px h-5 bg-zinc-200" />
        <span className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
          Project
          {phase === "ACTIVE" && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          )}
        </span>
      </div>

      {/* Browser preview area */}
      <div className="flex-1 overflow-hidden p-3">
        <div className="w-full h-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col">
          
          {/* Browser chrome header */}
          <div className="h-10 bg-zinc-50 border-b border-zinc-200 flex items-center px-3 gap-3 shrink-0">
            {/* Window dots */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-zinc-300 hover:bg-red-400 transition-colors cursor-default" />
              <div className="w-3 h-3 rounded-full bg-zinc-300 hover:bg-yellow-400 transition-colors cursor-default" />
              <div className="w-3 h-3 rounded-full bg-zinc-300 hover:bg-green-400 transition-colors cursor-default" />
            </div>

            {/* Navigation arrows */}
            <div className="flex items-center gap-0.5 text-zinc-400">
              <button className="p-1 hover:bg-zinc-200 rounded transition-colors" disabled>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button className="p-1 hover:bg-zinc-200 rounded transition-colors" disabled>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>

            {/* URL bar */}
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-1 min-w-[260px] max-w-md w-full shadow-inner">
                {phase === "ACTIVE" && previewUrl ? (
                  <>
                    <svg className="w-3 h-3 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    <span className="text-xs text-zinc-500 font-mono truncate select-all">{displayDomain}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 text-zinc-400 shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-xs text-zinc-400 italic">/</span>
                  </>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              {phase === "ACTIVE" && previewUrl && (
                <>
                  <button
                    onClick={() => navigator.clipboard.writeText(previewUrl)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors"
                    title="Copy URL"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors"
                    title="Open in new tab"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden relative bg-white">
            {phase !== "ACTIVE" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-50/50">
                <div className="relative mb-6">
                  <div className="w-16 h-16 border-[3px] border-zinc-200 rounded-full" />
                  <div className="w-16 h-16 border-[3px] border-accent-primary border-t-transparent rounded-full animate-spin absolute inset-0" />
                </div>
                <h2 className="text-xl font-bold text-zinc-800 mb-1.5">Deploying your project...</h2>
                <p className="text-zinc-500 text-sm max-w-sm text-center">
                  Pulling your repository, building the environment, and starting the sandbox.
                </p>
                {statusData?.logs && (
                  <div className="mt-6 bg-zinc-900 text-zinc-400 rounded-lg px-4 py-3 text-xs font-mono max-w-md w-full mx-auto max-h-32 overflow-y-auto">
                    {statusData.logs}
                  </div>
                )}
              </div>
            ) : previewUrl ? (
              <iframe 
                src={previewUrl} 
                className="w-full h-full border-none bg-white" 
                title="Live Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-zinc-500 text-sm">App is active but no preview URL available.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
