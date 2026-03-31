"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────

export interface PendingChange {
  id: string;
  file: string;
  content: string;
  originalContent?: string;
  description: string;
  timestamp: number;
}

interface ChangesPanelProps {
  changes: PendingChange[];
  onDiscard: (id: string) => void;
  onDiscardAll: () => void;
  onConfirmAll: () => void;
  isConfirming: boolean;
  isReverting: boolean;
}

// ── Component ──────────────────────────────────────────────────────────

export function ChangesPanel({
  changes,
  onDiscard,
  onDiscardAll,
  onConfirmAll,
  isConfirming,
  isReverting,
}: ChangesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (changes.length === 0) return null;

  // Collapsed badge
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="fixed top-16 right-4 z-30 flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 shadow-lg hover:shadow-xl transition-all group"
      >
        <div className="relative">
          <svg className="w-4 h-4 text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-zinc-800 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {changes.length}
          </div>
        </div>
        <span className="text-xs font-semibold text-zinc-700 group-hover:text-zinc-900 transition-colors">
          {changes.length} Change{changes.length > 1 ? "s" : ""}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed top-16 right-4 z-30 w-[320px] bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-zinc-50 to-zinc-100 border-b border-zinc-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center shadow-sm">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-800">Pending Changes</h3>
            <p className="text-[10px] text-zinc-500">
              {changes.length} change{changes.length > 1 ? "s" : ""} ready to publish
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-white/80 rounded-lg transition-all"
          title="Minimize"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* ── Changes list ── */}
      <div className="max-h-[300px] overflow-y-auto divide-y divide-zinc-100">
        {changes.map((change, index) => (
          <div
            key={change.id}
            className="px-4 py-3 flex items-start gap-3 group hover:bg-zinc-50/50 transition-colors"
          >
            {/* Change indicator */}
            <div className="mt-0.5 shrink-0">
              <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center">
                <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>

            {/* Description */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-zinc-700 leading-relaxed">
                {change.description}
              </p>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                {new Date(change.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>

            {/* Discard button */}
            <button
              onClick={() => onDiscard(change.id)}
              disabled={isReverting}
              className="mt-0.5 shrink-0 p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30"
              title="Undo this change"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* ── Actions ── */}
      <div className="border-t border-zinc-200 p-3 bg-zinc-50/50 space-y-2">
        {/* Confirm all */}
        <button
          onClick={onConfirmAll}
          disabled={isConfirming || isReverting}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-zinc-800 to-zinc-950 text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
        >
          {isConfirming ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Publishing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Publish All Changes
            </>
          )}
        </button>

        {/* Discard all */}
        <button
          onClick={onDiscardAll}
          disabled={isConfirming || isReverting}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-red-600 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-30 transition-all"
        >
          {isReverting ? (
            <>
              <div className="w-3 h-3 border-2 border-red-400/30 border-t-red-500 rounded-full animate-spin" />
              Reverting...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Discard All Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
