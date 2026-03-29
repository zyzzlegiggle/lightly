"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPageClient({ session }: { session: any }) {
  const router = useRouter();

  const handleSignOut = () => {
    // Auth0 handles sign-out via its built-in route
    window.location.href = "/auth/logout";
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
            {session.user.picture ? (
              <img src={session.user.picture} alt="" className="w-12 h-12 rounded-full ring-2 ring-white" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-zinc-200 flex items-center justify-center text-lg font-bold">
                {session.user.name?.[0]}
              </div>
            )}
            <div className="flex-1">
              <p className="font-bold text-text-primary">{session.user.name}</p>
              <p className="text-sm text-text-muted">{session.user.email}</p>
              {session.user.nickname && <p className="text-xs text-accent-primary font-medium mt-1">@{session.user.nickname}</p>}
            </div>
          </div>

          {/* Connected Accounts */}
          <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-bold text-emerald-700">GitHub Connected</span>
            </div>
            <p className="text-xs text-emerald-600">
              Your GitHub account is securely managed via Auth0 Token Vault. Tokens are short-lived and never stored in our database.
            </p>
          </div>

          <div className="pt-4 border-t border-border-subtle flex flex-col gap-4">
             <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-text-primary">Sign out of your account</div>
                <button 
                  onClick={handleSignOut}
                  className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-bold rounded-lg transition-colors"
                >
                  Sign Out
                </button>
             </div>
          </div>
        </div>
      </section>
    </div>
  );
}
