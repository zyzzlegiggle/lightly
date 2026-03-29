import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { Sidebar } from "../Sidebar";
import SettingsPageClient from "./SettingsPageClient";

export default async function SettingsPage() {
  const session = await auth0.getSession();

  if (!session) {
    redirect("/auth/login");
  }

  return (
    <div className="flex h-screen w-full bg-background font-sans">
      <Sidebar session={session} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-4xl mx-auto w-full">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>
          <SettingsPageClient session={session} />
        </div>
      </main>
    </div>
  );
}
