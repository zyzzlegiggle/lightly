"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  // Load notes
  useEffect(() => {
    fetch("/api/workspace/notes")
      .then((r) => r.json())
      .then((d) => {
        setNotes(d.notes || []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  // When selected note changes, sync local edit state
  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title);
      setEditContent(selectedNote.content);
      setTimeout(() => contentRef.current?.focus(), 50);
    }
  }, [selectedId]); // eslint-disable-line

  // Debounced save
  const scheduleSave = useCallback(
    (id: string, title: string, content: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setIsSaving(true);
      saveTimer.current = setTimeout(async () => {
        await fetch(`/api/workspace/notes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content }),
        });
        setNotes((prev) =>
          prev.map((n) =>
            n.id === id ? { ...n, title, content, updatedAt: new Date().toISOString() } : n
          )
        );
        setIsSaving(false);
      }, 800);
    },
    []
  );

  const handleTitleChange = (v: string) => {
    setEditTitle(v);
    if (selectedId) scheduleSave(selectedId, v, editContent);
  };

  const handleContentChange = (v: string) => {
    setEditContent(v);
    if (selectedId) scheduleSave(selectedId, editTitle, v);
  };

  const createNote = async () => {
    const res = await fetch("/api/workspace/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled", content: "" }),
    });
    const data = await res.json();
    if (data.note) {
      setNotes((prev) => [data.note, ...prev]);
      setSelectedId(data.note.id);
    }
  };

  const deleteNote = async (id: string) => {
    await fetch(`/api/workspace/notes/${id}`, { method: "DELETE" });
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // ── Editor view ──
  if (selectedNote) {
    return (
      <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
        {/* Header */}
        <div className="h-12 border-b border-zinc-100 flex items-center px-3 gap-2 shrink-0">
          <button
            onClick={() => setSelectedId(null)}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs text-zinc-400 truncate flex-1">Notes</span>
          {isSaving && (
            <span className="text-[10px] text-zinc-400 italic flex items-center gap-1">
              <div className="w-2.5 h-2.5 border border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
              Saving
            </span>
          )}
          {!isSaving && (
            <span className="text-[10px] text-zinc-300 italic">Saved</span>
          )}
          <button
            onClick={() => deleteNote(selectedNote.id)}
            className="p-1.5 text-zinc-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all"
            title="Delete note"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {/* Title */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            className="w-full text-[17px] font-semibold text-zinc-800 bg-transparent outline-none placeholder:text-zinc-300"
          />
          <p className="text-[10px] text-zinc-300 mt-1">
            {timeAgo(selectedNote.updatedAt)}
          </p>
        </div>

        {/* Divider */}
        <div className="px-4"><div className="h-px bg-zinc-100" /></div>

        {/* Content */}
        <textarea
          ref={contentRef}
          value={editContent}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Start writing..."
          className="flex-1 p-4 text-[13px] text-zinc-700 leading-relaxed bg-transparent resize-none outline-none placeholder:text-zinc-300"
        />
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="w-[360px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-12 border-b border-zinc-100 flex items-center justify-between px-4 shrink-0">
        <span className="text-sm font-semibold text-zinc-800">Notes</span>
        <button
          onClick={createNote}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 px-2.5 py-1.5 rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 pb-12">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-700 mb-1">No notes yet</p>
            <p className="text-xs text-zinc-400 mb-4">Create your first note to get started.</p>
            <button
              onClick={createNote}
              className="text-sm bg-zinc-900 text-white px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              New note
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {notes.map((note) => (
              <button
                key={note.id}
                onClick={() => setSelectedId(note.id)}
                className="w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-zinc-800 truncate">
                      {note.title || "Untitled"}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {note.content
                        ? note.content.slice(0, 60).replace(/\n/g, " ")
                        : "No content"}
                    </p>
                  </div>
                  <span className="text-[10px] text-zinc-300 mt-0.5 shrink-0">
                    {timeAgo(note.updatedAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
