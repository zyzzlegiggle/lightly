"use client";

import { useSearchParams, useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChangesPanel, PendingChange } from "@/components/ChangesPanel";

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const [projects, setProjects] = useState<any[]>([]);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(searchParams.get("preview") || null);
  const [statusData, setStatusData] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [currentPath, setCurrentPath] = useState("/");
  const [pathInput, setPathInput] = useState("/");
  const [iframeStatus, setIframeStatus] = useState<"loading" | "ready" | "error">("loading");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Pending changes state ──
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  const phase = statusData?.phase || "BUILDING";

  // Full iframe src = base URL + current path
  const iframeSrc = previewUrl ? `${previewUrl.replace(/\/$/, "")}${currentPath}` : null;

  // ── Polling ──
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/status`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!active) return;
        setStatusData(data);
        if (data.liveUrl) {
          setPreviewUrl(data.liveUrl);
        }
        // Keep polling: fast while building, slow once active (to recover from crashes)
        const interval = data.phase === "ACTIVE" ? 30000 : 4000;
        if (active) setTimeout(poll, interval);
      } catch {
        if (active) setTimeout(poll, 5000);
      }
    };
    if (projectId) poll();
    return () => { active = false; };
  }, [projectId]);

  // ── Fetch projects list ──
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
        }
      } catch (err) {
        console.error("Failed to fetch projects list", err);
      }
    };
    fetchProjects();
  }, []);

  // ── Periodic health check via backend proxy (avoids CORS issues) ──
  useEffect(() => {
    if (!previewUrl || phase !== "ACTIVE") return;
    let active = true;

    const check = async () => {
      try {
        // Use the status endpoint as a health proxy — it checks :8080/health on the Droplet
        const res = await fetch(`/api/projects/${projectId}/status`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (active) {
          if (data.phase === "ACTIVE") {
            setPreviewError(null);
            setIframeStatus("ready");
          } else {
            setPreviewError("Preview app may be restarting...");
            setIframeStatus("error");
          }
        }
      } catch {
        if (active) {
          setPreviewError("Preview app may be experiencing issues");
          setIframeStatus("error");
        }
      }
      if (active) setTimeout(check, 20000);
    };

    const t = setTimeout(check, 5000);
    return () => { active = false; clearTimeout(t); };
  }, [previewUrl, phase]);

  // Navigate to a path in the iframe
  const navigateToPath = useCallback((path: string) => {
    const p = path.startsWith("/") ? path : `/${path}`;
    setCurrentPath(p);
    setPathInput(p);
    setIframeKey((k) => k + 1);
    setIframeStatus("loading");
  }, []);

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateToPath(pathInput);
  };

  // Called when agent syncs files to Droplet — instant hot-reload
  const handleDeployTriggered = useCallback(() => {
    setIframeStatus("loading");
    setTimeout(() => {
      setIframeKey((k) => k + 1);
      setIframeStatus("ready");
    }, 1500);
  }, []);

  // ── Changes management ──

  const handleChangesProposed = useCallback((newChanges: any[]) => {
    const mapped: PendingChange[] = newChanges.map((ch: any, i: number) => ({
      id: `change-${Date.now()}-${i}`,
      file: ch.file,
      content: ch.content,
      originalContent: ch.originalContent,
      description: ch.description || `Updated ${ch.file.split("/").pop()}`,
      timestamp: Date.now(),
    }));
    setPendingChanges((prev) => [...prev, ...mapped]);
  }, []);

  const handleDiscardChange = useCallback(async (changeId: string) => {
    const change = pendingChanges.find((c) => c.id === changeId);
    if (!change) return;

    // If we have original content, revert on the Droplet
    if (change.originalContent) {
      setIsReverting(true);
      try {
        await fetch(`/api/projects/${projectId}/revert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changes: [{ file: change.file, content: change.originalContent }],
          }),
        });
        // Refresh iframe to show reverted preview
        setIframeKey((k) => k + 1);
      } catch (err) {
        console.error("Failed to revert:", err);
      }
      setIsReverting(false);
    }

    setPendingChanges((prev) => prev.filter((c) => c.id !== changeId));
  }, [pendingChanges, projectId]);

  const handleDiscardAll = useCallback(async () => {
    // Revert all changes with original content
    const revertable = pendingChanges.filter((c) => c.originalContent);
    if (revertable.length > 0) {
      setIsReverting(true);
      try {
        await fetch(`/api/projects/${projectId}/revert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changes: revertable.map((c) => ({ file: c.file, content: c.originalContent })),
          }),
        });
        setIframeKey((k) => k + 1);
      } catch (err) {
        console.error("Failed to revert all:", err);
      }
      setIsReverting(false);
    }

    setPendingChanges([]);
  }, [pendingChanges, projectId]);

  const handleConfirmAll = useCallback(async () => {
    if (pendingChanges.length === 0) return;
    setIsConfirming(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: pendingChanges.map((c) => ({
            file: c.file,
            content: c.content,
          })),
          message: `Applied ${pendingChanges.length} design change${pendingChanges.length > 1 ? "s" : ""}`,
        }),
      });

      if (!res.ok) throw new Error("Failed to publish");

      setPendingChanges([]);
    } catch (err: any) {
      alert("Failed to publish changes: " + err.message);
    } finally {
      setIsConfirming(false);
    }
  }, [pendingChanges, projectId]);

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-100 font-sans">
      {/* Top nav */}
      <div className="h-12 bg-white border-b border-zinc-200 flex items-center px-4 gap-3 shrink-0 z-10">
        <Link href="/" className="flex items-center group/logo transition-all">
          <img src="/logo.png" alt="Lightly" className="h-6 object-contain transform group-hover/logo:scale-105 transition-transform" />
        </Link>
        <div className="w-px h-5 bg-zinc-200" />
        <div className="relative group/switcher">
          <button
            onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 transition-all cursor-pointer text-sm"
          >
            <span className="text-zinc-700 max-w-[150px] truncate">
              {statusData?.projectName || projects.find(p => p.id === projectId)?.githubUrl.split("/").pop()?.replace(".git", "") || "Loading..."}
            </span>
            <svg className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isSwitcherOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isSwitcherOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setIsSwitcherOpen(false)} />
              <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-zinc-200 rounded-xl shadow-xl z-30 py-2 overflow-hidden animate-in fade-in zoom-in duration-150">
                <div className="px-3 py-1.5 mb-1 border-b border-zinc-100">
                  <span className="text-xs text-zinc-400">Projects</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        router.push(`/project/${p.id}`);
                        setIsSwitcherOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors flex flex-col ${p.id === projectId
                          ? 'bg-zinc-50 text-accent-primary font-medium'
                          : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                        }`}
                    >
                      <span className="truncate">{p.githubUrl.split("/").pop()?.replace(".git", "")}</span>
                      <span className="text-[10px] text-zinc-400 truncate">{p.githubUrl.replace("https://github.com/", "")}</span>
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <div className="px-3 py-2 text-sm text-zinc-400 italic">No other projects found</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main layout: sidebar + preview */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Chat sidebar — now passes changes up */}
        <ChatSidebar
          projectId={projectId}
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          onDeployTriggered={handleDeployTriggered}
          onChangesProposed={handleChangesProposed}
          currentPage={currentPath}
        />

        {/* Changes panel — floating top-right */}
        <ChangesPanel
          changes={pendingChanges}
          onDiscard={handleDiscardChange}
          onDiscardAll={handleDiscardAll}
          onConfirmAll={handleConfirmAll}
          isConfirming={isConfirming}
          isReverting={isReverting}
        />

        {/* Browser preview */}
        <div className="flex-1 overflow-hidden p-3 flex flex-col gap-0">
          <div className="w-full h-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col">
            {/* Browser chrome */}
            <div className="h-10 bg-zinc-50 border-b border-zinc-200 flex items-center px-3 gap-3 shrink-0">
              {/* Dots */}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-zinc-300 hover:bg-red-400 transition-colors" />
                <div className="w-3 h-3 rounded-full bg-zinc-300 hover:bg-yellow-400 transition-colors" />
                <div className="w-3 h-3 rounded-full bg-zinc-300 hover:bg-green-400 transition-colors" />
              </div>

              {/* Nav arrows */}
              <div className="flex items-center gap-0.5 text-zinc-400">
                <button
                  className="p-1 hover:bg-zinc-200 rounded transition-colors disabled:opacity-30"
                  disabled={currentPath === "/"}
                  onClick={() => navigateToPath("/")}
                  title="Go home"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" /></svg>
                </button>
                <button
                  className="p-1 hover:bg-zinc-200 rounded transition-colors"
                  onClick={() => { setIframeKey((k) => k + 1); setIframeStatus("loading"); }}
                  title="Refresh"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>

              {/* URL bar */}
              <form onSubmit={handlePathSubmit} className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg px-3 py-1 min-w-[200px] max-w-md w-full shadow-inner focus-within:border-zinc-400 focus-within:ring-1 focus-within:ring-zinc-300 transition-all">
                  {phase === "ACTIVE" && previewUrl ? (
                    <>
                      <svg className="w-3 h-3 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      <input
                        type="text"
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        onBlur={() => navigateToPath(pathInput)}
                        className="flex-1 text-xs text-zinc-600 font-mono bg-transparent outline-none min-w-0"
                        spellCheck={false}
                      />
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
              </form>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {phase === "ACTIVE" && previewUrl && (
                  <>
                    <button onClick={() => navigator.clipboard.writeText(`${previewUrl}${currentPath}`)} className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors" title="Copy URL">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    <a href={`${previewUrl}${currentPath}`} target="_blank" rel="noreferrer" className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors" title="Open in new tab">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Iframe area */}
            <div className="flex-1 overflow-hidden relative bg-white">
              {phase !== "ACTIVE" && !previewUrl ? (
                /* ── Setup / building screen ── */
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-50/50">
                  <div className="relative mb-6">
                    <div className="w-16 h-16 border-[3px] border-zinc-200 rounded-full" />
                    <div className="w-16 h-16 border-[3px] border-accent-primary border-t-transparent rounded-full animate-spin absolute inset-0" />
                  </div>
                  <h2 className="text-xl font-bold text-zinc-800 mb-1.5">Setting up your sandbox...</h2>
                  <p className="text-zinc-500 text-sm max-w-sm text-center">
                    {statusData?.logs || "Creating Droplet, cloning repo, installing dependencies..."}
                  </p>
                </div>
              ) : iframeSrc ? (
                <>
                  <iframe
                    ref={iframeRef}
                    key={iframeKey}
                    src={iframeSrc}
                    className="w-full h-full border-none bg-white"
                    title="Live Preview"
                    onLoad={() => setIframeStatus("ready")}
                    onError={() => { setIframeStatus("error"); setPreviewError("Failed to load preview"); }}
                  />

                  {/* Loading indicator */}
                  {iframeStatus === "loading" && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-zinc-200 overflow-hidden">
                      <div className="h-full bg-accent-primary animate-pulse w-full" style={{ animation: "loading-bar 1.5s ease-in-out infinite" }} />
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-zinc-500 text-sm">Waiting for preview URL...</p>
                </div>
              )}

              {/* ── Error / status bar ── */}
              {phase === "ACTIVE" && previewError && (
                <div className="absolute bottom-0 left-0 right-0 bg-amber-50 border-t border-amber-200 px-4 py-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-xs text-amber-700 font-medium">{previewError}</span>
                  <button
                    onClick={() => { setPreviewError(null); setIframeKey((k) => k + 1); setIframeStatus("loading"); }}
                    className="ml-auto text-xs text-amber-600 hover:text-amber-800 font-medium underline"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
