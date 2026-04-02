"use client";

export function SlackPanel() {
  return (
    <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col items-center justify-center shrink-0 px-8 text-center pb-16">
      <div className="w-11 h-11 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-zinc-800 mb-1">Slack</p>
      <p className="text-xs text-zinc-400 mb-5">Post updates and read channels.</p>
      <a
        href="/api/auth/login?connection=slack"
        className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors"
      >
        Connect Slack
      </a>
    </div>
  );
}
