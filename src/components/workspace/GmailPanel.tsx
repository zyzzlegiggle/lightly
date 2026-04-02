"use client";

export function GmailPanel() {
  return (
    <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col items-center justify-center shrink-0 px-8 text-center pb-16">
      <div className="w-11 h-11 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-zinc-800 mb-1">Gmail</p>
      <p className="text-xs text-zinc-400 mb-5">Read and send emails with AI.</p>
      <a
        href="/api/auth/connect?connection=google-oauth2"
        className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors"
      >
        Connect Gmail
      </a>
    </div>
  );
}
