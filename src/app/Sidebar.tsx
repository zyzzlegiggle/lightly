"use client";

import { useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar({ session }: { session: any }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col border-r border-border-subtle bg-sidebar-bg transition-all duration-300 ${
        isCollapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex items-center justify-end p-2 border-b border-border-subtle group">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded hover:bg-black/[0.05] transition-colors"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? (
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          ) : (
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
          )}
        </button>
      </div>

      <nav className={`flex-1 flex flex-col pt-6 pb-4 overflow-y-auto ${isCollapsed ? "px-2" : "px-4"}`}>
        {/* User Profile */}
        <div className={`flex items-center gap-3 p-2 mb-6 cursor-pointer hover:bg-black/[0.03] rounded-lg transition-colors ${isCollapsed ? "justify-center" : ""}`}>
          {session.user.image ? (
            <img src={session.user.image} alt="User Avatar" className="w-8 h-8 rounded-full shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs shrink-0">
              {session.user.name?.[0] || "?"}
            </div>
          )}
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.user.name}</p>
              {session.user.username && <p className="text-xs text-zinc-500 truncate">@{session.user.username}</p>}
            </div>
          )}
        </div>

        {!isCollapsed && <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 px-2">Workspace</div>}
        
        <div className="space-y-1">
          <Link href="/" className={`flex items-center gap-3 p-2 rounded-lg font-medium cursor-pointer transition-colors ${pathname === '/' ? 'bg-black/[0.05] text-accent-primary' : 'hover:bg-black/[0.03]'} ${isCollapsed ? "justify-center" : ""}`} title={isCollapsed ? "Home" : ""}>
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            {!isCollapsed && <span>Home</span>}
          </Link>
          
          <Link href="/settings" className={`flex items-center gap-3 p-2 rounded-lg font-medium cursor-pointer transition-colors ${pathname === '/settings' ? 'bg-black/[0.05] text-accent-primary' : 'hover:bg-black/[0.03]'} ${isCollapsed ? "justify-center" : ""}`} title={isCollapsed ? "Settings" : ""}>
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {!isCollapsed && <span>Settings</span>}
          </Link>
        </div>
      </nav>

      {/* Text Box at bottom */}
      <div className={`p-4 border-t border-border-subtle ${isCollapsed ? "hidden" : "block"}`}>
        <textarea
          rows={3}
          placeholder="Type notes or commands..."
          className="w-full px-3 py-2 text-sm border border-border-subtle rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent resize-none"
        />
      </div>
      {isCollapsed && (
        <div className="p-4 border-t border-border-subtle flex justify-center">
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
        </div>
      )}
    </aside>
  );
}
