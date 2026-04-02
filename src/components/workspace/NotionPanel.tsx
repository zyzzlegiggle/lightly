"use client";

export function NotionPanel() {
  return (
    <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col items-center justify-center shrink-0 px-8 text-center pb-16">
      <div className="w-11 h-11 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
        {/* Notion-style icon */}
        <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-zinc-800 mb-1">Notion</p>
      <p className="text-xs text-zinc-400 mb-5">Access and create pages in your workspace.</p>
      <a
        href="/api/auth/login?connection=notion"
        className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors"
      >
        Connect Notion
      </a>
    </div>
  );
}
