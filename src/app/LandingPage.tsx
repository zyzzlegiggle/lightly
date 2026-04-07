"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-black selection:text-white">
      {/* Navigation */}
      <nav 
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          scrolled ? "bg-background/80 backdrop-blur-md border-b border-border-subtle py-4" : "bg-transparent py-8"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="font-serif text-2xl tracking-tight lowercase">lightly</div>
          <div className="flex items-center gap-8">
            <Link href="/api/auth/login" className="text-sm font-medium hover:opacity-60 transition-opacity">
              log in
            </Link>
            <Link 
              href="/api/auth/login" 
              className="bg-white text-black border border-black/10 px-5 py-2.5 rounded-full text-sm font-bold hover:bg-black hover:text-white transition-all shadow-sm active:scale-95"
            >
              get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-32 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-8 animate-slide-up">
          <h1 className="text-5xl md:text-7xl font-serif leading-[1.1] tracking-tight italic">
            Modify your projects <br /> 
            <span className="not-italic opacity-40">from anytime, anywhere</span>
          </h1>
          <p className="text-lg md:text-xl text-text-muted max-w-2xl mx-auto font-medium leading-relaxed">
            Lightly is the minimal workspace for the modern developer. 
            Connect your repos, deploy agents, and build without boundaries.
          </p>
          <div className="pt-4">
            <Link 
              href="/api/auth/login" 
              className="inline-flex items-center gap-2 bg-white text-black border border-black/10 px-8 py-4 rounded-full text-lg font-bold hover:gap-4 hover:bg-black hover:text-white transition-all group shadow-md"
            >
              start building 
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            {/* Feature 1: GitHub */}
            <div className="group space-y-6 p-8 rounded-3xl bg-white/30 border border-black/10 hover:bg-white transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.02)]">
              <div className="w-12 h-12 bg-white border border-black/5 rounded-2xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors duration-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h3 className="text-2xl font-serif italic">github-sync</h3>
              <p className="text-text-muted leading-relaxed">
                Connect your repositories in seconds. Seamlessly bridge your local development with cloud-based power.
              </p>
            </div>

            {/* Feature 2: Agents */}
            <div className="group space-y-6 p-8 rounded-3xl bg-white/30 border border-black/10 hover:bg-white transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.02)]">
              <div className="w-12 h-12 bg-white border border-black/5 rounded-2xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors duration-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-2xl font-serif italic">agents</h3>
              <p className="text-text-muted leading-relaxed">
                Deploy intelligent agents that understand your codebase. Automate complex tasks and accelerate your workflow.
              </p>
            </div>

            {/* Feature 3: Workspaces */}
            <div className="group space-y-6 p-8 rounded-3xl bg-white/30 border border-black/10 hover:bg-white transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.02)]">
              <div className="w-12 h-12 bg-white border border-black/5 rounded-2xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors duration-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-2xl font-serif italic">workspaces</h3>
              <p className="text-text-muted leading-relaxed">
                Personalized environments for every project. Your entire development stack, accessible from any browser.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="font-serif text-xl tracking-tight lowercase opacity-40">lightly</div>
          <div className="text-sm text-text-muted">
            &copy; {new Date().getFullYear()} lightly. build beyond limits.
          </div>
        </div>
      </footer>
    </div>
  )
}
