import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SetupModal } from "./SetupModal";
import { Sidebar } from "./Sidebar";

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
      <Sidebar session={session} />

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
