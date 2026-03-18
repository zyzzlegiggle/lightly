"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Github, Loader2 } from "lucide-react";

export default function AuthPage() {
    const [isPending, setIsPending] = useState(false);

    const handleGitHubAuth = async () => {
        setIsPending(true);
        await authClient.signIn.social({
            provider: "github",
            callbackURL: "/",
        });
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50/50 p-4">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <img src="/logo.png" alt="Lightly" className="h-10 mx-auto object-contain mb-2" />
                    <p className="text-zinc-500 text-sm">The designer's playground</p>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
                    <div className="space-y-2 text-center">
                        <h2 className="text-2xl font-bold tracking-tight">Welcome to Lightly</h2>
                        <p className="text-sm text-zinc-500">
                            Sign in with GitHub to connect your repos and start designing
                        </p>
                    </div>

                    <button
                        onClick={handleGitHubAuth}
                        disabled={isPending}
                        className="flex items-center justify-center gap-2.5 w-full px-4 py-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Github className="w-5 h-5" />
                        )}
                        Continue with GitHub
                    </button>

                    <p className="text-center text-xs text-zinc-400 leading-relaxed">
                        We&apos;ll use your GitHub account to access and edit your repositories.
                        No other permissions are required.
                    </p>
                </div>

                <div className="text-center text-xs text-zinc-400">
                    By clicking continue, you agree to our{" "}
                    <a href="#" className="underline">Terms of Service</a> and <a href="#" className="underline">Privacy Policy</a>.
                </div>
            </div>
        </div>
    );
}
