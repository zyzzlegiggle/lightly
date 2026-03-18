"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function SetupModal({ session }: { session: any }) {
    const [name, setName] = useState(session.user.name || "");
    const [username, setUsername] = useState(session.user.username || "");
    const [isPending, setIsPending] = useState(false);
    const router = useRouter();

    if (session.user.username) {
        return null; // hide if they already have a username
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !name) return;
        setIsPending(true);
        try {
            await authClient.updateUser({
                name: name,
                username: username,
            } as any);
            router.refresh(); // Refresh the page to reflect the new state
        } catch (error) {
            console.error(error);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl border border-zinc-200">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold tracking-tight">Complete your profile</h2>
                    <p className="text-sm text-zinc-500 mt-2">Almost there! Choose a username and set your display name.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2 text-left">
                        <label className="text-sm font-medium">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
                            required
                        />
                    </div>
                    <div className="space-y-2 text-left">
                        <label className="text-sm font-medium">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
                            required
                            placeholder="johndoe"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isPending}
                        className="w-full bg-zinc-900 text-white rounded-md h-10 font-medium hover:bg-zinc-800 disabled:opacity-50"
                    >
                        {isPending ? "Saving..." : "Continue"}
                    </button>
                </form>
            </div>
        </div>
    );
}
