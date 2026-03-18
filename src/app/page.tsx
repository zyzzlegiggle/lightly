import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SetupModal } from "./SetupModal";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth");
  }

  return (
    <div className="flex h-screen w-full bg-background font-sans">
      <SetupModal session={session} />
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-border-subtle bg-sidebar-bg">
        <nav className="flex-1 px-4 pt-8 pb-4 flex flex-col">
          {/* User Profile */}
          <div className="flex items-center gap-3 p-2 mb-6 cursor-pointer hover:bg-black/[0.03] rounded-lg transition-colors">
            {session.user.image ? (
              <img src={session.user.image} alt="User Avatar" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs">
                {session.user.name?.[0] || "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.user.name}</p>
              {session.user.username && <p className="text-xs text-zinc-500 truncate">@{session.user.username}</p>}
            </div>
          </div>

          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 px-2">Workspace</div>
          <div className="space-y-1">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-black/[0.03] font-medium cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              Home
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-8 bg-zinc-50/50">
        <div className="max-w-4xl w-full text-center space-y-12">
          {/* Hero Section */}
          <div className="space-y-4">
            <h1 className="text-5xl font-serif text-foreground tracking-tight italic">
              Another day for building, <span className="text-accent-primary not-italic font-sans font-bold">{session.user.name.split(" ")[0]}?</span>
            </h1>

            <div className="flex items-center justify-center gap-2 text-xl font-bold text-foreground">
              Your projects <span className="text-text-muted font-normal">(0/1)</span>
            </div>
          </div>

          {/* Project Grid / Empty State */}
          <div className="flex justify-center">
            <div className="w-[320px] h-[180px] bg-white rounded-2xl border border-border-subtle shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center justify-center p-8 text-center space-y-2 group">
              <h3 className="font-bold text-lg">Create Project</h3>
              <p className="text-text-muted text-sm">Connect a repository to get started</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
