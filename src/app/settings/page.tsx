import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Sidebar } from "../Sidebar";
import SettingsPageClient from "./SettingsPageClient";

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session) {
    redirect("/auth");
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
