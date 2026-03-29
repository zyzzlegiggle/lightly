import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { SetupModal } from "./SetupModal";
import { Sidebar } from "./Sidebar";
import HomePageClient from "./HomePageClient";

export default async function Home() {
  const session = await auth0.getSession();

  if (!session) {
    redirect("/auth/login");
  }

  return (
    <div className="flex h-screen w-full bg-background font-sans">
      <SetupModal session={session} />
      <Sidebar session={session} />
      <HomePageClient session={session} />
    </div>
  );
}
