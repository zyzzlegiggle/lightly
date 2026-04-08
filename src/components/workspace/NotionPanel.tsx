"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CardSkeleton, BlockSkeleton } from "./LoaderComponents";

interface NotionPage {
  id: string;
  title: string;
  createdTime: string;
  lastEditedTime: string;
}

interface NotionBlock {
  id: string;
  type: string;
  content: string;
  checked?: boolean;
}

interface NotionPanelProps {
  projectId: string;
  refreshKey?: number;
}

type BlockType = "paragraph" | "heading_2" | "heading_3" | "bulleted_list_item" | "numbered_list_item" | "to_do" | "code" | "divider";

const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: "paragraph", label: "Text", icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16m-7 6h7" /></svg> },
  { type: "heading_2", label: "Heading 2", icon: <span className="text-[10px] font-black">H2</span> },
  { type: "heading_3", label: "Heading 3", icon: <span className="text-[10px] font-black">H3</span> },
  { type: "bulleted_list_item", label: "Bullet List", icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" /></svg> },
  { type: "numbered_list_item", label: "Numbered List", icon: <span className="text-[10px] font-black italic">1.</span> },
  { type: "to_do", label: "Todo List", icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
  { type: "code", label: "Code Block", icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg> },
  { type: "divider", label: "Divider", icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 12H4" /></svg> },
];

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function NotionPanel({ projectId, refreshKey }: NotionPanelProps) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null);
  const [notes, setNotes] = useState<NotionPage[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Editor state
  const [editingNote, setEditingNote] = useState<NotionPage | null>(null);
  const [editorBlocks, setEditorBlocks] = useState<{ type: BlockType; content: string; checked?: boolean }[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNewNote, setShowNewNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);
  const [initing, setIniting] = useState(false);

  // Check connection
  useEffect(() => {
    const check = async () => {
      try {
        const resp = await fetch(`/api/projects/${projectId}/notion`);
        if (resp.ok) {
          const data = await resp.json();
          setConnected(data.connected);
          setPageId(data.pageId);
        }
      } catch (err) {
        console.error("Failed to check Notion connection:", err);
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [projectId]);

  // Load notes when connected + has page
  const loadNotes = useCallback(async () => {
    if (!pageId) return;
    setLoadingNotes(true);
    try {
      const resp = await fetch(`/api/projects/${projectId}/notion?action=pages`);
      const data = await resp.json();
      setNotes(data.pages || []);
    } catch {
      setNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }, [projectId, pageId]);

  useEffect(() => {
    if (connected && pageId) loadNotes();
  }, [connected, pageId, loadNotes, refreshKey]);

  // Init project page
  const handleInit = async () => {
    setIniting(true);
    try {
      const resp = await fetch(`/api/projects/${projectId}/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init" }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setPageId(data.pageId);
      }
    } catch {}
    setIniting(false);
  };

  // Open note in editor
  const openNote = async (note: NotionPage) => {
    setEditingNote(note);
    setLoadingContent(true);
    try {
      const resp = await fetch(
        `/api/projects/${projectId}/notion?action=page&pageId=${note.id}`
      );
      const data = await resp.json();
      const blocks = (data.blocks || []).map((b: any) => ({
        type: b.type as BlockType,
        content: b.content || "",
        checked: b.checked,
      }));
      setEditorBlocks(blocks.length > 0 ? blocks : [{ type: "paragraph" as BlockType, content: "" }]);
    } catch {
      setEditorBlocks([{ type: "paragraph" as BlockType, content: "" }]);
    } finally {
      setLoadingContent(false);
    }
  };

  // Save note content
  const saveNote = async () => {
    if (!editingNote) return;
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateContent",
          pageId: editingNote.id,
          blocks: editorBlocks,
        }),
      });
    } catch {}
    setSaving(false);
  };

  // Create new note
  const createNote = async () => {
    if (!newNoteTitle.trim()) return;
    setCreatingNote(true);
    try {
      const resp = await fetch(`/api/projects/${projectId}/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createNote", title: newNoteTitle }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setNotes((prev) => [data.page, ...prev]);
        setShowNewNote(false);
        setNewNoteTitle("");
        // Open the new note immediately
        openNote(data.page);
      }
    } catch {}
    setCreatingNote(false);
  };

  // Delete note
  const deleteNote = async (noteId: string) => {
    if (!confirm("Delete this note?")) return;
    try {
      await fetch(`/api/projects/${projectId}/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteNote", pageId: noteId }),
      });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (editingNote?.id === noteId) {
        setEditingNote(null);
        setEditorBlocks([]);
      }
    } catch {}
  };

  // Block editor helpers
  const updateBlock = (index: number, content: string) => {
    setEditorBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, content } : b)));
  };

  const updateBlockType = (index: number, type: BlockType) => {
    setEditorBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, type } : b)));
  };

  const toggleTodoCheck = (index: number) => {
    setEditorBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, checked: !b.checked } : b))
    );
  };

  const addBlockAfter = (index: number) => {
    setEditorBlocks((prev) => [
      ...prev.slice(0, index + 1),
      { type: "paragraph" as BlockType, content: "" },
      ...prev.slice(index + 1),
    ]);
  };

  const removeBlock = (index: number) => {
    if (editorBlocks.length <= 1) return;
    setEditorBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addBlockAfter(index);
      // Focus next block after render
      setTimeout(() => {
        const inputs = document.querySelectorAll("[data-block-input]");
        (inputs[index + 1] as HTMLElement)?.focus();
      }, 50);
    }
    if (e.key === "Backspace" && editorBlocks[index].content === "" && editorBlocks.length > 1) {
      e.preventDefault();
      removeBlock(index);
      setTimeout(() => {
        const inputs = document.querySelectorAll("[data-block-input]");
        (inputs[Math.max(0, index - 1)] as HTMLElement)?.focus();
      }, 50);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex items-center justify-center shrink-0">
        <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Not connected ──
  if (!connected) {
    return (
      <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col items-center justify-center shrink-0 px-8 text-center pb-16">
        <div className="w-11 h-11 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-zinc-800 mb-1">Notes</p>
        <p className="text-xs text-zinc-400 mb-5">Connect Notion to create and edit project notes.</p>
        <a
          href={`/api/auth/notion?returnTo=${encodeURIComponent(`/project/${projectId}?tab=notion`)}`}
          className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors"
        >
          Connect Notion
        </a>
      </div>
    );
  }

  // ── Connected but no project page yet ──
  if (!pageId) {
    return (
      <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col items-center justify-center shrink-0 px-8 text-center pb-16">
        <div className="w-11 h-11 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-zinc-800 mb-1">Initialize Notes</p>
        <p className="text-xs text-zinc-400 mb-5">Create a dedicated Notion page for this project&apos;s notes.</p>
        <button
          onClick={handleInit}
          disabled={initing}
          className="w-full bg-zinc-900 text-white text-sm py-2.5 rounded-xl hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {initing ? "Creating..." : "Create Project Page"}
        </button>
      </div>
    );
  }

  // ── Render: Editor view ──
  if (editingNote) {
    return (
      <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
        {/* Editor header */}
        <div className="h-12 border-b border-zinc-100 flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => { saveNote(); setEditingNote(null); loadNotes(); }}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
            title="Back to list"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[13px] font-bold text-zinc-800 truncate flex-1">
            {editingNote.title}
          </span>
          <button
            onClick={saveNote}
            disabled={saving}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shadow-sm ${
              saving 
                ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" 
                : "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95"
            }`}
          >
            {saving ? (
              <div className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-100 rounded-full animate-spin" />
            ) : "Save"}
          </button>
        </div>

        {/* Floating Tooltips or simple Toolbar */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-100 overflow-x-auto shrink-0 scrollbar-hide">
          {BLOCK_TYPES.map((bt) => (
            <button
              key={bt.type}
              onClick={() => {
                setEditorBlocks((prev) => [...prev, { type: bt.type, content: "" }]);
                setTimeout(() => {
                  const items = document.querySelectorAll("[data-block-item]");
                  const last = items[items.length - 1];
                  const textarea = last?.querySelector("textarea");
                  textarea?.focus();
                }, 50);
              }}
              title={bt.label}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-all shrink-0 active:scale-90"
            >
              {bt.icon}
            </button>
          ))}
        </div>

        {/* Editor content */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-white/50 backdrop-blur-sm">
          {loadingContent ? (
            <div className="p-8 space-y-6">
              {[1, 2, 3].map((i) => (
                <BlockSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="p-5 space-y-4 max-w-full">
              {editorBlocks.map((block, i) => (
                <div key={i} data-block-item className="group relative flex items-start gap-3 pl-2">
                  {/* Left gutter (drag/type indicator) */}
                  <div className="absolute left-0 top-1.5 flex flex-col items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-4 h-4 text-zinc-300">
                      <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
                      </svg>
                    </div>
                  </div>

                  {/* Content area */}
                  <div className="flex-1 min-w-0">
                    {block.type === "divider" ? (
                      <div className="h-0.5 bg-zinc-100 rounded-full my-4" />
                    ) : (
                      <div className="flex items-start gap-2.5">
                        {block.type === "to_do" && (
                          <div className="pt-0.5 shrink-0">
                            <input
                              type="checkbox"
                              checked={block.checked || false}
                              onChange={() => toggleTodoCheck(i)}
                              className="w-4 h-4 rounded border-zinc-200 text-zinc-900 focus:ring-zinc-500 transition-all cursor-pointer"
                            />
                          </div>
                        )}
                        {block.type === "bulleted_list_item" && (
                          <div className="pt-1.5 shrink-0 text-zinc-400 font-bold text-xs">•</div>
                        )}
                        {block.type === "numbered_list_item" && (
                          <div className="pt-1.5 shrink-0 text-zinc-400 font-bold text-[11px] min-w-[14px]">{i + 1}.</div>
                        )}
                        
                        <textarea
                          data-block-input
                          rows={1}
                          value={block.content}
                          onChange={(e) => {
                            updateBlock(i, e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height = e.target.scrollHeight + "px";
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              addBlockAfter(i);
                              setTimeout(() => {
                                const inputs = document.querySelectorAll("[data-block-input]");
                                (inputs[i+1] as HTMLElement)?.focus();
                              }, 50);
                            }
                            if (e.key === "Backspace" && block.content === "" && editorBlocks.length > 1) {
                              e.preventDefault();
                              removeBlock(i);
                              setTimeout(() => {
                                const inputs = document.querySelectorAll("[data-block-input]");
                                (inputs[Math.max(0, i-1)] as HTMLElement)?.focus();
                              }, 50);
                            }
                          }}
                          placeholder={
                            block.type.startsWith("heading") ? "Heading..." : "Type '/' for commands..."
                          }
                          className={`w-full bg-transparent outline-none resize-none overflow-hidden py-1 transition-all placeholder:text-zinc-200 ${
                            block.type === "heading_2" ? "text-[18px] font-bold text-zinc-900" :
                            block.type === "heading_3" ? "text-[15px] font-bold text-zinc-800" :
                            block.type === "code" ? "text-[11px] font-mono text-zinc-600 bg-zinc-50 p-3 rounded-xl border border-zinc-100" :
                            block.type === "to_do" && block.checked ? "text-[13px] text-zinc-300 line-through" :
                            "text-[13px] text-zinc-700 leading-relaxed"
                          }`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Options trigger (only shown on hover) */}
                  <button 
                    onClick={() => removeBlock(i)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-300 hover:text-red-400 hover:bg-red-50 rounded-md transition-all shrink-0 mt-1"
                    title="Delete block"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Notes list ──
  return (
    <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-10 border-b border-zinc-100 flex items-center justify-between px-3 shrink-0">
        <span className="text-sm font-semibold text-zinc-800">Notes</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadNotes()}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
            title="Refresh notes"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setShowNewNote(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
            title="New note"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Create note inline */}
      {showNewNote && (
        <div className="p-3 border-b border-zinc-100 space-y-2">
          <input
            autoFocus
            value={newNoteTitle}
            onChange={(e) => setNewNoteTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createNote()}
            placeholder="Note title..."
            className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-300"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowNewNote(false); setNewNoteTitle(""); }}
              className="flex-1 text-xs text-zinc-500 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createNote}
              disabled={!newNoteTitle.trim() || creatingNote}
              className="flex-1 text-xs bg-zinc-900 text-white py-1.5 rounded-lg hover:bg-zinc-700 disabled:opacity-30 transition-colors"
            >
              {creatingNote ? "..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loadingNotes ? (
          <div className="py-1">
            {[1, 2, 3, 4].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
            <svg className="w-8 h-8 text-zinc-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-xs text-zinc-400 mb-3">No notes yet</p>
            <button
              onClick={() => setShowNewNote(true)}
              className="text-xs text-zinc-500 hover:text-zinc-800 border border-zinc-200 hover:border-zinc-400 px-3 py-1.5 rounded-lg transition-all"
            >
              Create your first note
            </button>
          </div>
        ) : (
          <div className="py-1">
            {notes.map((note) => (
              <div
                key={note.id}
                className="group flex items-center px-3 py-2.5 hover:bg-zinc-50 transition-colors"
              >
                <button
                  onClick={() => openNote(note)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="text-[12px] font-medium text-zinc-700 truncate group-hover:text-zinc-900">
                    {note.title}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    {formatDate(note.lastEditedTime || note.createdTime)}
                  </p>
                </button>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-300 hover:text-red-400 rounded-md transition-all shrink-0"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
