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
  if (changes.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-900">No pending changes</p>
        <p className="text-xs text-zinc-400 mt-1">Everything is up to date.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[360px] bg-white overflow-hidden flex flex-col">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/30">
        <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-900 uppercase tracking-tight">Review Changes</span>
            <span className="text-[10px] bg-zinc-900 text-white px-2 py-0.5 rounded-full font-bold">
                {changes.length}
            </span>
        </div>
      </div>

      {/* ── Changes list ── */}
      <div className="max-h-[400px] overflow-y-auto divide-y divide-zinc-50">
        {changes.map((change) => (
          <div
            key={change.id}
            className="p-4 flex items-start gap-3 group hover:bg-zinc-50/80 transition-colors"
          >
            {/* Change indicator */}
            <div className="mt-0.5 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>

            {/* Description */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-zinc-900 leading-snug">
                {change.description}
              </p>
              <p className="text-[10px] text-zinc-400 mt-1 font-medium">
                {change.file.split('/').pop()} • {new Date(change.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>

            {/* Discard button */}
            <button
              onClick={() => onDiscard(change.id)}
              disabled={isReverting}
              className="mt-0.5 shrink-0 p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30"
              title="Discard change"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* ── Actions ── */}
      <div className="p-4 bg-zinc-50/50 border-t border-zinc-100 space-y-2">
        <button
          onClick={onConfirmAll}
          disabled={isConfirming || isReverting}
          className="w-full flex items-center justify-center gap-2 bg-zinc-950 text-white text-[13px] font-bold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
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
              Push {changes.length} Change{changes.length !== 1 ? 's' : ''}
            </>
          )}
        </button>

        <button
          onClick={onDiscardAll}
          disabled={isConfirming || isReverting}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-zinc-400 hover:text-red-600 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-30 transition-all uppercase tracking-wider"
        >
          {isReverting ? (
            "Resetting..."
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Discard All
            </>
          )}
        </button>
      </div>
    </div>
  );
}
