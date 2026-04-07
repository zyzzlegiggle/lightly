"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
}

type BlockType = "paragraph" | "heading_2" | "heading_3" | "bulleted_list_item" | "numbered_list_item" | "to_do" | "code" | "divider";

const BLOCK_TYPES: { type: BlockType; label: string; icon: string }[] = [
  { type: "paragraph", label: "Text", icon: "T" },
  { type: "heading_2", label: "H2", icon: "H2" },
  { type: "heading_3", label: "H3", icon: "H3" },
  { type: "bulleted_list_item", label: "Bullet", icon: "•" },
  { type: "numbered_list_item", label: "Number", icon: "1." },
  { type: "to_do", label: "Todo", icon: "☐" },
  { type: "code", label: "Code", icon: "</>" },
  { type: "divider", label: "Line", icon: "—" },
];

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function NotionPanel({ projectId }: NotionPanelProps) {
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
  }, [connected, pageId, loadNotes]);

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
          href={`/api/auth/notion?returnTo=/project/${projectId}`}
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

  // ── Editor modal (overlays the panel) ──
  if (editingNote) {
    return (
      <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0">
        {/* Editor header */}
        <div className="h-10 border-b border-zinc-100 flex items-center px-3 gap-2 shrink-0">
          <button
            onClick={() => { saveNote(); setEditingNote(null); loadNotes(); }}
            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-zinc-800 truncate flex-1">
            {editingNote.title}
          </span>
          <button
            onClick={saveNote}
            disabled={saving}
            className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-800 px-2 py-1 rounded-lg hover:bg-zinc-100 transition-all"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {/* Block type toolbar */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-zinc-50 overflow-x-auto shrink-0">
          {BLOCK_TYPES.map((bt) => (
            <button
              key={bt.type}
              onClick={() => {
                // Add a new block of this type at the bottom
                setEditorBlocks((prev) => [...prev, { type: bt.type, content: "" }]);
                setTimeout(() => {
                  const inputs = document.querySelectorAll("[data-block-input]");
                  (inputs[inputs.length - 1] as HTMLElement)?.focus();
                }, 50);
              }}
              className="text-[9px] font-bold text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 px-1.5 py-1 rounded transition-colors whitespace-nowrap"
              title={bt.label}
            >
              {bt.icon}
            </button>
          ))}
        </div>

        {/* Editor content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3">
          {loadingContent ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-1">
              {editorBlocks.map((block, i) => (
                <div key={i} className="group flex items-start gap-1">
                  {/* Block type indicator / drag handle */}
                  <div className="shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <select
                      value={block.type}
                      onChange={(e) => updateBlockType(i, e.target.value as BlockType)}
                      className="text-[8px] text-zinc-300 bg-transparent outline-none cursor-pointer w-7 appearance-none"
                      title="Block type"
                    >
                      {BLOCK_TYPES.map((bt) => (
                        <option key={bt.type} value={bt.type}>{bt.icon}</option>
                      ))}
                    </select>
                  </div>

                  {/* Block content */}
                  <div className="flex-1 min-w-0">
                    {block.type === "divider" ? (
                      <div className="h-px bg-zinc-200 my-2" />
                    ) : block.type === "to_do" ? (
                      <div className="flex items-start gap-1.5">
                        <input
                          type="checkbox"
                          checked={block.checked || false}
                          onChange={() => toggleTodoCheck(i)}
                          className="mt-1 rounded border-zinc-300"
                        />
                        <input
                          data-block-input
                          type="text"
                          value={block.content}
                          onChange={(e) => updateBlock(i, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, i)}
                          className={`flex-1 text-[12px] bg-transparent outline-none ${
                            block.checked ? "line-through text-zinc-400" : "text-zinc-700"
                          }`}
                          placeholder="To-do..."
                        />
                      </div>
                    ) : (
                      <input
                        data-block-input
                        type="text"
                        value={block.content}
                        onChange={(e) => updateBlock(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, i)}
                        className={`w-full bg-transparent outline-none ${
                          block.type === "heading_2"
                            ? "text-sm font-bold text-zinc-900"
                            : block.type === "heading_3"
                            ? "text-[13px] font-semibold text-zinc-800"
                            : block.type === "code"
                            ? "text-[11px] font-mono text-zinc-600 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-100"
                            : block.type === "bulleted_list_item"
                            ? "text-[12px] text-zinc-700 before:content-['•'] before:mr-1.5 before:text-zinc-400"
                            : block.type === "numbered_list_item"
                            ? "text-[12px] text-zinc-700"
                            : "text-[12px] text-zinc-700"
                        }`}
                        placeholder={
                          block.type === "heading_2"
                            ? "Heading"
                            : block.type === "heading_3"
                            ? "Subheading"
                            : block.type === "code"
                            ? "Code..."
                            : "Type something..."
                        }
                      />
                    )}
                  </div>
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
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-500 rounded-full animate-spin" />
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
