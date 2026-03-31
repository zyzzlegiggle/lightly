"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  changesDescription?: string[];
  timestamp: number;
  attachments?: UploadedFile[];
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

// ── Component ──────────────────────────────────────────────────────────

export function ChatSidebar({ projectId, isCollapsed, onToggle, onDeployTriggered, onChangesProposed, currentPage = "/" }: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || isLoading) return;

    const attachments = [...pendingFiles];
    const displayText = text || (attachments.length > 0 ? `Uploaded ${attachments.length} file(s) for reference` : "");

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: displayText,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? attachments : undefined,
    };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setPendingFiles([]);
    setIsLoading(true);

    const assistantId = `a-${Date.now()}`;
    let assistantContent = "";

    setMessages((p) => [...p, { id: assistantId, role: "assistant", content: "", timestamp: Date.now() }]);

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
              setMessages((p) => p.map((m) => (m.id === assistantId ? { ...m, content: assistantContent } : m)));
            } else if (evt.type === "files_changed") {
              // files_changed now has designer-friendly descriptions, not file paths
              setMessages((p) => p.map((m) => (m.id === assistantId ? { ...m, changesDescription: evt.files } : m)));
            } else if (evt.type === "proposed_changes") {
              // Pass changes up to parent for the ChangesPanel
              onChangesProposed?.(evt.changes || []);
              onDeployTriggered?.(); // Preview already synced
            } else if (evt.type === "done") {
              setMessages((p) => p.filter((m) => m.role !== "status"));
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

  // ── Clear chat ──

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY(projectId));
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
      className={`w-[380px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0 relative transition-all ${isDragOver ? "ring-2 ring-violet-400 ring-inset" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Drag overlay ── */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-violet-50/90 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none rounded-r-xl">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg animate-bounce">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-violet-700 mb-1">Drop files here</h3>
          <p className="text-sm text-violet-500">Images, mockups, screenshots — up to 10MB</p>
        </div>
      )}

      {/* ── Header ── */}
      <div className="h-12 border-b border-zinc-100 flex items-center justify-between px-4 shrink-0">

        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={clearChat} className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-all" title="Clear chat">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
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
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-800 text-[15px] mb-1">What would you like to change?</h3>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-[240px]">
              Describe what you want to build or modify.
            </p>
            <div className="mt-5 flex flex-wrap gap-1.5 justify-center">
              {["Upload a mockup", "Change the design", "Rework the UI"].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    if (s === "Upload a mockup") {
                      fileInputRef.current?.click();
                    } else {
                      setInput(s);
                      textareaRef.current?.focus();
                    }
                  }}
                  className="text-[11px] text-zinc-500 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded-full transition-colors"
                >
                  {s === "Upload a mockup" ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {s}
                    </span>
                  ) : s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id}>
                {/* ── Status ── */}
                {msg.role === "status" ? (
                  <div className="flex items-center gap-2 justify-center py-2">
                    <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
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
                                  <svg className="w-4 h-4 text-violet-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="text-[10px] text-violet-100 font-medium truncate max-w-[80px]">{att.originalName}</span>
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
                      <div className="bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Assistant message ── */
                  <div className="flex justify-start">
                    <div className="space-y-2 max-w-[90%]">
                      {/* Message bubble */}
                      <div className="bg-zinc-50 border border-zinc-100 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] text-zinc-700 leading-relaxed whitespace-pre-wrap">
                        {msg.content || (
                          <span className="flex gap-1 py-0.5">
                            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                          </span>
                        )}
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
            ))}
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
            <svg className="w-3 h-3 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="px-4 py-2 border-t border-zinc-100 bg-violet-50/50 flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-violet-600 font-medium">Uploading files...</span>
        </div>
      )}

      {/* ── Input ── */}
      <div className="p-3 border-t border-zinc-200 shrink-0">
        <div className="relative bg-zinc-50 border border-zinc-200 rounded-xl overflow-hidden focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            onPaste={handlePaste}
            placeholder={pendingFiles.length > 0 ? "Describe how to use these files..." : "Describe what to change, or paste/drop images..."}
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
              className="p-2 text-zinc-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all group"
              title="Upload files (images, mockups, screenshots)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={(!input.trim() && pendingFiles.length === 0) || isLoading}
              className="p-2 bg-gradient-to-r from-violet-500 to-indigo-600 text-white rounded-lg hover:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-sm"
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
