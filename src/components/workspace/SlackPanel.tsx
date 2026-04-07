"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SlackChannel {
  id: string;
  name: string;
  topic: string;
  purpose: string;
  memberCount: number;
  isPrivate: boolean;
  isMember: boolean;
}

interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  userName: string;
  userAvatar: string;
  threadTs?: string;
  replyCount?: number;
}

interface SlackPanelProps {
  projectId: string;
}

function formatTs(ts: string) {
  const d = new Date(parseFloat(ts) * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) +
        " " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderSlackText(text: string) {
  return text
    .replace(/<@(\w+)>/g, "@user")
    .replace(/<#(\w+)\|([^>]+)>/g, "#$2")
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function SlackPanel({ projectId }: SlackPanelProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [allChannels, setAllChannels] = useState<SlackChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<SlackChannel | null>(null);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAllChannels, setShowAllChannels] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load channels (project-scoped)
  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/slack/channels?projectId=${projectId}`);
      const data = await res.json();
      setConnected(data.connected ?? (data.channels?.length > 0));
      setChannels(data.channels || []);
      if (!data.connected && (!data.channels || data.channels.length === 0)) {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    }
  }, [projectId]);

  // Load all channels (no filter)
  const loadAllChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/slack/channels");
      const data = await res.json();
      setAllChannels(data.channels || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Load messages when a channel is selected
  const loadMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/slack/messages?channel=${channelId}&limit=50`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeChannel) {
      loadMessages(activeChannel.id);
      // Poll for new messages every 8 seconds
      const interval = setInterval(() => loadMessages(activeChannel.id), 8000);
      return () => clearInterval(interval);
    }
  }, [activeChannel, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!messageInput.trim() || !activeChannel) return;
    setSending(true);
    const text = messageInput;
    setMessageInput("");
    try {
      const res = await fetch("/api/slack/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: activeChannel.id, text }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { ...data.message, userName: "You", ts: data.message.ts || String(Date.now() / 1000) },
        ]);
      }
    } catch {
      setMessageInput(text);
    } finally {
      setSending(false);
    }
  };

  const createChannel = async () => {
    if (!newChannelName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/slack/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newChannelName, projectId }),
      });
      if (res.ok) {
        const data = await res.json();
        setChannels((prev) => [...prev, data.channel]);
        setActiveChannel(data.channel);
        setShowCreateChannel(false);
        setNewChannelName("");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create channel");
      }
    } catch {
      alert("Failed to create channel");
    } finally {
      setCreating(false);
    }
  };

  // ── Loading state ──
  if (connected === null) {
    return (
      <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex items-center justify-center shrink-0">
        <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Not connected ──
  if (!connected) {
    return (
      <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col items-center justify-center shrink-0 px-8 text-center pb-16">
        <div className="w-11 h-11 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-zinc-800 mb-1">Messages</p>
        <p className="text-xs text-zinc-400 mb-5">Connect Slack to chat with your team.</p>
        <a
          href="/api/auth/slack"
          className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors"
        >
          Connect Slack
        </a>
      </div>
    );
  }

  // ── Channel list (no active channel) ──
  if (!activeChannel) {
    return (
      <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
        {/* Header */}
        <div className="h-10 border-b border-zinc-100 flex items-center justify-between px-3 shrink-0">
          <span className="text-sm font-semibold text-zinc-800">Messages</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowAllChannels(!showAllChannels); if (!showAllChannels) loadAllChannels(); }}
              className="text-[10px] text-zinc-400 hover:text-zinc-700 px-2 py-1 rounded-lg hover:bg-zinc-100 transition-all"
              title="Browse all workspace channels"
            >
              {showAllChannels ? "Project" : "All"}
            </button>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
              title="New channel"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Create channel inline */}
        {showCreateChannel && (
          <div className="p-3 border-b border-zinc-100 space-y-2">
            <input
              autoFocus
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createChannel()}
              placeholder="channel-name"
              className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-300 font-mono"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowCreateChannel(false); setNewChannelName(""); }}
                className="flex-1 text-xs text-zinc-500 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createChannel}
                disabled={!newChannelName.trim() || creating}
                className="flex-1 text-xs bg-zinc-900 text-white py-1.5 rounded-lg hover:bg-zinc-700 disabled:opacity-30 transition-colors"
              >
                {creating ? "..." : "Create"}
              </button>
            </div>
          </div>
        )}

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto">
          {(showAllChannels ? allChannels : channels).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
              <svg className="w-8 h-8 text-zinc-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
              <p className="text-xs text-zinc-400 mb-3">
                {showAllChannels ? "No channels in workspace" : "No channels for this project yet"}
              </p>
              <button
                onClick={() => setShowCreateChannel(true)}
                className="text-xs text-zinc-500 hover:text-zinc-800 border border-zinc-200 hover:border-zinc-400 px-3 py-1.5 rounded-lg transition-all"
              >
                Create a channel
              </button>
            </div>
          ) : (
            <div className="py-1">
              {(showAllChannels ? allChannels : channels).map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannel(ch)}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-50 transition-colors group flex items-center gap-2"
                >
                  <span className="text-zinc-400 text-xs">#</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-zinc-700 truncate group-hover:text-zinc-900">
                      {ch.name}
                    </p>
                    {ch.topic && (
                      <p className="text-[10px] text-zinc-400 truncate">{ch.topic}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-300">{ch.memberCount}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Active channel: message view ──
  return (
    <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-10 border-b border-zinc-100 flex items-center px-3 gap-2 shrink-0">
        <button
          onClick={() => setActiveChannel(null)}
          className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-zinc-400 text-xs">#</span>
        <span className="text-sm font-semibold text-zinc-800 truncate flex-1">
          {activeChannel.name}
        </span>
        <button
          onClick={() => loadMessages(activeChannel.id)}
          className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-all"
          title="Refresh"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2">
        {loadingMessages && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-xs text-zinc-400">No messages yet</p>
            <p className="text-[10px] text-zinc-300 mt-1">Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.ts} className="flex items-start gap-2 group">
                {msg.userAvatar ? (
                  <img
                    src={msg.userAvatar}
                    alt=""
                    className="w-6 h-6 rounded-md shrink-0 mt-0.5"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-md bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[9px] font-bold text-zinc-500">
                      {msg.userName[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-semibold text-zinc-800">
                      {msg.userName}
                    </span>
                    <span className="text-[9px] text-zinc-300">
                      {formatTs(msg.ts)}
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-600 leading-relaxed break-words whitespace-pre-wrap">
                    {renderSlackText(msg.text)}
                  </p>
                  {msg.replyCount && msg.replyCount > 0 && (
                    <span className="text-[10px] text-blue-500 font-medium mt-0.5 inline-block">
                      {msg.replyCount} {msg.replyCount === 1 ? "reply" : "replies"}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message input */}
      <div className="p-2 border-t border-zinc-100 shrink-0">
        <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 focus-within:border-zinc-400 transition-colors">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={`Message #${activeChannel.name}`}
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-zinc-300 text-zinc-700"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={!messageInput.trim() || sending}
            className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
