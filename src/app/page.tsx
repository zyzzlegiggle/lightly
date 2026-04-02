import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { user } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { SetupModal } from "./SetupModal";
import { Sidebar } from "./Sidebar";
import HomePageClient from "./HomePageClient";

export default async function Home() {
  const session = await auth0.getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  const dbUser = await db.query.user.findFirst({
    where: eq(user.id, session.user.sub),
  });

  const profile = {
    name: dbUser?.name || session.user.name,
    email: dbUser?.email || session.user.email,
    image: dbUser?.image || session.user.picture,
    username: dbUser?.username || session.user.nickname,
  };

  return (
    <div className="flex h-screen w-full bg-background font-sans">
      <SetupModal session={session} />
      <Sidebar session={session} profile={profile} />
      <HomePageClient session={session} />
    </div>
  );
}
