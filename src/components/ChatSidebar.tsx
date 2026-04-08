"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────

interface ChatAction {
  label: string;
  url?: string;
  icon?: "calendar" | "email" | "external" | "notion" | "linear" | "slack";
  tab?: string;
  confirmAction?: string;
  params?: any;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  changesDescription?: string[];
  actions?: ChatAction[];
  timestamp: number;
  attachments?: UploadedFile[];
  isSilent?: boolean;
}

interface UploadedFile {
  url: string;
  backendUrl: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
}

interface ChatSidebarProps {
  projectId: string;
  isCollapsed: boolean;
  onToggle: () => void;
  onDeployTriggered?: () => void;
  onChangesProposed?: (changes: any[]) => void;
  onActionSuccess?: () => void;
  onTabChange?: (tab: any) => void;
  currentPage?: string;
}

// ── localStorage helpers ───────────────────────────────────────────────

const STORAGE_KEY = (id: string) => `lightly-chat-${id}`;

function loadMessages(projectId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(projectId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(projectId: string, msgs: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(msgs));
  } catch { /* storage full */ }
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

function formatContent(content: string) {
  if (!content) return null;

  // Regex to match:
  // 1. **Bold**
  // 2. [notion:Title|URL]
  // 3. [linear:Title|URL]
  const regex = /(\*\*.*?\*\*)|(\[(notion|linear):([^|\]]+)\|([^\]]+)\])/g;
  const parts = content.split(regex);

  // Split results in many null/undefined parts due to groups, filter them
  const result: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === undefined || part === null || part === "") continue;

    // Check if it's a bold match (e.g. "**text**")
    if (part.startsWith("**") && part.endsWith("**")) {
      result.push(<strong key={i} className="font-bold text-zinc-900">{part.slice(2, -2)}</strong>);
      continue;
    }

    // Check if next parts are the capture groups for a mention
    // regex groups: [full, bold, full_mention, service, title, url]
    // Due to how split works with multiple groups:
    // parts[i] = full match
    // parts[i+1] = bold group (if matched)
    // parts[i+2] = full mention group (if matched)
    // parts[i+3] = service (if matched)
    // parts[i+4] = title (if matched)
    // parts[i+5] = url (if matched)

    if (part.startsWith("[") && (part.includes("notion:") || part.includes("linear:"))) {
      const service = parts[i + 3];
      const title = parts[i + 4];
      const url = parts[i + 5];

      if (service && title && url) {
        result.push(
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold mx-0.5 transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95 border ${service === "notion"
                ? "bg-zinc-100/80 text-zinc-800 border-zinc-200 hover:bg-zinc-100"
                : "bg-indigo-50/80 text-indigo-700 border-indigo-100 hover:bg-indigo-100/90"
              }`}
          >
            {service === "notion" ? (
              <div className="w-3.5 h-3.5 bg-white rounded-md flex items-center justify-center shadow-sm">
                <svg className="w-2.5 h-2.5 text-zinc-900" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4.459 4.208c.739.062 1.346.335 1.83 1.054l13.064 1.705V19.78c-1.125-.45-2.156-.632-3.111-.53l-11.834-1.288c-.689-.061-1.218-.363-1.583-1.026V5.378c.365.176.924.312 1.634.33V4.208zm1.63 1.332v12.01c0 .248.163.502.483.61l10.97 1.155c.346 0 .54-.254.54-.502V7.12L6.152 5.66c-.033-.03-.06-.062-.063-.12zm2.083 2.502h2.247v5.69l3.073-5.69h2.518l-3.332 6.002 3.655 6.002H14.19l-3.398-5.69v5.69H8.172V8.042z" />
                </svg>
              </div>
            ) : (
              <div className="w-3.5 h-3.5 bg-white rounded-md flex items-center justify-center shadow-sm">
                <svg className="w-2.5 h-2.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 17h14v-2l-1-7V5a2 2 0 0 1 2-2H4a2 2 0 0 1 2 2v3l-1 7v2z" />
                </svg>
              </div>
            )}
            {title}
          </a>
        );
        i += 5; // Skip the groups
        continue;
      }
    }

    // Regular text (if not bold or mention)
    if (!parts[i - 1]?.startsWith("[") && !parts[i - 1]?.startsWith("**")) {
      result.push(part);
    }
  }

  return result;
}

// ── Component ──────────────────────────────────────────────────────────

export function ChatSidebar({
  projectId,
  isCollapsed,
  onToggle,
  onDeployTriggered,
  onChangesProposed,
  onActionSuccess,
  onTabChange,
  currentPage = "/"
}: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmedActionIds, setConfirmedActionIds] = useState<Set<string>>(new Set());
  const [actionSuccessUrls, setActionSuccessUrls] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load messages from localStorage on mount
  useEffect(() => {
    const saved = loadMessages(projectId);
    if (saved.length > 0) setMessages(saved);
  }, [projectId]);

  // Save to localStorage on every message change
  useEffect(() => {
    if (messages.length > 0) saveMessages(projectId, messages);
  }, [messages, projectId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const getHistory = () =>
    messages
      .filter((m) => m.role !== "status")
      .slice(-6)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

  // ── File Upload ──

  const uploadFile = async (file: File): Promise<UploadedFile | null> => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        console.error("Upload failed:", err);
        return null;
      }

      return await res.json();
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    }
  };

  const handleFileSelect = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploading(true);

    const uploaded: UploadedFile[] = [];
    for (const file of fileArray) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} is too large. Max 10MB.`);
        continue;
      }

      const result = await uploadFile(file);
      if (result) {
        uploaded.push(result);
      }
    }

    if (uploaded.length > 0) {
      setPendingFiles((prev) => [...prev, ...uploaded]);
    }

    setIsUploading(false);
  };

  const removePendingFile = (filename: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.filename !== filename));
  };

  // ── Drag and Drop ──

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleFileSelect(files);
    }
  };

  // ── Paste images ──

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      await handleFileSelect(imageFiles);
    }
  };

  // ── Send message ──

  const sendMessage = async (overrideText?: string, silent = false) => {
    const text = (overrideText || input).trim();
    if ((!text && pendingFiles.length === 0) || isLoading) return;

    const attachments = [...pendingFiles];
    const displayText = text || (attachments.length > 0 ? `Uploaded ${attachments.length} file(s) for reference` : "");

    if (!silent) {
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: displayText,
        timestamp: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      setMessages((p) => [...p, userMsg]);
    }
    setInput("");
    setPendingFiles([]);
    setIsLoading(true);

    const assistantId = `a-${Date.now()}`;
    let assistantContent = "";

    setMessages((p) => [...p, { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), isSilent: silent }]);

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: displayText,
          history: getHistory(),
          currentPage,
          attachments: attachments.map((a) => ({
            url: a.backendUrl || a.url,
            originalName: a.originalName,
            contentType: a.contentType,
            size: a.size,
          })),
        }),
      });

      if (!res.ok) throw new Error("Chat failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;

          try {
            const evt = JSON.parse(raw);

            if (evt.type === "status") {
              setMessages((p) => {
                const last = p[p.length - 1];
                if (last?.role === "status") {
                  return [...p.slice(0, -1), { ...last, content: evt.content }];
                }
                return [...p, { id: `s-${Date.now()}`, role: "status", content: evt.content, timestamp: Date.now() }];
              });
            } else if (evt.type === "message") {
              assistantContent = evt.content;
              const actions = evt.actions;
              setMessages((p) => p.map((m) => (m.id === assistantId ? { ...m, content: assistantContent, actions: actions || m.actions } : m)));
            } else if (evt.type === "files_changed") {
              // files_changed now has designer-friendly descriptions, not file paths
              setMessages((p) => p.map((m) => (m.id === assistantId ? { ...m, changesDescription: evt.files } : m)));
            } else if (evt.type === "proposed_changes") {
              // Pass changes up to parent for the ChangesPanel
              onChangesProposed?.(evt.changes || []);
              onDeployTriggered?.(); // Preview already synced
              onActionSuccess?.();
            } else if (evt.type === "action_success") {
              setActionSuccessUrls((p: Record<string, string>) => ({ ...p, [evt.id]: evt.url }));
              onActionSuccess?.();
            } else if (evt.type === "done") {
              setMessages((p) => p.filter((m) => 
                m.role !== "status" && 
                !(m.id === assistantId && m.isSilent && !m.content && !m.changesDescription && (!m.actions || m.actions.length === 0))
              ));
            }
          } catch {
            /* skip malformed */
          }
        }
      }
    } catch (err: any) {
      setMessages((p) =>
        p.map((m) => (m.id === assistantId ? { ...m, content: "Something went wrong. Please try again." } : m))
      );
    } finally {
      setIsLoading(false);
    }
  };



  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Collapsed state ──

  if (isCollapsed) {
    return (
      <button
        onClick={onToggle}
        className="fixed top-16 left-3 z-30 w-10 h-10 bg-white border border-zinc-200 rounded-xl shadow-md hover:shadow-lg hover:bg-zinc-50 transition-all flex items-center justify-center group"
      >
        <svg className="w-4 h-4 text-zinc-500 group-hover:text-zinc-800 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className={`w-[380px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0 relative transition-all ${isDragOver ? "ring-2 ring-zinc-400 ring-inset" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Drag overlay ── */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-zinc-50/90 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none rounded-r-xl">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center mb-4 shadow-lg animate-bounce">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-zinc-800 mb-1">Drop files here</h3>
          <p className="text-sm text-zinc-500">Images, mockups, screenshots — up to 10MB</p>
        </div>
      )}

      {/* ── Header ── */}
      <div className="h-12 border-b border-zinc-100 flex items-center justify-end px-4 shrink-0">

        <div className="flex items-center gap-1">

          <button onClick={onToggle} className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-800 text-[15px] mb-1">What would you like to change?</h3>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-[240px]">
              Describe what you want to build or modify.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {messages.map((msg) => {
              if (msg.role === "assistant" && msg.isSilent && !msg.content && !msg.changesDescription && (!msg.actions || msg.actions.length === 0)) {
                return null;
              }
              return (
                <div key={msg.id}>
                {/* ── Status ── */}
                {msg.role === "status" ? (
                  <div className="flex items-center gap-2 justify-center py-2">
                    <div className="w-3 h-3 border-2 border-zinc-800 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-zinc-500">{msg.content}</span>
                  </div>
                ) : msg.role === "user" ? (
                  /* ── User message ── */
                  <div className="flex justify-end">
                    <div className="max-w-[85%] space-y-2">
                      {/* Attachment thumbnails */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {msg.attachments.map((att) => (
                            <div key={att.filename} className="group relative">
                              {isImageType(att.contentType) ? (
                                <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/20 shadow-sm">
                                  <img src={att.url} alt={att.originalName} className="w-full h-full object-cover" />
                                </div>
                              ) : (
                                <div className="h-16 px-3 rounded-lg bg-white/10 border border-white/20 flex items-center gap-2">
                                  <svg className="w-4 h-4 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="text-[10px] text-zinc-200 font-medium truncate max-w-[80px]">{att.originalName}</span>
                                </div>
                              )}
                              <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-10">
                                <div className="bg-zinc-900 text-white text-[10px] px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
                                  {att.originalName} · {formatFileSize(att.size)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="bg-gradient-to-br from-zinc-800 to-zinc-950 text-white rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Assistant message ── */
                  <div className="flex justify-start">
                    <div className="space-y-2 max-w-[90%]">
                      {/* Message bubble */}
                      <div className="bg-zinc-50 border border-zinc-100 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] text-zinc-700 leading-relaxed whitespace-pre-wrap shadow-sm">
                        {msg.content ? (
                          <>
                            {formatContent(msg.content)}
                            {/* ── Action Buttons INSIDE bubble ── */}
                            {msg.actions && msg.actions.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-200/50">
                                {msg.actions.map((action, i) => {
                                  const actionId = `${msg.id}-${i}`;
                                  const successUrl = actionSuccessUrls[actionId];
                                  const isConfirmed = confirmedActionIds.has(actionId);

                                  const getSuccessLabel = (label: string) => {
                                    const low = label.toLowerCase();
                                    if (low.includes("slack") || low.includes("send")) return "Open Slack";
                                    if (low.includes("notion") || low.includes("note") || low.includes("add")) return "Open Notion";
                                    if (low.includes("linear") || low.includes("issue") || low.includes("create")) return "Open Linear";
                                    return "Open in Service";
                                  };

                                  return (
                                    <div key={i} className="flex items-center gap-2">
                                      <button
                                        key={i}
                                        onClick={(e) => {
                                          if (successUrl) {
                                            e.preventDefault();
                                            if (action.tab && onTabChange) {
                                              onTabChange(action.tab);
                                            } else {
                                              window.open(successUrl, "_blank");
                                            }
                                          } else if (!isConfirmed && action.confirmAction) {
                                            e.preventDefault();
                                            setConfirmedActionIds(prev => new Set(prev).add(actionId));
                                            const confirmMsg = `Confirmed: ${action.confirmAction} ${JSON.stringify({ ...action.params, actionId })}`;
                                            sendMessage(confirmMsg, true);
                                          } else if (action.tab && onTabChange) {
                                            e.preventDefault();
                                            onTabChange(action.tab);
                                          } else if (action.url) {
                                            window.open(action.url, "_blank");
                                          }
                                        }}
                                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all shadow-sm group text-left text-[11px] font-bold border ${successUrl
                                            ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                            : isConfirmed
                                              ? "bg-zinc-50 border-zinc-100 text-zinc-400 cursor-wait"
                                              : "bg-white border-zinc-200 hover:border-zinc-800 hover:bg-zinc-100 text-zinc-700"
                                          }`}
                                      >
                                        {successUrl ? (
                                          <span className="flex items-center gap-1.5 animate-in fade-in zoom-in duration-300">
                                            {getSuccessLabel(action.label)}
                                          </span>
                                        ) : isConfirmed ? (
                                          <span className="flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                                            Processing...
                                          </span>
                                        ) : (
                                          <>
                                            {action.icon === "calendar" && (
                                              <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                              </svg>
                                            )}
                                            {action.icon === "email" && (
                                              <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                              </svg>
                                            )}
                                            {action.icon === "notion" && (
                                              <svg className="w-3.5 h-3.5 text-zinc-800" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M4.459 4.208c.739.062 1.346.335 1.83 1.054l13.064 1.705V19.78c-1.125-.45-2.156-.632-3.111-.53l-11.834-1.288c-.689-.061-1.218-.363-1.583-1.026V5.378c.365.176.924.312 1.634.33V4.208zm1.63 1.332v12.01c0 .248.163.502.483.61l10.97 1.155c.346 0 .54-.254.54-.502V7.12L6.152 5.66c-.033-.03-.06-.062-.063-.12zm2.083 2.502h2.247v5.69l3.073-5.69h2.518l-3.332 6.002 3.655 6.002H14.19l-3.398-5.69v5.69H8.172V8.042z" />
                                              </svg>
                                            )}
                                            {action.icon === "linear" && (
                                              <svg className="w-3.5 h-3.5 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="17" x2="12" y2="22" />
                                                <path d="M5 17h14v-2l-1-7V5a2 2 0 0 1 2-2H4a2 2 0 0 1 2 2v3l-1 7v2z" />
                                              </svg>
                                            )}
                                            {action.icon === "slack" && (
                                              <svg className="w-3.5 h-3.5" viewBox="0 0 54 54" fill="none">
                                                <path d="M19.712 33.867a4.285 4.285 0 01-4.285 4.286 4.285 4.285 0 01-4.286-4.286 4.285 4.285 0 014.286-4.285h4.285v4.285z" fill="#E01E5A" />
                                                <path d="M21.857 33.867a4.285 4.285 0 014.286-4.285 4.285 4.285 0 014.285 4.285v10.714a4.285 4.285 0 01-4.285 4.286 4.285 4.285 0 01-4.286-4.286V33.867z" fill="#E01E5A" />
                                                <path d="M26.143 19.712a4.285 4.285 0 01-4.286-4.285 4.285 4.285 0 014.286-4.286 4.285 4.285 0 014.285 4.286v4.285H26.143z" fill="#36C5F0" />
                                                <path d="M26.143 21.857a4.285 4.285 0 014.285 4.286 4.285 4.285 0 01-4.285 4.285H15.427a4.285 4.285 0 01-4.286-4.285 4.285 4.285 0 014.286-4.286H26.143z" fill="#36C5F0" />
                                                <path d="M40.298 26.143a4.285 4.285 0 014.285 4.285 4.285 4.285 0 01-4.285 4.286 4.285 4.285 0 01-4.286-4.286V26.143h4.286z" fill="#2EB67D" />
                                                <path d="M38.153 26.143a4.285 4.285 0 01-4.285-4.286 4.285 4.285 0 014.285-4.285h10.714a4.285 4.285 0 014.286 4.285 4.285 4.285 0 01-4.286 4.286H38.153z" fill="#2EB67D" />
                                                <path d="M33.867 40.298a4.285 4.285 0 014.286 4.285 4.285 0 01-4.286 4.286 4.285 4.285 0 01-4.285-4.286V40.298h4.285z" fill="#ECB22E" />
                                                <path d="M33.867 38.153a4.285 4.285 0 01-4.285 4.285 4.285 4.285 0 01-4.286-4.285V27.44a4.285 4.285 0 014.286-4.286 4.285 4.285 0 014.285 4.286v10.714z" fill="#ECB22E" />
                                              </svg>
                                            )}
                                            {(!action.icon || action.icon === "external") && (
                                              <svg className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                              </svg>
                                            )}
                                            <span className="text-[11px] font-semibold text-zinc-900">{action.label}</span>
                                          </>
                                        )}
                                      </button>
                                      {successUrl && (
                                        <span className="text-[10px] text-emerald-600 font-medium animate-in slide-in-from-left-1 duration-300">
                                          Success!
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        ) : !msg.isSilent ? (
                          <span className="flex gap-1 py-0.5">
                            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                          </span>
                        ) : null}
                      </div>

                      {/* ── Changes description (designer-friendly) ── */}
                      {msg.changesDescription && msg.changesDescription.length > 0 && (
                        <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl overflow-hidden">
                          <div className="bg-emerald-50 px-3 py-1.5 border-b border-emerald-200 flex items-center gap-2">
                            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
                              {msg.changesDescription.length} update{msg.changesDescription.length > 1 ? "s" : ""} applied
                            </span>
                          </div>
                          <div className="divide-y divide-emerald-100">
                            {msg.changesDescription.map((desc, i) => (
                              <div key={i} className="px-3 py-2 flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                                <span className="text-xs text-zinc-600 leading-relaxed">{desc}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Page indicator ── */}
      {currentPage !== "/" && (
        <div className="px-4 py-1.5 border-t border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="text-[11px] text-zinc-500">Viewing <span className="font-mono font-medium text-zinc-700">{currentPage}</span></span>
          </div>
        </div>
      )}

      {/* ── Pending file previews ── */}
      {pendingFiles.length > 0 && (
        <div className="px-3 pt-2 pb-1 border-t border-zinc-100 bg-zinc-50/30">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3 h-3 text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""} attached
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((f) => (
              <div key={f.filename} className="relative group">
                {isImageType(f.contentType) ? (
                  <div className="w-14 h-14 rounded-lg overflow-hidden border border-zinc-200 shadow-sm bg-white">
                    <img src={f.url} alt={f.originalName} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-14 px-3 rounded-lg border border-zinc-200 shadow-sm bg-white flex flex-col items-center justify-center gap-0.5">
                    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-[8px] text-zinc-500 truncate max-w-[60px]">{f.originalName}</span>
                  </div>
                )}
                <button
                  onClick={() => removePendingFile(f.filename)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-700 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                  <div className="bg-zinc-900 text-white text-[9px] px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
                    {f.originalName} · {formatFileSize(f.size)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Uploading indicator ── */}
      {isUploading && (
        <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50/50 flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-zinc-800 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-600 font-medium">Uploading files...</span>
        </div>
      )}

      {/* ── Input ── */}
      <div className="p-3 border-t border-zinc-200 shrink-0">
        <div className="relative bg-zinc-50 border border-zinc-200 rounded-xl overflow-hidden focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-100 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            onPaste={handlePaste}
            placeholder={"What would you like to do?"}
            className="w-full bg-transparent px-4 pt-3 pb-10 text-sm resize-none focus:outline-none placeholder:text-zinc-400"
            rows={1}
            disabled={isLoading}
          />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.css,.html,.json,.svg,.zip"
            onChange={(e) => {
              if (e.target.files) handleFileSelect(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />

          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading}
              className="p-2 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all group"
              title="Upload files (images, mockups, screenshots)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            {/* Send button */}
            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && pendingFiles.length === 0) || isLoading}
              className="p-2 bg-gradient-to-r from-zinc-800 to-zinc-950 text-white rounded-lg hover:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Upload hint */}
        <div className="flex items-center justify-center mt-1.5 gap-1">
          <svg className="w-3 h-3 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-[10px] text-zinc-300">Drop, paste, or click 📎 to attach files</span>
        </div>
      </div>
    </div>
  );
}
