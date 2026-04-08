"use client";

import { useSearchParams, useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChangesPanel, PendingChange } from "@/components/ChangesPanel";
import { WorkspaceRail, WorkspaceTab } from "@/components/WorkspaceRail";
import { NotionPanel } from "@/components/workspace/NotionPanel";
import { CalendarPanel } from "@/components/workspace/CalendarPanel";
import { GmailPanel } from "@/components/workspace/GmailPanel";
import { SlackPanel } from "@/components/workspace/SlackPanel";
import { LinearPanel } from "@/components/workspace/LinearPanel";

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const [projects, setProjects] = useState<any[]>([]);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(searchParams.get("preview") || null);
  const [statusData, setStatusData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab | null>("chat");
  const [iframeKey, setIframeKey] = useState(0);
  const [currentPath, setCurrentPath] = useState("/");
  const [pathInput, setPathInput] = useState("/");
  const [isInitializing, setIsInitializing] = useState(true);
  const [iframeStatus, setIframeStatus] = useState<"loading" | "ready" | "error">("loading");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Sync active tab with URL ──
  useEffect(() => {
    const tab = searchParams.get("tab") as WorkspaceTab;
    if (tab && ["chat", "logic", "gmail", "calendar", "slack", "linear", "notion", "notes"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // ── Pending changes state ──
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [isChangesOpen, setIsChangesOpen] = useState(false);

  const phase = statusData?.phase || "BUILDING";

  // ── Compute the Direct Preview URL ──
  // Reverted to direct IP access for localhost stability. Note: This will be blocked by browsers on HTTPS (Vercel/Ngrok).
  const iframeSrc = previewUrl 
    ? (previewUrl.endsWith("/") ? previewUrl : `${previewUrl}/`) + currentPath.replace(/^\//, "")
    : null;

  // Toggle tab — clicking the active tab collapses the panel
  const handleTabChange = useCallback((tab: WorkspaceTab) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  }, []);

  // ── Polling ──
  useEffect(() => {
    let active = true;
    let firstFetchDone = false;
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
        if (!firstFetchDone) {
          firstFetchDone = true;
          // Small delay for smooth transition
          setTimeout(() => setIsInitializing(false), 800);
        }
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

  // ── Persistence: Load pending changes ──
  useEffect(() => {
    const fetchChanges = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/changes`);
        if (res.ok) {
          const data = await res.json();
          setPendingChanges(data.changes || []);
        }
      } catch (err) {
        console.error("Failed to fetch pending changes", err);
      }
    };
    if (projectId) fetchChanges();
  }, [projectId]);

  // ── Persistence: Save pending changes ──
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const saveChanges = async () => {
      try {
        await fetch(`/api/projects/${projectId}/changes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: pendingChanges }),
        });
      } catch (err) {
        console.error("Failed to save pending changes", err);
      }
    };
    const t = setTimeout(saveChanges, 1000);
    return () => clearTimeout(t);
  }, [pendingChanges, projectId]);

  // ── Periodic health check ──
  useEffect(() => {
    if (!previewUrl || phase !== "ACTIVE") return;
    let active = true;

    const check = async () => {
      try {
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

  const handleDeployTriggered = useCallback(() => {
    setIframeStatus("loading");
    setTimeout(() => {
      setIframeKey((k) => k + 1);
      setIframeStatus("ready");
    }, 1500);
  }, []);

  // ── Sync/Refresh state ──
  const [refreshKey, setRefreshKey] = useState(0);
  const handleActionSuccess = useCallback(() => {
    setRefreshKey(prev => prev + 1);
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
    if (change.originalContent) {
      setIsReverting(true);
      try {
        await fetch(`/api/projects/${projectId}/revert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: [{ file: change.file, content: change.originalContent }] }),
        });
        setIframeKey((k) => k + 1);
      } catch (err) {
        console.error("Failed to revert:", err);
      }
      setIsReverting(false);
    }
    setPendingChanges((prev) => prev.filter((c) => c.id !== changeId));
  }, [pendingChanges, projectId]);

  const handleDiscardAll = useCallback(async () => {
    const revertable = pendingChanges.filter((c) => c.originalContent);
    if (revertable.length > 0) {
      setIsReverting(true);
      try {
        await fetch(`/api/projects/${projectId}/revert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: revertable.map((c) => ({ file: c.file, content: c.originalContent })) }),
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
          changes: pendingChanges.map((c) => ({ file: c.file, content: c.content })),
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

  if (isInitializing) {
    return (
      <div className="fixed inset-0 z-[1000] bg-white flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
        <div className="max-w-md w-full flex flex-col items-center">
          <div className="relative mb-8 group">
            <div className="absolute inset-0 bg-accent-primary/10 rounded-3xl blur-2xl group-hover:bg-accent-primary/20 transition-all opacity-0 animate-in fade-in zoom-in delay-300 duration-1000 fill-mode-forwards" />
            <img src="/logo.png" alt="Lightly" className="h-16 relative z-10 animate-pulse-subtle shadow-[0_0_40px_-10px_rgba(0,0,0,0.1)] rounded-2xl" />
          </div>
          
          <div className="space-y-4 w-full text-center">
            <h1 className="text-2xl font-serif tracking-tight italic text-zinc-900">
              Opening <span className="font-sans font-bold not-italic">{statusData?.projectName || "your project"}...</span>
            </h1>
            <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden shadow-inner max-w-xs mx-auto">
              <div className="h-full bg-accent-primary animate-[loading-bar_1.5s_infinite]" />
            </div>
            <p className="text-zinc-500 text-sm font-medium animate-pulse">Initializing workspace</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-100 font-sans">
      {/* ── Top nav ── */}
      <div className="h-12 bg-white border-b border-zinc-200 flex items-center px-4 gap-3 shrink-0 z-10">
        <Link href="/" className="flex items-center group/logo transition-all">
          <img src="/logo.png" alt="Lightly" className="h-6 object-contain transform group-hover/logo:scale-105 transition-transform" />
        </Link>
        <div className="w-px h-5 bg-zinc-200" />

        {/* Project switcher */}
        <div className="relative group/switcher">
          <button
            onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 transition-all cursor-pointer text-sm"
          >
            <span className="text-zinc-700 max-w-[150px] truncate">
              {statusData?.projectName || projects.find(p => p.id === projectId)?.githubUrl.split("/").pop()?.replace(".git", "") || "Loading..."}
            </span>
            <svg className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isSwitcherOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      onClick={() => { router.push(`/project/${p.id}`); setIsSwitcherOpen(false); setIsInitializing(true); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors flex flex-col ${p.id === projectId ? "bg-zinc-50 text-accent-primary font-medium" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
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

        {/* Push Changes Dropdown */}
        <div className="ml-auto relative">
          <button
            onClick={() => setIsChangesOpen(!isChangesOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-sm font-semibold ${pendingChanges.length > 0
                ? "bg-zinc-950 text-white border-zinc-900 shadow-md transform hover:scale-105 active:scale-95"
                : "bg-white text-zinc-400 border-zinc-200 cursor-default opacity-60"
              }`}
          >
            <div className="relative">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              {pendingChanges.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-zinc-950">
                  {pendingChanges.length}
                </span>
              )}
            </div>
            <span>Push Changes</span>
          </button>

          {isChangesOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setIsChangesOpen(false)} />
              <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-zinc-200 rounded-2xl shadow-2xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <ChangesPanel
                  changes={pendingChanges}
                  onDiscard={handleDiscardChange}
                  onDiscardAll={handleDiscardAll}
                  onConfirmAll={async () => {
                    await handleConfirmAll();
                    setIsChangesOpen(false);
                  }}
                  isConfirming={isConfirming}
                  isReverting={isReverting}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Workspace rail — always visible */}
        <WorkspaceRail activeTab={activeTab} onTabChange={handleTabChange} />

        {/* ── Active workspace panel ── */}
        <div className={activeTab === "chat" ? "block" : "hidden"}>
          <ChatSidebar
            projectId={projectId}
            isCollapsed={false}
            onToggle={() => setActiveTab(null)}
            onDeployTriggered={handleDeployTriggered}
            onChangesProposed={handleChangesProposed}
            onActionSuccess={handleActionSuccess}
            onTabChange={handleTabChange}
            currentPage={currentPath}
            activeTab={activeTab || "chat"}
          />
        </div>
        
        <div className={activeTab === "gmail" ? "block" : "hidden"}>
          <GmailPanel projectId={projectId} refreshKey={refreshKey} />
        </div>
        
        <div className={activeTab === "calendar" ? "block" : "hidden"}>
          <CalendarPanel projectId={projectId} refreshKey={refreshKey} />
        </div>

        <div className={activeTab === "slack" ? "block" : "hidden"}>
          <SlackPanel projectId={projectId} refreshKey={refreshKey} />
        </div>

        <div className={activeTab === "linear" ? "block" : "hidden"}>
          <LinearPanel projectId={projectId} refreshKey={refreshKey} />
        </div>

        <div className={activeTab === "notion" ? "block" : "hidden"}>
          <NotionPanel projectId={projectId} refreshKey={refreshKey} />
        </div>

        {/* ── Browser preview ── */}
        <div className="flex-1 overflow-hidden p-3 flex flex-col gap-0">
          <div className="w-full h-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col">
            {/* Browser chrome */}
            <div className="h-10 bg-zinc-50 border-b border-zinc-200 flex items-center px-3 gap-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-zinc-300 hover:bg-red-400 transition-colors" />
                <div className="w-3 h-3 rounded-full bg-zinc-300 hover:bg-yellow-400 transition-colors" />
                <div className="w-3 h-3 rounded-full bg-zinc-300 hover:bg-green-400 transition-colors" />
              </div>
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
                  onClick={() => { setIframeKey(k => k + 1); setIframeStatus("loading"); }}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors border border-transparent active:border-zinc-300"
                  title="Refresh Preview"
                  disabled={phase !== "ACTIVE" || !previewUrl}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>
              <form onSubmit={handlePathSubmit} className="flex-1 flex items-center justify-center">
                <div className={`flex items-center gap-1.5 bg-zinc-50 border ${iframeStatus === "ready" ? "border-zinc-200" : "border-amber-200"} rounded-lg px-3 py-1 min-w-[240px] max-w-lg w-full shadow-inner focus-within:bg-white focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-100 transition-all`}>
                  {phase === "ACTIVE" && previewUrl ? (
                    <>
                      {previewUrl.startsWith("https") ? (
                        <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest hidden sm:inline">{previewUrl.split('://')[1].split('.')[0]}</span>
                      <div className="w-[1px] h-3 bg-zinc-200 mx-0.5 hidden sm:block" />
                      <input
                        type="text"
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        onBlur={() => navigateToPath(pathInput)}
                        className="flex-1 text-xs text-zinc-700 font-mono bg-transparent outline-none min-w-0"
                        spellCheck={false}
                        placeholder="/"
                      />
                      {iframeStatus === "ready" && (
                        <div className="flex items-center gap-1 ml-1 scale-90">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin shrink-0" />
                      <span className="text-xs text-zinc-400 italic">Initializing...</span>
                    </>
                  )}
                </div>
              </form>
              <div className="flex items-center gap-1">
                {phase === "ACTIVE" && previewUrl && (
                  <>
                    <button
                      onClick={() => {
                        const fullUrl = (previewUrl?.endsWith("/") ? previewUrl : `${previewUrl}/`) + currentPath.replace(/^\//, "");
                        navigator.clipboard.writeText(fullUrl);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors"
                      title="Copy URL"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    <a
                      href={(previewUrl?.endsWith("/") ? previewUrl : `${previewUrl}/`) + currentPath.replace(/^\//, "")}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors"
                      title="Open in new tab"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Iframe area */}
            <div className="flex-1 overflow-hidden relative bg-white">
              {/* Main Iframe - rendered as soon as URL is available */}
              {iframeSrc ? (
                <iframe
                  ref={iframeRef}
                  key={iframeKey}
                  src={iframeSrc}
                  className={`w-full h-full border-none bg-white font-sans transition-opacity duration-700 ${iframeStatus === "ready" ? "opacity-100" : "opacity-0"}`}
                  title="Live Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
                  allow="clipboard-read; clipboard-write; camera; microphone; geolocation; fullscreen"
                  referrerPolicy="no-referrer-when-downgrade"
                  onLoad={() => setIframeStatus("ready")}
                  onError={() => { setIframeStatus("error"); setPreviewError("Failed to load preview"); }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-zinc-500 text-sm">Waiting for preview URL...</p>
                </div>
              )}

              {/* Seamless Loading Overlay */}
              {(phase !== "ACTIVE" || iframeStatus === "loading") && iframeSrc && (
                <div className={`absolute inset-0 flex flex-col items-center justify-center bg-white z-20 transition-all duration-700 ${iframeStatus === "ready" ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
                  <div className="relative mb-8">
                    <div className="w-16 h-16 border-[3px] border-zinc-100 rounded-full" />
                    <div className="w-16 h-16 border-[3px] border-zinc-950 border-t-transparent rounded-full animate-spin absolute inset-0" />
                  </div>
                  <h2 className="text-xl font-bold text-zinc-900 mb-2">
                    {phase === "ACTIVE" ? "Launching project..." : "Setting up your sandbox..."}
                  </h2>
                  <div className="max-w-sm w-full space-y-4 px-6 text-center">
                    <p className="text-zinc-500 text-sm font-medium animate-pulse">
                      {statusData?.logs || "Initializing development environment..."}
                    </p>
                    <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden shadow-inner">
                      <div className="h-full bg-zinc-900 animate-[loading-bar_1.5s_infinite]" />
                    </div>
                  </div>
                </div>
              )}

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
