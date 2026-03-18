import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import SettingsPageClient from "./SettingsPageClient";

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session) {
    redirect("/auth");
  }

  // Fetch linked accounts from BetterAuth directly if possible or do it from client wrapper
  // We'll pass session and basic info to the client component for UI simplicity
  return (
    <div className="p-8 max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <SettingsPageClient session={session} />
    </div>
  );
}
