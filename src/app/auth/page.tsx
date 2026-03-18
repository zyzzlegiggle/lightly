"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button"; // I'll create this or use a basic button
import { Input } from "@/components/ui/input";   // I'll create this or use a basic input
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Github, Chrome, Mail, Loader2 } from "lucide-react";

export default function AuthPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [isPending, setIsPending] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);

    const handleEmailAuth = async () => {
        setIsPending(true);
        try {
            if (isSignUp) {
                await authClient.signUp.email({
                    email,
                    password,
                    name,
                });
            } else {
                await authClient.signIn.email({
                    email,
                    password,
                });
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsPending(false);
        }
    };

    const handleSocialAuth = async (provider: "github" | "google") => {
        await authClient.signIn.social({
            provider,
            callbackURL: "/",
        });
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50/50 p-4">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h1 className="text-4xl font-serif italic tracking-tight text-foreground">Lightly</h1>
                    <p className="mt-2 text-zinc-500">The designer's playground</p>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
                    <div className="space-y-2 text-center">
                        <h2 className="text-2xl font-bold tracking-tight">{isSignUp ? "Create an account" : "Welcome back"}</h2>
                        <p className="text-sm text-zinc-500">
                            {isSignUp ? "Enter your details to get started" : "Enter your credentials to continue"}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => handleSocialAuth("github")}
                            className="flex items-center justify-center gap-2 px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors font-medium text-sm"
                        >
                            <Github className="w-4 h-4" />
                            GitHub
                        </button>
                        <button
                            onClick={() => handleSocialAuth("google")}
                            className="flex items-center justify-center gap-2 px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors font-medium text-sm"
                        >
                            <Chrome className="w-4 h-4" />
                            Google
                        </button>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-zinc-200" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-zinc-500">Or continue with email</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {isSignUp && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    placeholder="John Doe"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Email
                            </label>
                            <input
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <button
                            onClick={handleEmailAuth}
                            disabled={isPending}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 w-full"
                        >
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isSignUp ? "Create Account" : "Sign In"}
                        </button>
                    </div>

                    <div className="text-center text-sm text-zinc-500">
                        {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                        <button
                            onClick={() => setIsSignUp(!isSignUp)}
                            className="font-medium text-zinc-950 underline underline-offset-4 hover:text-zinc-800"
                        >
                            {isSignUp ? "Sign in" : "Sign up"}
                        </button>
                    </div>
                </div>

                <div className="text-center text-xs text-zinc-400">
                    By clicking continue, you agree to our{" "}
                    <a href="#" className="underline">Terms of Service</a> and <a href="#" className="underline">Privacy Policy</a>.
                </div>
            </div>
        </div>
    );
}
