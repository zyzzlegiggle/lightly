"use client";

import { useState, useEffect } from "react";

interface SlackWorkspace {
  id: string;
  teamId: string;
  teamName: string;
}

interface Profile {
  name: string;
  email: string;
  image: string | null;
  username: string | null;
}

interface ProfileModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ projectId, isOpen, onClose }: ProfileModalProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [slackWorkspaces, setSlackWorkspaces] = useState<SlackWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        const [profRes, slackRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/slack/workspaces")
        ]);

        if (profRes.ok) {
          const data = await profRes.json();
          setProfile({
            name: data.name,
            email: data.email,
            image: data.picture,
            username: data.nickname
          });
        }

        if (slackRes.ok) {
          const data = await slackRes.json();
          setSlackWorkspaces(data.workspaces || []);
        }
        
        const providers = [];
        const [gRes, lRes, nRes] = await Promise.all([
          fetch("/api/calendar/events?maxResults=1").catch(() => ({ ok: false })),
          fetch("/api/linear/projects").catch(() => ({ ok: false })),
          fetch("/api/notion/pages").catch(() => ({ ok: false }))
        ]);
        
        if (gRes.ok) providers.push("google-oauth2");
        if (lRes.ok) providers.push("linear");
        if (nRes.ok) providers.push("notion");
        
        setConnectedProviders(providers);

      } catch (err) {
        console.error("Failed to fetch profile data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen]);

  const handleDisconnect = async (service: string, id?: string) => {
    setDisconnecting(id || service);
    try {
      let url = "";
      if (service === "slack") url = `/api/slack/workspaces/${id}`;
      else if (service === "google") url = "/api/auth/google/disconnect";
      else if (service === "linear") url = "/api/auth/linear/disconnect";
      else if (service === "notion") url = "/api/auth/notion/disconnect";

      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        if (service === "slack") {
          setSlackWorkspaces(prev => prev.filter(w => w.id !== id));
        } else {
          setConnectedProviders(prev => prev.filter(p => p !== (service === "google" ? "google-oauth2" : service)));
        }
      }
    } catch (err) {
      console.error(`Failed to disconnect ${service}`, err);
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSignOut = () => {
    window.location.href = "/api/auth/logout";
  };

  if (!isOpen) return null;

  const returnTo = encodeURIComponent(`/project/${projectId}?tab=chat&profileOpen=true`);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-widest">Account Profile</h2>
            <button 
                onClick={onClose}
                className="p-2 hover:bg-zinc-200 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>

        <div className="overflow-y-auto max-h-[70vh] p-6">
            {loading ? (
                <div className="py-12 flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin mb-4" />
                    <p className="text-xs text-zinc-400 font-medium">Loading details...</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* User Info */}
                    <div className="flex items-center gap-4">
                        {profile?.image ? (
                            <img src={profile.image} alt="" className="w-16 h-16 rounded-2xl shadow-sm border-2 border-white" />
                        ) : (
                            <div className="w-16 h-16 rounded-2xl bg-zinc-200 flex items-center justify-center text-2xl font-bold text-zinc-500 border-2 border-white shadow-sm">
                                {profile?.name?.[0]}
                            </div>
                        )}
                        <div className="min-w-0">
                            <h3 className="text-base font-bold text-zinc-900 truncate">{profile?.name}</h3>
                            <p className="text-sm text-zinc-500 truncate">{profile?.email}</p>
                            <button 
                                onClick={handleSignOut}
                                className="text-[11px] font-bold text-red-500 hover:text-red-700 mt-1 transition-colors uppercase tracking-wider underline underline-offset-4"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>

                    {/* Services Section */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">Linked Services</h3>
                        
                        <div className="grid grid-cols-1 gap-3">
                            <ServiceRow 
                                name="Google & Gmail"
                                icon={<GoogleIcon />}
                                connected={connectedProviders.includes("google-oauth2")}
                                onConnect={`/api/auth/connect?connection=google-oauth2&returnTo=${returnTo}`}
                                onDisconnect={() => handleDisconnect("google")}
                                isDisconnecting={disconnecting === "google"}
                            />

                            <ServiceRow 
                                name="Linear"
                                icon={<LinearIcon />}
                                connected={connectedProviders.includes("linear")}
                                onConnect={`/api/auth/linear?returnTo=${returnTo}`}
                                onDisconnect={() => handleDisconnect("linear")}
                                isDisconnecting={disconnecting === "linear"}
                            />

                            <ServiceRow 
                                name="Notion"
                                icon={<NotionIcon />}
                                connected={connectedProviders.includes("notion")}
                                onConnect={`/api/auth/notion?returnTo=${returnTo}`}
                                onDisconnect={() => handleDisconnect("notion")}
                                isDisconnecting={disconnecting === "notion"}
                            />

                            {slackWorkspaces.map(ws => (
                                <ServiceRow 
                                    key={ws.id}
                                    name={ws.teamName}
                                    icon={<SlackIcon />}
                                    connected={true}
                                    onDisconnect={() => handleDisconnect("slack", ws.id)}
                                    isDisconnecting={disconnecting === ws.id}
                                    subtitle="Slack"
                                />
                            ))}
                            
                            {!slackWorkspaces.length && (
                                <a
                                    href={`/api/auth/slack?returnTo=${returnTo}`}
                                    className="flex items-center justify-between p-4 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 border-dashed rounded-2xl transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-zinc-400 group-hover:text-zinc-600 border border-zinc-100 transition-colors">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                            </svg>
                                        </div>
                                        <span className="text-[11px] font-bold text-zinc-400 group-hover:text-zinc-600 transition-colors uppercase tracking-wider">Connect Slack</span>
                                    </div>
                                    <svg className="w-4 h-4 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        
        <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex justify-end">
            <button 
                onClick={onClose}
                className="px-6 py-2.5 bg-zinc-900 text-white text-xs font-bold rounded-xl hover:bg-zinc-800 transition-all uppercase tracking-wider"
            >
                Done
            </button>
        </div>
      </div>
    </div>
  );
}

function ServiceRow({ 
  name, 
  icon, 
  connected, 
  onConnect, 
  onDisconnect, 
  isDisconnecting,
  subtitle
}: { 
  name: string; 
  icon: React.ReactNode; 
  connected: boolean; 
  onConnect?: string; 
  onDisconnect: () => void; 
  isDisconnecting: boolean;
  subtitle?: string;
}) {
  return (
    <div className={`p-4 rounded-2xl border transition-all ${connected ? 'bg-white border-zinc-200' : 'bg-zinc-50/50 border-zinc-100'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-zinc-100 bg-white">
            {icon}
          </div>
          <div className="min-w-0">
            <h4 className={`text-xs font-bold truncate ${connected ? 'text-zinc-800' : 'text-zinc-400'}`}>{name}</h4>
            <p className="text-[10px] text-zinc-400 truncate font-medium uppercase tracking-tight">{subtitle || (connected ? 'Connected' : 'Not linked')}</p>
          </div>
        </div>
        {connected ? (
          <button
            onClick={onDisconnect}
            disabled={isDisconnecting}
            className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30 uppercase tracking-tight border border-zinc-100"
          >
            {isDisconnecting ? "..." : "Sign Out"}
          </button>
        ) : (
          <a
            href={onConnect}
            className="text-[10px] font-bold text-zinc-600 hover:text-zinc-900 bg-white px-3 py-1.5 rounded-lg border border-zinc-200 shadow-sm transition-all uppercase tracking-wider"
          >
            Connect
          </a>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" />
    </svg>
  );
}

function SlackIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 54 54" fill="none">
      <path d="M19.712 33.867a4.285 4.285 0 01-4.285 4.286 4.285 4.285 0 01-4.286-4.286 4.285 4.285 0 014.286-4.285h4.285v4.285z" fill="#E01E5A"/>
      <path d="M21.857 33.867a4.285 4.285 0 014.286-4.285 4.285 4.285 0 014.285 4.285v10.714a4.285 4.285 0 01-4.285 4.286 4.285 4.285 0 01-4.286-4.286V33.867z" fill="#E01E5A"/>
      <path d="M26.143 19.712a4.285 4.285 0 01-4.286-4.285 4.285 4.285 0 014.286-4.286 4.285 4.285 0 014.285 4.286v4.285H26.143z" fill="#36C5F0"/>
      <path d="M26.143 21.857a4.285 4.285 0 014.285 4.286 4.285 4.285 0 01-4.285 4.285H15.427a4.285 4.285 0 01-4.286-4.285 4.285 4.285 0 014.286-4.286H26.143z" fill="#36C5F0"/>
      <path d="M40.298 26.143a4.285 4.285 0 014.285 4.285 4.285 0 01-4.285 4.286 4.285 4.285 0 01-4.286-4.286V26.143h4.286z" fill="#2EB67D"/>
      <path d="M38.153 26.143a4.285 4.285 0 01-4.285-4.286 4.285 4.285 0 014.285-4.285h10.714a4.285 4.285 0 014.286 4.285 4.285 4.285 0 01-4.286 4.286H38.153z" fill="#2EB67D"/>
      <path d="M33.867 40.298a4.285 4.285 0 014.286 4.285 4.285 0 01-4.286 4.286 4.285 4.285 0 01-4.285-4.286V40.298h4.285z" fill="#ECB22E"/>
      <path d="M33.867 38.153a4.285 4.285 0 01-4.285 4.285 4.285 0 01-4.286-4.285V27.44a4.285 4.285 0 014.286-4.286 4.285 4.285 0 014.285 4.286v10.714z" fill="#ECB22E"/>
    </svg>
  );
}

function NotionIcon() {
  return (
    <svg className="w-4 h-4 fill-current text-zinc-900" viewBox="0 0 24 24">
      <path d="M4.459 4.208c.739-.115 1.304-.153 2.502-.153h12.556c.424 0 .708.038.937.192.229.135.385.405.443.791l.82 5.097c.077.5.077.788-.231.943-.231.115-.539.077-.847-.116l-2.002-1.543c-.424-.328-.847-.482-1.27-.482-.385 0-.616.115-.963.424l-3.35 2.93c-.462.424-.732.559-1.078.559-.308 0-.616-.115-1.001-.424L6.963 8.35c-.231-.193-.539-.308-.885-.308-.424 0-.77.193-.963.539l-1.309 2.564c-.154.308-.347.5-.616.5-.424 0-.578-.347-.578-.713V5.597c0-.771.213-1.253.848-1.389zm13.19 15.65c0 .385-.231.616-.654.616-.231 0-.462-.115-.808-.347l-2.774-1.928c-.385-.27-.693-.424-1.117-.424-.346 0-.654.116-.924.385l-1.617 1.349v-3.778l3.621-2.93c.307-.269.577-.424.962-.424.347 0 .655.154.924.424l2.311 2.311c.23.23.385.5.385.809v3.965z" />
    </svg>
  );
}

function LinearIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-2l-1-7V5a2 2 0 0 1 2-2H4a2 2 0 0 1 2 2v3l-1 7v2z" />
    </svg>
  );
}
