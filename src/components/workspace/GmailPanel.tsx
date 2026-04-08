"use client";

import { useState, useEffect, useCallback } from "react";
import { CardSkeleton, BlockSkeleton } from "./LoaderComponents";

interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  unread: boolean;
}

interface GmailMessageFull extends GmailMessage {
  to: string;
  body: string;
  labelIds: string[];
}

type View = "inbox" | "reading" | "compose";

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  return isToday
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function parseSender(from: string) {
  const match = from.match(/^"?([^"<]+)"?\s*(?:<.*>)?$/);
  return match ? match[1].trim() : from;
}

// ── Sub-components ────────────────────────────────────────────────────────────


function NotConnected({ projectId }: { projectId: string }) {
  return (
    <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col items-center justify-center shrink-0 px-8 text-center pb-16">
      <div className="w-12 h-12 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-zinc-800 mb-1">Gmail</p>
      <p className="text-xs text-zinc-400 mb-5 leading-relaxed">Connect your Google account to read and send emails.</p>
      <a
        href={`/api/auth/connect?connection=google-oauth2&returnTo=${encodeURIComponent(`/project/${projectId}?tab=gmail`)}`}
        className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-zinc-700 transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fillOpacity=".8"/>
          <path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fillOpacity=".6"/>
          <path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fillOpacity=".4"/>
          <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fillOpacity=".2"/>
        </svg>
        Connect Gmail
      </a>
    </div>
  );
}

interface GmailPanelProps {
  projectId: string;
  refreshKey?: number;
}

