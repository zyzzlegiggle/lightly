"use client";

import React from "react";

export function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div 
      className={`animate-pulse bg-gradient-to-r from-zinc-100 via-zinc-50 to-zinc-100 bg-[length:400%_100%] ${className}`}
      style={{ animationDuration: "2s" }}
    />
  );
}

export function MessageSkeleton() {
  return (
    <div className="flex items-start gap-3 py-2 px-3 animate-in fade-in duration-500">
      <Shimmer className="w-7 h-7 rounded-lg shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Shimmer className="w-20 h-3 rounded-md" />
          <Shimmer className="w-10 h-2 rounded-md" />
        </div>
        <Shimmer className="w-full h-4 rounded-md" />
        <Shimmer className="w-3/4 h-4 rounded-md" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="p-3 border-b border-zinc-50 space-y-2 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <Shimmer className="w-24 h-4 rounded-full" />
        <Shimmer className="w-12 h-3 rounded-md" />
      </div>
      <Shimmer className="w-full h-5 rounded-md" />
      <Shimmer className="w-1/2 h-3 rounded-md opacity-60" />
    </div>
  );
}

export function BlockSkeleton() {
  return (
    <div className="py-2 space-y-2 animate-in fade-in duration-500">
      <Shimmer className="w-full h-4 rounded-md" />
      <Shimmer className="w-5/6 h-4 rounded-md" />
      <Shimmer className="w-2/3 h-4 rounded-md" />
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="flex h-full gap-4 p-4 overflow-hidden animate-in fade-in duration-700">
      {[1, 2, 3].map((i) => (
        <div key={i} className="w-[280px] shrink-0 space-y-4">
          <div className="flex items-center justify-between px-1">
            <Shimmer className="w-24 h-4 rounded-md" />
            <Shimmer className="w-6 h-6 rounded-full" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="p-3 bg-white/50 border border-zinc-100 rounded-xl space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <Shimmer className="w-16 h-3 rounded-full" />
                  <Shimmer className="w-6 h-6 rounded-full" />
                </div>
                <Shimmer className="w-full h-4 rounded-md" />
                <Shimmer className="w-3/4 h-3 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="py-2 space-y-1 animate-in fade-in duration-500">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="px-3 py-2 flex items-center gap-3">
          <Shimmer className="w-5 h-5 rounded-md shrink-0" />
          <Shimmer className={`h-3 rounded-md flex-1 ${i % 2 === 0 ? "max-w-[120px]" : "max-w-[80px]"}`} />
        </div>
      ))}
    </div>
  );
}
