"use client";

import { useState } from "react";
import { CreateProjectModal } from "@/components/CreateProjectModal";

export default function HomePageClient({ session }: { session: any }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-8 bg-zinc-50/50">
        <div className="max-w-lg w-full text-center space-y-8">
          {/* Hero */}
          <div className="space-y-3">
            <h1 className="text-4xl font-serif text-foreground tracking-tight italic">
              Another day for building, <span className="text-accent-primary not-italic font-sans font-bold">{session.user.name?.split(" ")[0]}?</span>
            </h1>
            <p className="text-text-muted text-sm">Select a project from the sidebar or create a new one.</p>
          </div>

          {/* Create */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2.5 bg-gradient-to-r from-zinc-800 to-zinc-950 text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-all shadow-md active:scale-[0.98]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Link New Repository
          </button>
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
