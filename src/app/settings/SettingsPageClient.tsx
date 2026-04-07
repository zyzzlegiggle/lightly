"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SlackWorkspace {
  id: string;
  teamId: string;
  teamName: string;
  connectedAt: string;
}

interface Profile {
  name: string;
  email: string;
  image: string | null;
  username: string | null;
}

export default function SettingsPageClient({
  profile,
  connectedProviders,
  mainProvider,
}: {
  profile: Profile;
  connectedProviders: string[];
  mainProvider?: string;
}) {
  const router = useRouter();
  const [slackWorkspaces, setSlackWorkspaces] = useState<SlackWorkspace[]>([]);
  const [loadingSlack, setLoadingSlack] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [githubLinked, setGithubLinked] = useState<boolean | null>(null); // null = loading

  const googleConnected = connectedProviders.includes("google-oauth2");

  useEffect(() => {
    fetch("/api/slack/workspaces")
      .then((r) => r.json())
      .then((data) => setSlackWorkspaces(data.workspaces || []))
      .catch(() => {})
      .finally(() => setLoadingSlack(false));

    // Check if GitHub is linked by attempting to fetch repos
    fetch("/api/repos")
      .then((r) => setGithubLinked(r.status !== 401 && r.status !== 403))
      .catch(() => setGithubLinked(false));
  }, []);

  const handleDisconnectSlack = async (id: string) => {
    setDisconnecting(id);
    await fetch(`/api/slack/workspaces/${id}`, { method: "DELETE" });
    setSlackWorkspaces((prev) => prev.filter((w) => w.id !== id));
    setDisconnecting(null);
  };

  const handleDisconnectGoogle = async () => {
    setDisconnecting("google");
    await fetch("/api/auth/google/disconnect", { method: "DELETE" });
    window.location.reload();
  };

  const handleDisconnectLinear = async () => {
    setDisconnecting("linear");
    await fetch("/api/auth/linear/disconnect", { method: "DELETE" });
    window.location.reload();
  };

  const handleDisconnectNotion = async () => {
    setDisconnecting("notion");
    await fetch("/api/auth/notion/disconnect", { method: "DELETE" });
    window.location.reload();
  };

  const handleLogoutAll = async () => {
    if (confirm("Are you sure you want to disconnect ALL services?")) {
      await fetch("/api/auth/logout-all", { method: "DELETE" });
      window.location.reload();
    }
  };

  const handleSignOut = () => {
    window.location.href = "/api/auth/logout";
  };

  return (
    <div className="space-y-8">
      {/* Account Section */}
      <section className="bg-white border border-border-subtle rounded-xl p-8 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Account Settings</h2>
            <p className="text-sm text-text-muted mt-1">Manage your profile and linked accounts.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-zinc-50 rounded-xl border border-border-subtle">
            {profile.image ? (
              <img src={profile.image} alt="" className="w-12 h-12 rounded-full ring-2 ring-white" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-zinc-200 flex items-center justify-center text-lg font-bold">
                {profile.name?.[0]}
              </div>
            )}
            <div className="flex-1">
              <p className="font-bold text-text-primary">{profile.name}</p>
              <p className="text-sm text-text-muted">{profile.email}</p>
              {profile.username && <p className="text-xs text-accent-primary font-medium mt-1">@{profile.username}</p>}
            </div>
          </div>

          {/* Connected Accounts Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">Connected Accounts</h3>
            <div className="grid gap-3">
              {/* GitHub */}
              {githubLinked === null ? (
                // Loading skeleton
                <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-border-subtle animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-200" />
                    <div className="space-y-1">
                      <div className="h-3 w-24 bg-zinc-200 rounded" />
                      <div className="h-2.5 w-32 bg-zinc-100 rounded" />
                    </div>
                  </div>
                </div>
              ) : githubLinked ? (
                <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-border-subtle">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white">
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">GitHub Account</p>
                      <p className="text-xs text-text-muted">Connected for code access</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {mainProvider === "github" && (
                      <div className="px-2 py-1 bg-zinc-900 text-white text-[10px] font-bold rounded uppercase tracking-tight">
                        Main Account
                      </div>
                    )}
                    <div className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded uppercase tracking-tight border border-emerald-100">
                      Active
                    </div>
                  </div>
                </div>
              ) : (
                <a
                  href="/api/auth/connect?connection=github"
                  className="flex items-center justify-between p-4 bg-white hover:bg-zinc-50 rounded-xl border border-dashed border-border-subtle transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center group-hover:bg-zinc-200 transition-colors">
                      <svg className="w-4 h-4 text-zinc-500 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-500 group-hover:text-zinc-800 transition-colors">Connect GitHub</p>
                      <p className="text-xs text-zinc-400">Required to create and manage projects</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-zinc-400 group-hover:text-zinc-600 transition-colors flex items-center gap-1">
                    Connect
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </span>
                </a>
              )}

              {/* Slack Workspaces */}
              {!loadingSlack && slackWorkspaces.map((ws) => (
                <div key={ws.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-border-subtle">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#4A154B] flex items-center justify-center">
                      <svg className="w-4 h-4" viewBox="0 0 54 54" fill="none">
                        <path d="M19.712 33.867a4.285 4.285 0 01-4.285 4.286 4.285 4.285 0 01-4.286-4.286 4.285 4.285 0 014.286-4.285h4.285v4.285z" fill="#E01E5A"/>
                        <path d="M21.857 33.867a4.285 4.285 0 014.286-4.285 4.285 4.285 0 014.285 4.285v10.714a4.285 4.285 0 01-4.285 4.286 4.285 4.285 0 01-4.286-4.286V33.867z" fill="#E01E5A"/>
                        <path d="M26.143 19.712a4.285 4.285 0 01-4.286-4.285 4.285 4.285 0 014.286-4.286 4.285 4.285 0 014.285 4.286v4.285H26.143z" fill="#36C5F0"/>
                        <path d="M26.143 21.857a4.285 4.285 0 014.285 4.286 4.285 4.285 0 01-4.285 4.285H15.427a4.285 4.285 0 01-4.286-4.285 4.285 4.285 0 014.286-4.286H26.143z" fill="#36C5F0"/>
                        <path d="M40.298 26.143a4.285 4.285 0 014.285 4.285 4.285 4.285 0 01-4.285 4.286 4.285 4.285 0 01-4.286-4.286V26.143h4.286z" fill="#2EB67D"/>
                        <path d="M38.153 26.143a4.285 4.285 0 01-4.285-4.286 4.285 4.285 0 014.285-4.285h10.714a4.285 4.285 0 014.286 4.285 4.285 4.285 0 01-4.286 4.286H38.153z" fill="#2EB67D"/>
                        <path d="M33.867 40.298a4.285 4.285 0 014.286 4.285 4.285 4.285 0 01-4.286 4.286 4.285 4.285 0 01-4.285-4.286V40.298h4.285z" fill="#ECB22E"/>
                        <path d="M33.867 38.153a4.285 4.285 0 01-4.285 4.285 4.285 4.285 0 01-4.286-4.285V27.44a4.285 4.285 0 014.286-4.286 4.285 4.285 0 014.285 4.286v10.714z" fill="#ECB22E"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">{ws.teamName}</p>
                      <p className="text-xs text-text-muted">Slack workspace</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded uppercase tracking-tight border border-emerald-100">
                      Active
                    </div>
                    <button
                      onClick={() => handleDisconnectSlack(ws.id)}
                      disabled={disconnecting === ws.id}
                      className="px-2 py-1 text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                    >
                      {disconnecting === ws.id ? "..." : "Disconnect"}
                    </button>
                  </div>
                </div>
              ))}
              {slackWorkspaces.length === 0 && (
                <a
                  href="/api/auth/slack"
                  className="flex items-center justify-between p-4 bg-white hover:bg-zinc-50 rounded-xl border border-dashed border-border-subtle transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-400 group-hover:text-zinc-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-400 group-hover:text-zinc-700 transition-colors">
                        Connect Slack
                      </p>
                      <p className="text-xs text-zinc-400">Not linked</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-zinc-400 group-hover:text-zinc-600 transition-colors flex items-center gap-1">
                    Connect
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </span>
                </a>
              )}

              {/* Google / Gmail — checked from DB account table, not session */}
              {googleConnected ? (
                <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-border-subtle">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm border border-border-subtle flex items-center justify-center">
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">Google / Gmail</p>
                      <p className="text-xs text-text-muted">Connected for email access</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {mainProvider === "google-oauth2" && (
                      <div className="px-2 py-1 bg-zinc-900 text-white text-[10px] font-bold rounded uppercase tracking-tight">
                        Main Account
                      </div>
                    )}
                    <div className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded uppercase tracking-tight border border-emerald-100">
                      Active
                    </div>
                    <button
                      onClick={handleDisconnectGoogle}
                      disabled={disconnecting === "google"}
                      className="px-2 py-1 text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                    >
                      {disconnecting === "google" ? "..." : "Disconnect"}
                    </button>
                  </div>
                </div>
              ) : (
                <a
                  href="/api/auth/connect?connection=google-oauth2"
                  className="flex items-center justify-between p-4 bg-white hover:bg-zinc-50 rounded-xl border border-dashed border-border-subtle transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-500 group-hover:text-zinc-600 transition-colors">
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-500 group-hover:text-zinc-800 transition-colors">Connect Google</p>
                      <p className="text-xs text-zinc-400">Required for Gmail and Calendar</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-zinc-400 group-hover:text-zinc-600 transition-colors flex items-center gap-1">
                    Connect
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </span>
                </a>
              )}

              {/* Notion */}
              {connectedProviders.includes("notion") ? (
                <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-border-subtle">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white">
                      {/* Notion Icon */}
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M4.459 4.208c.739-.115 1.304-.153 2.502-.153h12.556c.424 0 .708.038.937.192.229.135.385.405.443.791l.82 5.097c.077.5.077.788-.231.943-.231.115-.539.077-.847-.116l-2.002-1.543c-.424-.328-.847-.482-1.27-.482-.385 0-.616.115-.963.424l-3.35 2.93c-.462.424-.732.559-1.078.559-.308 0-.616-.115-1.001-.424L6.963 8.35c-.231-.193-.539-.308-.885-.308-.424 0-.77.193-.963.539l-1.309 2.564c-.154.308-.347.5-.616.5-.424 0-.578-.347-.578-.713V5.597c0-.771.213-1.253.848-1.389zm13.19 15.65c0 .385-.231.616-.654.616-.231 0-.462-.115-.808-.347l-2.774-1.928c-.385-.27-.693-.424-1.117-.424-.346 0-.654.116-.924.385l-1.617 1.349v-3.778l3.621-2.93c.307-.269.577-.424.962-.424.347 0 .655.154.924.424l2.311 2.311c.23.23.385.5.385.809v3.965z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">Notion</p>
                      <p className="text-xs text-text-muted">Connected for project notes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded uppercase tracking-tight border border-emerald-100">
                      Active
                    </div>
                    <button
                      onClick={handleDisconnectNotion}
                      disabled={disconnecting === "notion"}
                      className="px-2 py-1 text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                    >
                      {disconnecting === "notion" ? "..." : "Disconnect"}
                    </button>
                  </div>
                </div>
              ) : (
                <a
                  href="/api/auth/notion"
                  className="flex items-center justify-between p-4 bg-white hover:bg-zinc-50 rounded-xl border border-dashed border-border-subtle transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-400 group-hover:text-zinc-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-400 group-hover:text-zinc-700 transition-colors">Connect Notion</p>
                      <p className="text-xs text-zinc-400">Linked to dedicated project pages</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-zinc-400 group-hover:text-zinc-600 transition-colors flex items-center gap-1">
                    Connect
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </span>
                </a>
              )}

              {/* Linear */}
              {connectedProviders.includes("linear") ? (
                <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-border-subtle">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white shadow-sm">
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="17" x2="12" y2="22" />
                        <path d="M5 17h14v-2l-1-7V5a2 2 0 0 1 2-2H4a2 2 0 0 1 2 2v3l-1 7v2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">Linear</p>
                      <p className="text-xs text-text-muted">Connected for task tracking</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded uppercase tracking-tight border border-emerald-100">
                      Active
                    </div>
                    <button
                      onClick={handleDisconnectLinear}
                      disabled={disconnecting === "linear"}
                      className="px-2 py-1 text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                    >
                      {disconnecting === "linear" ? "..." : "Disconnect"}
                    </button>
                  </div>
                </div>
              ) : (
                <a
                  href="/api/auth/linear"
                  className="flex items-center justify-between p-4 bg-white hover:bg-zinc-50 rounded-xl border border-dashed border-border-subtle transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-400 group-hover:text-zinc-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-400 group-hover:text-zinc-700 transition-colors">Connect Linear</p>
                      <p className="text-xs text-zinc-400">Linked to dedicated project boards</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-zinc-400 group-hover:text-zinc-600 transition-colors flex items-center gap-1">
                    Connect
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </span>
                </a>
              )}



            </div>
          </div>

          <div className="pt-4 border-t border-border-subtle flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-text-primary">Disconnect all services</div>
              <button
                onClick={handleLogoutAll}
                className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-bold rounded-lg transition-colors"
              >
                Logout All
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-text-primary">Sign out of your account</div>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 text-sm font-bold rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
