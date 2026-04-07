"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CreateProjectModal } from "@/components/CreateProjectModal";

interface Project {
  id: string;
  repoId: string;
  githubUrl: string;
  lastPreviewUrl: string | null;
  createdAt: string;
}

export default function HomePageClient({ session }: { session: any }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    fetchProjects();
  }, []);

  const repoName = (url: string) => {
    const parts = url.replace("https://github.com/", "").replace(".git", "").split("/");
    return parts[parts.length - 1] || "project";
  };

  return (
    <>
      <main className="flex-1 overflow-y-auto p-12 bg-zinc-50/50">
        <div className="max-w-4xl mx-auto space-y-12 animate-slide-up">
          {/* Hero */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <h1 className="text-4xl font-serif text-foreground tracking-tight italic">
                Another day for building, <span className="text-accent-primary not-italic font-sans font-bold">{session.user.name?.split(" ")[0]}?</span>
              </h1>
              <p className="text-text-muted text-sm px-1">Welcome back. Here are your active building sessions.</p>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2.5 bg-gradient-to-r from-zinc-800 to-zinc-950 text-white font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-md active:scale-[0.98] shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Link New Repository
            </button>
          </div>

          {/* Project List */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loading ? (
                // Skeleton
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white border border-border-subtle rounded-2xl p-6 space-y-4 animate-pulse-subtle">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 animate-skeleton" />
                      <div className="h-4 w-32 bg-zinc-100 rounded animate-skeleton" />
                    </div>
                    <div className="h-2 w-full bg-zinc-50 rounded animate-skeleton" />
                  </div>
                ))
              ) : projects.length === 0 ? (
                <div className="col-span-full py-16 flex flex-col items-center justify-center border-2 border-dashed border-border-subtle rounded-3xl bg-white/50 text-center">
                  <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-3.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-text-primary">No projects yet</h3>
                  <p className="text-text-muted mt-1 max-w-[240px]">Link a GitHub repository to start building your application.</p>
                  <button 
                    onClick={() => setIsModalOpen(true)}
                    className="mt-6 text-sm font-bold text-accent-primary hover:underline underline-offset-4"
                  >
                    Connect your first repo
                  </button>
                </div>
              ) : (
                projects.map((proj) => {
                  const name = repoName(proj.githubUrl);
                  return (
                    <Link
                      key={proj.id}
                      href={`/project/${proj.id}`}
                      className="group bg-white border border-border-subtle rounded-2xl p-6 hover:shadow-lg hover:border-accent-primary/20 transition-all duration-300"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center text-xl font-bold text-zinc-500 group-hover:bg-accent-primary group-hover:text-white transition-all duration-300">
                          {name[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-lg group-hover:text-accent-primary transition-colors truncate">
                            {name}
                          </h3>
                          <p className="text-xs text-text-muted truncate mt-0.5">
                            {proj.githubUrl.replace("https://github.com/", "")}
                          </p>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        session={session}
      />
    </>
  );
}
