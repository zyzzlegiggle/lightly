import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SetupModal } from "./SetupModal";
import { Sidebar } from "./Sidebar";
import HomePageClient from "./HomePageClient";

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
      <HomePageClient session={session} />
    </div>
  );
}
