import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { user, account } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { Sidebar } from "../Sidebar";
import SettingsPageClient from "./SettingsPageClient";

export default async function SettingsPage() {
  const session = await auth0.getSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  const userId = session.user.sub;

  // Read profile from DB (stable, not affected by service connections)
  const dbUser = await db.query.user.findFirst({
    where: eq(user.id, userId),
  });

  // Read connected services from the account table
  const connectedAccounts = await db.query.account.findMany({
    where: eq(account.userId, userId),
  });

  const profile = {
    name: dbUser?.name || session.user.name || "User",
    email: dbUser?.email || session.user.email || "",
    image: dbUser?.image || session.user.picture || null,
    username: dbUser?.username || session.user.nickname || null,
  };

  const connectedProviders = connectedAccounts.map((a) => a.providerId);
  const mainProvider = userId.split("|")[0]; // e.g. "github" or "google-oauth2"

  return (
    <div className="flex h-screen w-full bg-background font-sans">
      <Sidebar session={session} profile={profile} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-4xl mx-auto w-full">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>
          <SettingsPageClient 
            profile={profile} 
            connectedProviders={connectedProviders} 
            mainProvider={mainProvider}
          />
        </div>
      </main>
    </div>
  );
}
