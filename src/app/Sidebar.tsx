"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ProjectSettingsModal } from "@/components/ProjectSettingsModal";

interface Project {
  id: string;
  repoId: string;
  githubUrl: string;
  lastPreviewUrl: string | null;
  createdAt: string;
  doAppId?: string | null;
  appSpecRaw?: any;
}

interface Profile {
  name: string;
  email: string;
  image: string | null;
  username: string | null;
}

export function Sidebar({ session, profile, onNewProject }: { session: any; profile?: Profile; onNewProject?: () => void }) {
  // Use DB profile if available, fall back to session for backwards compat
  const displayName = profile?.name || session.user.name;
  const displayImage = profile?.image || session.user.picture;
  const displayUsername = profile?.username || session.user.nickname;
  const [isCollapsed, setIsCollapsed] = useState(false);
   const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Fetch projects
   const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProjects(); }, []);

  // Delete project
  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Remove this project? The Droplet will also be destroyed.")) return;
    
    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${id}/delete`, { method: "DELETE" });
      if (res.ok) {
        setProjects((p) => p.filter((proj) => proj.id !== id));
        // If we're on the deleted project's page, go home
        if (pathname === `/project/${id}`) router.push("/");
      }
    } catch {
      alert("Failed to remove project");
    } finally {
      setDeletingId(null);
    }
  };

  const openSettings = (e: React.MouseEvent, proj: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setSettingsProject(proj);
  };

  // Extract repo name from GitHub URL
  const repoName = (url: string) => {
    const parts = url.replace("https://github.com/", "").replace(".git", "").split("/");
    return parts[parts.length - 1] || "project";
  };

  return (
    <aside
      className={`flex flex-col border-r border-border-subtle bg-sidebar-bg transition-all duration-300 ${
        isCollapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Settings Modal */}
      <ProjectSettingsModal 
        isOpen={!!settingsProject} 
        onClose={() => setSettingsProject(null)} 
        project={settingsProject} 
        onUpdated={fetchProjects}
      />

      <div className={`flex items-center p-3 border-b border-border-subtle bg-sidebar-bg/50 backdrop-blur-md sticky top-0 z-10 ${isCollapsed ? "flex-col gap-4 py-4 justify-center" : "justify-between"}`}>
        {isCollapsed ? (
          <Link href="/" className="w-10 h-10 border border-border-subtle rounded-xl flex items-center justify-center shadow-sm hover:scale-110 hover:shadow-md transition-all active:scale-95">
             <span className="font-serif text-lg lowercase">l</span>
          </Link>
        ) : (
          <Link href="/" className="flex items-center group/logo hover:opacity-90 transition-all px-1">
            <span className="font-serif text-2xl tracking-tighter lowercase">lightly</span>
          </Link>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg hover:bg-black/[0.05] text-text-muted hover:text-foreground transition-all"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? (
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          ) : (
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
          )}
        </button>
      </div>

      <nav className={`flex-1 flex flex-col pt-4 pb-4 overflow-y-auto ${isCollapsed ? "px-2" : "px-3"}`}>
        {/* User Profile */}
        <div className={`flex items-center gap-3 p-2 mb-4 cursor-pointer hover:bg-black/[0.03] rounded-lg transition-colors ${isCollapsed ? "justify-center" : ""}`}>
          {displayImage ? (
            <img src={displayImage} alt="Avatar" className="w-8 h-8 rounded-full shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs shrink-0">
              {displayName?.[0] || "?"}
            </div>
          )}
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              {displayUsername && <p className="text-xs text-zinc-500 truncate">@{displayUsername}</p>}
            </div>
          )}
        </div>

        {/* Nav */}
        <div className="space-y-0.5 mb-4">
          <Link href="/" className={`flex items-center gap-3 p-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${pathname === '/' ? 'bg-black/[0.05] text-accent-primary' : 'hover:bg-black/[0.03]'} ${isCollapsed ? "justify-center" : ""}`} title={isCollapsed ? "Home" : ""}>
            <svg className="w-4.5 h-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            {!isCollapsed && <span>Home</span>}
          </Link>
          <Link href="/settings" className={`flex items-center gap-3 p-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${pathname === '/settings' ? 'bg-black/[0.05] text-accent-primary' : 'hover:bg-black/[0.03]'} ${isCollapsed ? "justify-center" : ""}`} title={isCollapsed ? "Settings" : ""}>
            <svg className="w-4.5 h-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {!isCollapsed && <span>Settings</span>}
          </Link>
          <a href="/api/auth/logout-all" className={`flex items-center gap-3 p-2 rounded-lg text-sm font-medium cursor-pointer transition-colors hover:bg-red-50 hover:text-red-600 text-zinc-500 ${isCollapsed ? "justify-center" : ""}`} title={isCollapsed ? "Sign Out" : ""}>
            <svg className="w-4.5 h-4.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            {!isCollapsed && <span>Sign Out</span>}
          </a>
        </div>

        {/* ── Projects ── */}
        {!isCollapsed && (
          <div className="flex-1">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest opacity-60">projects</span>
              {onNewProject && (
                <button onClick={onNewProject} className="p-1 rounded hover:bg-black/[0.05] text-text-muted hover:text-accent-primary transition-colors" title="New Project">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2 px-2 animate-pulse-subtle">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <div className="w-6 h-6 rounded-md bg-zinc-100 animate-skeleton" />
                    <div className="h-3 w-24 bg-zinc-100 rounded animate-skeleton" />
                  </div>
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="px-2 py-3 text-center">
                <p className="text-xs text-zinc-400">No projects yet</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {projects.map((proj) => {
                  const name = repoName(proj.githubUrl);
                  const isActive = pathname === `/project/${proj.id}`;

                  return (
                    <Link
                      key={proj.id}
                      href={`/project/${proj.id}`}
                      className={`group flex items-center gap-2.5 p-2 rounded-lg text-sm transition-all ${
                        isActive
                          ? "bg-accent-primary/10 text-accent-primary font-medium"
                          : "hover:bg-black/[0.03] text-zinc-700"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold ${
                        isActive ? "bg-accent-primary/20 text-accent-primary" : "bg-zinc-100 text-zinc-500"
                      }`}>
                        {name[0]?.toUpperCase()}
                      </div>
                      <span className="flex-1 truncate text-[13px]">{name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => openSettings(e, proj)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-all shrink-0"
                          title="Settings"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </button>
                        <button
                          onClick={(e) => deleteProject(proj.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 hover:text-red-500 text-zinc-400 transition-all shrink-0"
                          title="Remove project"
                        >
                          {deletingId === proj.id ? (
                            <div className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          )}
                        </button>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isCollapsed && projects.length > 0 && (
          <div className="space-y-1 mt-2">
            {projects.map((proj) => {
              const name = repoName(proj.githubUrl);
              const isActive = pathname === `/project/${proj.id}`;
              return (
                <Link
                  key={proj.id}
                  href={`/project/${proj.id}`}
                  className={`flex justify-center p-2 rounded-lg transition-colors ${isActive ? "bg-accent-primary/10" : "hover:bg-black/[0.03]"}`}
                  title={name}
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${
                    isActive ? "bg-accent-primary/20 text-accent-primary" : "bg-zinc-100 text-zinc-500"
                  }`}>
                    {name[0]?.toUpperCase()}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </nav>
    </aside>
  );
}
