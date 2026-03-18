"use client";

import { useState } from "react";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import Link from "next/link";

export default function HomePageClient({ session, projects = [] }: { session: any, projects?: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-8 bg-zinc-50/50">
        <div className="max-w-4xl w-full text-center space-y-12">
          {/* Hero Section */}
          <div className="space-y-4">
            <h1 className="text-5xl font-serif text-foreground tracking-tight italic">
              Another day for building, <span className="text-accent-primary not-italic font-sans font-bold">{session.user.name.split(" ")[0]}?</span>
            </h1>

            <div className="flex items-center justify-center gap-2 text-xl font-bold text-foreground">
              Your projects <span className="text-text-muted font-normal">({projects.length})</span>
            </div>
          </div>

          {/* Project Grid */}
          <div className="flex flex-wrap justify-center gap-6">
            
            {/* Existing Projects Map */}
            {projects.map((p) => (
              <Link href={`/project/${p.id}`} key={p.id}>
                <div className="w-[320px] h-[180px] bg-white rounded-2xl border border-border-subtle shadow-sm hover:shadow-md hover:border-accent-primary transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center space-y-3 group active:scale-[0.98]">
                    <div className="w-12 h-12 rounded bg-zinc-100 flex items-center justify-center mb-2 group-hover:bg-accent-primary/10 transition-colors">
                      <svg className="w-6 h-6 text-zinc-600 group-hover:text-accent-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-text-primary truncate w-64">{p.githubUrl.split('/').pop()?.replace('.git', '') || 'Project'}</h3>
                      <p className="text-text-muted text-xs mt-1 truncate w-64">{p.githubUrl}</p>
                    </div>
                </div>
              </Link>
            ))}

            <div 
              onClick={() => setIsModalOpen(true)}
              className="w-[320px] h-[180px] bg-white rounded-2xl border border-dashed border-zinc-300 shadow-sm hover:shadow-md hover:border-zinc-400 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center space-y-2 group active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-full bg-accent-primary/5 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="font-bold text-lg">Create Project</h3>
              <p className="text-text-muted text-sm">Connect a repository to get started</p>
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
