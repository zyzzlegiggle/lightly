"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSkeleton, SidebarSkeleton } from "./LoaderComponents";

interface SlackChannel {
  id: string;
  name: string;
  topic: string;
  purpose: string;
  memberCount: number;
  isPrivate: boolean;
  isMember: boolean;
  isDm?: boolean;
}

interface SlackUser {
  id: string;
  name: string;
  avatar: string;
  status: string;
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
  refreshKey?: number;
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
  if (!text) return null;

  // 1. First handle standard Slack link formats and entities
  const clean = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // 2. Regex to match Slack patterns and our custom mentions
  // Groups: 1: Slack user, 2: Slack channel, 3: Slack link url, 4: Slack link title, 5: Slack simple link, 6: Custom mention
  const regex = /<@(\w+)>|<#(\w+)\|([^>]+)>|<(https?:\/\/[^|>]+)\|([^>]+)>|<(https?:\/\/[^>]+)>|(\[(notion|linear):([^|\]]+)\|([^\]]+)\])/g;
  
  const parts = clean.split(regex);
  const result: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === undefined || part === null || part === "") continue;

    // Handle captures
    // i+1: Slack User, i+2: Channel ID, i+3: Channel Name, i+4: Link URL, i+5: Link Title, i+6: Simple Link URL, 
    // i+7: Full Custom Mention, i+8: Service, i+9: Title, i+10: URL
    
    if (part.startsWith("<@") && part.endsWith(">")) {
      result.push(<span key={i} className="text-blue-500 font-medium">@user</span>);
      i += 10; continue;
    }
    if (part.startsWith("<#") && part.endsWith(">")) {
      const name = parts[i + 3];
      result.push(<span key={i} className="text-blue-500 font-medium">#{name || "channel"}</span>);
      i += 10; continue;
    }
    if (part.startsWith("<") && part.includes("|") && part.endsWith(">")) {
      const url = parts[i + 4];
      const title = parts[i + 5];
      result.push(<a key={i} href={url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{title || url}</a>);
      i += 10; continue;
    }
    if (part.startsWith("<") && part.endsWith(">")) {
      const url = parts[i + 6];
      result.push(<a key={i} href={url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{url}</a>);
      i += 10; continue;
    }

    // Custom Mentions: [service:Title|URL]
    if (part.startsWith("[") && (part.includes("notion:") || part.includes("linear:"))) {
      const service = parts[i + 8];
      const title = parts[i + 9];
      const url = parts[i + 10];
      if (service && title && url) {
        result.push(
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold mx-0.5 transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95 border ${
              service === "notion" 
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
        i += 10; continue;
      }
    }

    // Default: plain text
    result.push(part);
  }

  return result;
}

export function SlackPanel({ projectId, refreshKey }: SlackPanelProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [allChannels, setAllChannels] = useState<SlackChannel[]>([]);
  const [users, setUsers] = useState<SlackUser[]>([]);
  const [activeChannel, setActiveChannel] = useState<SlackChannel | null>(null);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [mentionItems, setMentionItems] = useState<{ type: "notion" | "linear"; id: string; title: string; url: string }[]>([]);
  const [loadingMentions, setLoadingMentions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load mention items (Notion + Linear) for autocomplete
  const loadMentionItems = useCallback(async () => {
    setLoadingMentions(true);
    try {
      const [notionRes, linearRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/notion?action=pages`),
        fetch(`/api/projects/${projectId}/linear`)
      ]);
      const notionData = await notionRes.json();
      const linearData = await linearRes.json();

      const nItems = (notionData.pages || []).map((p: any) => ({
        type: "notion",
        id: p.id,
        title: p.title,
        url: `https://www.notion.so/${p.id.replace(/-/g, "")}`
      }));
      const lItems = (linearData.issues || []).map((i: any) => ({
        type: "linear",
        id: i.id,
        title: i.title,
        url: i.url
      }));
      setMentionItems([...nItems, ...lItems]);
    } catch {} finally {
      setLoadingMentions(false);
    }
  }, [projectId]);

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

  // Load users (for DMs and invites)
  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/slack/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadChannels();
    loadUsers();
    loadMentionItems();
  }, [loadChannels, loadUsers, loadMentionItems, refreshKey]);

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
      
      // Update the active channel in the project context so the agent knows which one to use
      fetch(`/api/projects/${projectId}/update-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slackChannelId: activeChannel.id })
      }).catch(err => console.error("Failed to sync slack channel context:", err));

      // Poll for new messages every 8 seconds
      const interval = setInterval(() => loadMessages(activeChannel.id), 8000);
      return () => clearInterval(interval);
    }
  }, [activeChannel, loadMessages, projectId]);

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

  const startDMWithUser = async (user: SlackUser) => {
    try {
      const res = await fetch("/api/slack/conversations/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: user.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveChannel({
          id: data.channelId,
          name: user.name,
          topic: user.status,
          purpose: "Direct Message",
          memberCount: 2,
          isPrivate: true,
          isMember: true,
          isDm: true,
        });
      }
    } catch {
      alert("Failed to start DM");
    }
  };

  const inviteToChannel = async (userId: string) => {
    if (!activeChannel) return;
    try {
      const res = await fetch("/api/slack/channels/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: activeChannel.id, users: userId }),
      });
      if (res.ok) {
        setShowInviteModal(false);
        loadMessages(activeChannel.id); // Reload to potentially show "joined" msg
      } else {
        const err = await res.json();
        alert(err.error || "Failed to invite user");
      }
    } catch {
      alert("Failed to invite user");
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
          href={`/api/auth/slack?returnTo=${encodeURIComponent(`/project/${projectId}?tab=slack`)}`}
          className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors"
        >
          Connect Slack
        </a>
      </div>
    );
  }

  // ── Sidebar List View ──
  if (!activeChannel) {
    return (
      <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
        {/* Header */}
        <div className="h-10 border-b border-zinc-100 flex items-center justify-between px-3 shrink-0">
          <span className="text-sm font-bold text-zinc-800">Messages</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowAllChannels(!showAllChannels); if (!showAllChannels) loadAllChannels(); }}
              className="text-[10px] text-zinc-400 hover:text-zinc-700 px-2 py-1 rounded-lg hover:bg-zinc-100 transition-all font-medium"
            >
              {showAllChannels ? "Project" : "All"}
            </button>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
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

        <div className="flex-1 overflow-y-auto">
          {loadingMentions && mentionItems.length === 0 ? (
            <SidebarSkeleton />
          ) : (
            <>
              {/* Channels Section */}
              <div className="py-2">
                <div className="px-3 py-1 mb-1">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Channels</p>
                </div>
                {(showAllChannels ? allChannels : channels).length === 0 ? (
                  <div className="px-3 py-4 text-center text-zinc-400 text-[10px]">
                    No channels found
                  </div>
                ) : (
                  (showAllChannels ? allChannels : channels).map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => setActiveChannel(ch)}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-50 transition-colors group flex items-center gap-2"
                    >
                      <span className="text-zinc-300 text-xs font-mono">#</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-zinc-700 group-hover:text-zinc-900 truncate">
                          {ch.name}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* People Section */}
              <div className="py-2 border-t border-zinc-50">
                <div className="px-3 py-1 mb-1">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Direct Messages</p>
                </div>
                {users.length === 0 ? (
                  <div className="px-3 py-4 text-center text-zinc-400 text-[10px]">
                    No people found
                  </div>
                ) : (
                  users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => startDMWithUser(u)}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-50 transition-colors group flex items-center gap-2.5"
                    >
                      {u.avatar ? (
                        <img src={u.avatar} alt="" className="w-5 h-5 rounded-md object-cover" />
                      ) : (
                        <div className="w-5 h-5 rounded-md bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-500">
                          {u.name[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-zinc-700 group-hover:text-zinc-900 truncate">
                          {u.name}
                        </p>
                        {u.status && (
                          <p className="text-[10px] text-zinc-400 truncate -mt-0.5">{u.status}</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Active Channel / DM View ──
  return (
    <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0 relative">
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
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {!activeChannel.isDm && <span className="text-zinc-300 text-xs font-mono">#</span>}
          <span className="text-sm font-semibold text-zinc-800 truncate">
            {activeChannel.name}
          </span>
        </div>
        {!activeChannel.isDm && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
            title="Invite people"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </button>
        )}
        <button
          onClick={() => loadMessages(activeChannel.id)}
          className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2 bg-gradient-to-b from-white to-zinc-50/30">
        {loadingMessages && messages.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <MessageSkeleton key={i} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-xs text-zinc-400">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.ts} className="flex items-start gap-3 group">
                {msg.userAvatar ? (
                  <img
                    src={msg.userAvatar}
                    alt=""
                    className="w-7 h-7 rounded-lg shrink-0 mt-0.5 shadow-sm"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5 font-bold text-zinc-500 text-[10px]">
                    {msg.userName[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] font-bold text-zinc-900">
                      {msg.userName}
                    </span>
                    <span className="text-[9px] text-zinc-300 font-medium">
                      {formatTs(msg.ts)}
                    </span>
                  </div>
                  <p className="text-[13px] text-zinc-700 leading-relaxed break-words whitespace-pre-wrap">
                    {renderSlackText(msg.text)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message input */}
      <div className="p-3 bg-white border-t border-zinc-100 shrink-0 relative">
        {/* Mention Menu */}
        {messageInput.includes("@") && (
          <MentionMenu 
            items={mentionItems}
            loading={loadingMentions}
            query={messageInput.split("@").pop() || ""} 
            onSelect={(mention: string) => {
              const parts = messageInput.split("@");
              parts.pop();
              setMessageInput(parts.join("@") + mention + " ");
            }}
          />
        )}
        <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-2.5 focus-within:border-zinc-400 focus-within:bg-white focus-within:ring-1 focus-within:ring-zinc-200 transition-all shadow-inner">
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
            placeholder={`Message ${activeChannel.isDm ? "@" : "#"}${activeChannel.name} (type @ to mention notes/tasks)`}
            className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-zinc-300 text-zinc-700 font-medium"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={!messageInput.trim() || sending}
            className={`p-1.5 rounded-lg transition-all ${messageInput.trim() ? "text-accent-primary hover:bg-zinc-100" : "text-zinc-300 cursor-default"}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Invite Modal Overlay */}
      {showInviteModal && (
        <div className="absolute inset-0 z-10 bg-white/95 flex flex-col p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-zinc-800">Invite to #{activeChannel.name}</h3>
            <button onClick={() => setShowInviteModal(false)} className="p-1 text-zinc-400 hover:text-zinc-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto border border-zinc-100 rounded-xl">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => inviteToChannel(u.id)}
                className="w-full text-left px-4 py-3 hover:bg-zinc-50 border-b border-zinc-50 last:border-0 flex items-center gap-3 transition-colors"
                title={`Invite ${u.name}`}
              >
                {u.avatar ? (
                  <img src={u.avatar} alt="" className="w-6 h-6 rounded-md shadow-sm" />
                ) : (
                  <div className="w-6 h-6 rounded-md bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-500">
                    {u.name[0]}
                  </div>
                )}
                <span className="text-[12px] font-semibold text-zinc-700">{u.name}</span>
                <span className="ml-auto text-[10px] text-zinc-400 border border-zinc-100 px-2 py-0.5 rounded-full">Invite</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper: Mention Dropdown Menu ──
function MentionMenu({ 
  items,
  loading,
  query, 
  onSelect 
}: { 
  items: { type: "notion" | "linear"; id: string; title: string; url: string }[];
  loading: boolean;
  query: string; 
  onSelect: (mention: string) => void;
}) {
  const filtered = items.filter(item => 
    item.title.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  if (loading && items.length === 0) {
    return (
      <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden z-20 p-4 flex items-center justify-center gap-2">
        <div className="w-3 h-3 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Loading project items...</span>
      </div>
    );
  }

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden z-20 animate-in fade-in slide-in-from-bottom-2 duration-200 max-h-[300px] flex flex-col">
      <div className="p-2 border-b border-zinc-50 bg-zinc-50/50">
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-2">Mention project items</p>
      </div>
      <div className="overflow-y-auto">
        {filtered.map((item, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(`[${item.type}:${item.title}|${item.url}]`)}
            className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 flex items-center gap-3 transition-colors border-b border-zinc-50 last:border-0"
          >
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${item.type === "notion" ? "bg-zinc-100" : "bg-indigo-50"}`}>
               {item.type === "notion" ? (
                 <svg className="w-3.5 h-3.5 text-zinc-900" viewBox="0 0 24 24" fill="currentColor">
                   <path d="M4.459 4.208c.739.062 1.346.335 1.83 1.054l13.064 1.705V19.78c-1.125-.45-2.156-.632-3.111-.53l-11.834-1.288c-.689-.061-1.218-.363-1.583-1.026V5.378c.365.176.924.312 1.634.33V4.208zm1.63 1.332v12.01c0 .248.163.502.483.61l10.97 1.155c.346 0 .54-.254.54-.502V7.12L6.152 5.66c-.033-.03-.06-.062-.063-.12zm2.083 2.502h2.247v5.69l3.073-5.69h2.518l-3.332 6.002 3.655 6.002H14.19l-3.398-5.69v5.69H8.172V8.042z" />
                 </svg>
               ) : (
                 <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                   <path d="M5 17h14v-2l-1-7V5a2 2 0 0 1 2-2H4a2 2 0 0 1 2 2v3l-1 7v2z" />
                 </svg>
               )}
            </div>
            <div className="flex-1 min-w-0 py-0.5">
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border grow-0 shadow-sm ${
                item.type === "notion" 
                  ? "bg-zinc-100/80 text-zinc-800 border-zinc-200" 
                  : "bg-indigo-50/80 text-indigo-700 border-indigo-100"
              }`}>
                <div className="w-3 h-3 bg-white rounded-md flex items-center justify-center shadow-sm shrink-0">
                  {item.type === "notion" ? (
                    <svg className="w-2 h-2 text-zinc-900" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4.459 4.208c.739.062 1.346.335 1.83 1.054l13.064 1.705V19.78c-1.125-.45-2.156-.632-3.111-.53l-11.834-1.288c-.689-.061-1.218-.363-1.583-1.026V5.378c.365.176.924.312 1.634.33V4.208zm1.63 1.332v12.01c0 .248.163.502.483.61l10.97 1.155c.346 0 .54-.254.54-.502V7.12L6.152 5.66c-.033-.03-.06-.062-.063-.12zm2.083 2.502h2.247v5.69l3.073-5.69h2.518l-3.332 6.002 3.655 6.002H14.19l-3.398-5.69v5.69H8.172V8.042z" />
                    </svg>
                  ) : (
                    <svg className="w-2 h-2 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 17h14v-2l-1-7V5a2 2 0 0 1 2-2H4a2 2 0 0 1 2 2v3l-1 7v2z" />
                    </svg>
                  )}
                </div>
                <span className="truncate max-w-[180px]">{item.title}</span>
              </div>
              <p className="text-[9px] font-medium text-zinc-400 capitalize mt-1 ml-2">Suggesting {item.type} Item</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
