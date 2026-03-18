"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function SettingsPageClient({ session }: { session: any }) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/auth");
        },
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* Account Section */}
      <section className="bg-white border border-border-subtle rounded-xl p-8 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Account Settings</h2>
            <p className="text-sm text-text-muted mt-1">Manage your profile and linked accounts.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-zinc-50 rounded-xl border border-border-subtle">
            {session.user.image ? (
              <img src={session.user.image} alt="" className="w-12 h-12 rounded-full ring-2 ring-white" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-zinc-200 flex items-center justify-center text-lg font-bold">
                {session.user.name?.[0]}
              </div>
            )}
            <div className="flex-1">
              <p className="font-bold text-text-primary">{session.user.name}</p>
              <p className="text-sm text-text-muted">{session.user.email}</p>
              {session.user.username && <p className="text-xs text-accent-primary font-medium mt-1">@{session.user.username}</p>}
            </div>
          </div>

          <div className="pt-4 border-t border-border-subtle flex flex-col gap-4">
             <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-text-primary">Sign out of all devices</div>
                <button 
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                  className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoggingOut ? "Signing out..." : "Sign Out"}
                </button>
             </div>
          </div>
        </div>
      </section>
    </div>
  );
}