export function GmailPanel({ projectId, refreshKey }: GmailPanelProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("inbox");
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessageFull | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "success" | "error">("idle");

  // Check connection
  useEffect(() => {
    fetch("/api/connections?provider=google-oauth2")
      .then((r) => r.json())
      .then((d) => setConnected(d.connected))
      .catch(() => setConnected(false));
  }, []);

  // Load messages when connected
  const loadMessages = useCallback(async (q?: string) => {
    setLoadingMessages(true);
    setLoadError(null);
    try {
      const query = q !== undefined ? q : activeSearch || "label:INBOX";
      const res = await fetch(`/api/gmail/messages?q=${encodeURIComponent(query)}&maxResults=25`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error("[Gmail] Failed to load messages:", err);
      setLoadError(err.message || "Failed to load messages");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, [activeSearch]);

  useEffect(() => {
    if (connected) loadMessages();
  }, [connected, refreshKey]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery);
    loadMessages(searchQuery || "label:INBOX");
  };

  const openMessage = async (id: string) => {
    setView("reading");
    setLoadingMessage(true);
    try {
      const res = await fetch(`/api/gmail/messages?id=${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelectedMessage(data);
    } catch {
      setSelectedMessage(null);
    } finally {
      setLoadingMessage(false);
    }
  };

  const sendEmail = async () => {
    if (!composeTo || !composeSubject || !composeBody) return;
    setSending(true);
    setSendStatus("idle");
    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: composeTo, subject: composeSubject, body: composeBody }),
      });
      if (!res.ok) throw new Error();
      setSendStatus("success");
      setTimeout(() => {
        setView("inbox");
        setComposeTo("");
        setComposeSubject("");
        setComposeBody("");
        setSendStatus("idle");
      }, 1500);
    } catch {
      setSendStatus("error");
    } finally {
      setSending(false);
    }
  };

  // ── Render: loading connection check ──
  if (connected === null) {
    return (
      <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex items-center justify-center shrink-0">
        <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render: not connected ──
  if (!connected) return <NotConnected projectId={projectId} />;

  // ── Shared header ──
  const header = (
    <div className="h-12 border-b border-zinc-100 flex items-center justify-between px-3 shrink-0 gap-2">
      <div className="flex items-center gap-2">
        {view !== "inbox" && (
          <button
            onClick={() => { setView("inbox"); setSelectedMessage(null); }}
            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="text-sm font-semibold text-zinc-800">
            {view === "inbox" ? "Gmail" : view === "reading" ? "Email" : "New Email"}
          </span>
        </div>
      </div>
      {view === "inbox" && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadMessages()}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
            title="Refresh inbox"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setView("compose")}
            className="flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 px-2.5 py-1.5 rounded-lg transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Compose
          </button>
        </div>
      )}
    </div>
  );

  // ── Render: Inbox ──
  if (view === "inbox") {
    return (
      <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
        {header}

        {/* Search */}
        <form onSubmit={handleSearch} className="px-3 py-2 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-1.5 focus-within:border-zinc-400 transition-colors">
            <svg className="w-3 h-3 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search mail..."
              className="flex-1 bg-transparent text-xs text-zinc-700 outline-none placeholder:text-zinc-400"
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(""); setActiveSearch(""); loadMessages("in:inbox"); }} className="text-zinc-400 hover:text-zinc-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </form>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingMessages ? (
            <div className="py-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-6 border border-red-100">
                <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-[14px] font-bold text-zinc-800 mb-1">Mail Error</h3>
              <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
                {loadError === "google_not_connected" 
                  ? "Your Google account session has expired. Please reconnect." 
                  : `Failed to load messages: ${loadError}`}
              </p>
              <button
                onClick={() => loadMessages()}
                className="inline-flex items-center gap-2 bg-zinc-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all shadow-md active:scale-95"
              >
                Retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center mb-6 shadow-sm border border-zinc-100">
                <svg className="w-7 h-7 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-[14px] font-bold text-zinc-800 mb-1">Inbox is empty</h3>
              <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
                {activeSearch 
                  ? `No emails found matching "${activeSearch}"` 
                  : "You're all caught up! You can also tell the AI agent to send emails or drafts for you."}
              </p>
              <button
                onClick={() => setView("compose")}
                className="inline-flex items-center gap-2 bg-zinc-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all shadow-md active:scale-95"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                Compose New Email
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {messages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => openMessage(msg.id)}
                  className="w-full text-left px-3 py-3 hover:bg-zinc-50 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {msg.unread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                      <p className={`text-[12px] truncate ${msg.unread ? "font-bold text-zinc-900" : "font-medium text-zinc-700"}`}>
                        {parseSender(msg.from)}
                      </p>
                    </div>
                    <span className="text-[10px] text-zinc-400 shrink-0 mt-0.5">{formatDate(msg.date)}</span>
                  </div>
                  <p className={`text-[11px] truncate mb-0.5 ${msg.unread ? "font-semibold text-zinc-800" : "text-zinc-600"}`}>
                    {msg.subject}
                  </p>
                  <p className="text-[10px] text-zinc-400 truncate leading-relaxed">{msg.snippet}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Reading ──
  if (view === "reading") {
    return (
      <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
        {header}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingMessage || !selectedMessage ? (
            <div className="p-8">
              <div className="mb-8 space-y-3">
                <div className="w-48 h-6 bg-zinc-100 rounded-md animate-pulse" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-3 bg-zinc-50 rounded-md animate-pulse" />
                    <div className="w-32 h-3 bg-zinc-100 rounded-md animate-pulse" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-3 bg-zinc-50 rounded-md animate-pulse" />
                    <div className="w-24 h-3 bg-zinc-100 rounded-md animate-pulse" />
                  </div>
                </div>
              </div>
              <BlockSkeleton />
            </div>
          ) : (
            <div className="p-4">
              {/* Message meta */}
              <h3 className="text-sm font-bold text-zinc-900 leading-snug mb-3">{selectedMessage.subject}</h3>
              <div className="space-y-1 mb-4 pb-4 border-b border-zinc-100">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider w-6 shrink-0 pt-0.5">From</span>
                  <span className="text-[11px] text-zinc-700 leading-relaxed">{selectedMessage.from}</span>
                </div>
                {selectedMessage.to && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider w-6 shrink-0 pt-0.5">To</span>
                    <span className="text-[11px] text-zinc-700 leading-relaxed">{selectedMessage.to}</span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider w-6 shrink-0 pt-0.5">Date</span>
                  <span className="text-[11px] text-zinc-500">{formatDate(selectedMessage.date)}</span>
                </div>
              </div>

              {/* Body */}
              <div className="text-[11px] text-zinc-700 leading-relaxed whitespace-pre-wrap break-words">
                {selectedMessage.body
                  ? selectedMessage.body.replace(/<[^>]*>/g, "").trim()
                  : selectedMessage.snippet}
              </div>

              {/* Reply button */}
              <div className="mt-6 pt-4 border-t border-zinc-100">
                <button
                  onClick={() => {
                    setComposeTo(selectedMessage.from);
                    setComposeSubject(`Re: ${selectedMessage.subject}`);
                    setView("compose");
                  }}
                  className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-zinc-600 border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 py-2 rounded-xl transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  Reply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Compose ──
  return (
    <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
      {header}
      <div className="flex-1 flex flex-col min-h-0 p-3 gap-2">
        {/* To */}
        <div className="border border-zinc-200 rounded-xl overflow-hidden focus-within:border-zinc-400 transition-colors">
          <div className="flex items-center px-3 py-2 border-b border-zinc-100">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-10 shrink-0">To</span>
            <input
              type="email"
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1 text-xs text-zinc-800 bg-transparent outline-none placeholder:text-zinc-300"
            />
          </div>
          <div className="flex items-center px-3 py-2">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-10 shrink-0">Subj</span>
            <input
              type="text"
              value={composeSubject}
              onChange={(e) => setComposeSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 text-xs text-zinc-800 bg-transparent outline-none placeholder:text-zinc-300"
            />
          </div>
        </div>

        {/* Body */}
        <textarea
          value={composeBody}
          onChange={(e) => setComposeBody(e.target.value)}
          placeholder="Write your message..."
          className="flex-1 min-h-0 w-full text-xs text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-xl p-3 outline-none focus:border-zinc-400 resize-none placeholder:text-zinc-300 leading-relaxed transition-colors"
        />

        {/* Send */}
        <button
          onClick={sendEmail}
          disabled={sending || !composeTo || !composeSubject || !composeBody}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            sendStatus === "success"
              ? "bg-emerald-500 text-white"
              : sendStatus === "error"
              ? "bg-red-500 text-white"
              : "bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
          }`}
        >
          {sending ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : sendStatus === "success" ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              Sent!
            </>
          ) : sendStatus === "error" ? (
            "Failed to send"
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send
            </>
          )}
        </button>
      </div>
    </div>
  );
}
