import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SetupModal } from "./SetupModal";
import { Sidebar } from "./Sidebar";
import HomePageClient from "./HomePageClient";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq } from "drizzle-orm";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth");
  }

  // Fetch the user's generated projects
  const userProjects = await db.select().from(project).where(eq(project.userId, session.user.id));

  return (
    <div className="flex h-screen w-full bg-background font-sans">
      <SetupModal session={session} />
      <Sidebar session={session} />
      <HomePageClient session={session} projects={userProjects} />
    </div>
  );
}
