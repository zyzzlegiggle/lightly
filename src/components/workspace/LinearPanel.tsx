"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { BoardSkeleton } from "./LoaderComponents";
import { DeleteConfirmModal } from "../DeleteConfirmModal";

interface Issue {
  id: string;
  title: string;
  identifier: string;
  url: string;
  dueDate?: string;
  priority?: number;
  state: {
    id: string;
    name: string;
    color: string;
    type: string;
  };
  assignees: {
    nodes: {
      id: string;
      name: string;
      avatarUrl: string;
    }[];
  };
  labels?: {
    id: string;
    name: string;
    color: string;
  }[];
}

interface State {
  id: string;
  name: string;
  color: string;
  type: string;
  position: number;
}

interface LinearPanelProps {
  projectId: string;
  refreshKey?: number;
}

export function LinearPanel({ projectId, refreshKey }: LinearPanelProps) {
  const [loading, setLoading] = useState(true);
  const [initLoading, setInitLoading] = useState(false);
  const [status, setStatus] = useState<"loading" | "uninitialized" | "ready">("loading");
  const [teams, setTeams] = useState<any[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [newIssueDesc, setNewIssueDesc] = useState("");
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [draggedIssueId, setDraggedIssueId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">("list");
  const [createType, setCreateType] = useState<"issue" | "project">("issue");
  const [newProjectName, setNewProjectName] = useState("");
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newIssueDueDate, setNewIssueDueDate] = useState("");
  const [inlineAddingTo, setInlineAddingTo] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState("");
  const [inlineAssignee, setInlineAssignee] = useState("");
  const [inlineDueDate, setInlineDueDate] = useState("");
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const fetchData = async (pId?: string) => {
    setLoading(true);
    try {
      const targetId = pId || selectedProjectId;
      const url = targetId 
        ? `/api/projects/${projectId}/linear?action=board&projectId=${targetId}`
        : `/api/projects/${projectId}/linear?action=projects`;

      const resp = await fetch(url);
      if (resp.status === 403) {
          setStatus("loading");
          setLoading(false);
          (window as any).__LINEAR_NOT_CONNECTED = true; 
          return;
      }
      const data = await resp.json();
      if (data.error === "linear_not_linked") {
         setStatus("loading");
         setLoading(false);
         return;
      }
      if (data.status === "uninitialized") {
        setTeams(data.teams || []);
        setStatus("uninitialized");
      } else if (data.status === "projects") {
        setAllProjects(data.projects || []);
        setStatus("ready");
      } else if (data.states) {
        setStates(data.states.sort((a: any, b: any) => a.position - b.position));
        setIssues(data.issues || []);
        if (data.members) setMembers(data.members);
        setStatus("ready");
        if (targetId) setView("board");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch Linear data");
    } finally {
      setLoading(false);
    }
  };

  const [pToDelete, setPToDelete] = useState<{ id: string, name: string } | null>(null);

  const handleDeleteProject = async () => {
    if (!pToDelete) return;
    const pId = pToDelete.id;
    
    try {
      const resp = await fetch(`/api/projects/${projectId}/linear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteProject", projectId: pId })
      });
      if (resp.ok) {
        setAllProjects(prev => prev.filter(p => p.id !== pId));
        toast.success("Project deleted successfully");
      } else {
        toast.error("Failed to delete project");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete project");
    } finally {
      setPToDelete(null);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId, refreshKey]);

  const handleInit = async () => {
    if (!selectedTeam) return;
    setInitLoading(true);
    try {
      const resp = await fetch(`/api/projects/${projectId}/linear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init", teamId: selectedTeam })
      });
      if (!resp.ok) throw new Error();
      fetchData();
    } catch (err) {
      toast.error("Failed to initialize project");
    } finally {
      setInitLoading(false);
    }
  };

  const handleMove = async (issueId: string, stateId: string) => {
    const oldIssues = [...issues];
    const targetState = states.find(s => s.id === stateId);
    if (!targetState) return;

    // Optimistic update
    setIssues(issues.map(iss => iss.id === issueId ? { ...iss, state: targetState } : iss));

    try {
      const resp = await fetch(`/api/projects/${projectId}/linear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", issueId, stateId })
      });
      if (!resp.ok) throw new Error();
    } catch (err) {
      setIssues(oldIssues);
      toast.error("Failed to move issue");
    }
  };

  const handleInlineSubmit = async (colId: string) => {
    if (!inlineTitle) return;
    setCreatingIssue(true);
    try {
      const resp = await fetch(`/api/projects/${projectId}/linear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "create", 
          title: inlineTitle, 
          stateId: colId,
          assigneeId: inlineAssignee || undefined,
          dueDate: inlineDueDate || undefined
        })
      });
      if (!resp.ok) throw new Error();
      setInlineAddingTo(null);
      setInlineTitle("");
      setInlineAssignee("");
      setInlineDueDate("");
      fetchData();
      toast.success("Task added!");
    } catch (err) {
      toast.error("Failed to add task");
    } finally {
      setCreatingIssue(false);
    }
  };

  const handleUpdateIssue = async (iId: string) => {
    if (!editTitle) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/projects/${projectId}/linear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "update", 
          issueId: iId,
          title: editTitle, 
          assigneeId: editAssignee || undefined,
          dueDate: editDueDate || undefined
        })
      });
      if (!resp.ok) throw new Error();
      setEditingIssueId(null);
      fetchData();
      toast.success("Task updated!");
    } catch (err) {
      toast.error("Failed to update task");
    } finally {
      setLoading(false);
    }
  };



  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName) return;
    setCreatingIssue(true);
    try {
      const resp = await fetch(`/api/projects/${projectId}/linear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createProject", name: newProjectName })
      });
      if (!resp.ok) throw new Error();
      
      setIsCreateModalOpen(false);
      setNewProjectName("");
      fetchData(); // This will load the new project board
      toast.success("New project created and linked!");
    } catch (err) {
      toast.error("Failed to create project");
    } finally {
      setCreatingIssue(false);
    }
  };

  // Drag and Drop handlers
  const onDragStart = (e: React.DragEvent, issueId: string) => {
    setDraggedIssueId(issueId);
    e.dataTransfer.setData("issueId", issueId);
    e.dataTransfer.effectAllowed = "move";
    
    // Add a ghost effect class through a timeout
    setTimeout(() => {
      const target = e.target as HTMLElement;
      target.classList.add("opacity-40");
    }, 0);
  };

  const onDragEnd = (e: React.DragEvent) => {
    setDraggedIssueId(null);
    const target = e.target as HTMLElement;
    target.classList.remove("opacity-40");
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e: React.DragEvent, stateId: string) => {
    e.preventDefault();
    const issueId = e.dataTransfer.getData("issueId");
    if (issueId) {
      handleMove(issueId, stateId);
    }
  };

  if (loading) {
    return (
      <div className="w-[340px] h-full bg-white border-r border-zinc-200 flex flex-col shrink-0 overflow-hidden">
        <div className="h-10 border-b border-zinc-100 flex items-center px-4 shrink-0">
          <div className="w-20 h-4 bg-zinc-100 rounded-md animate-pulse" />
        </div>
        <BoardSkeleton />
      </div>
    );
  }

  if (!loading && (status === "loading" || (window as any).__LINEAR_NOT_CONNECTED)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50/50">
        <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm text-center">
          <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-transform hover:scale-110">
             <svg className="w-8 h-8 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-2l-1-7V5a2 2 0 0 1 2-2H4a2 2 0 0 1 2 2v3l-1 7v2z" />
             </svg>
          </div>
          <h2 className="text-xl font-bold text-zinc-900 mb-2">Connect your Linear</h2>
          <p className="text-zinc-500 mb-8 text-sm leading-relaxed px-4">
            Link your Linear account to track issues, cycles, and project progress directly within your workspace.
          </p>
          
          <div className="space-y-3">
            <a
              href={`/api/auth/linear?returnTo=${encodeURIComponent(`/project/${projectId}?tab=linear`)}`}
              className="w-full inline-flex items-center justify-center gap-2 bg-zinc-950 text-white rounded-xl px-4 py-3 text-sm font-bold hover:bg-zinc-800 transition-all shadow-md active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.102-1.102" />
              </svg>
              Connect Linear Account
            </a>
            <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-widest">Secure OAuth Connection</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "uninitialized") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50/50">
        <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm">
          <div className="w-12 h-12 bg-zinc-950 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-zinc-200">
             <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-2l-1-7V5a2 2 0 0 1 2-2H4a2 2 0 0 1 2 2v3l-1 7v2z" />
             </svg>
          </div>
          <h2 className="text-xl font-semibold text-zinc-900 mb-2">Initialize Linear Project</h2>
          <p className="text-zinc-500 mb-6 text-sm leading-relaxed">Pick a Linear team to create a dedicated board for this project. All issues will be scoped to this workspace.</p>
          
          <div className="space-y-4">
            <select 
              value={selectedTeam} 
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-950 transition-all font-medium"
            >
              <option value="">Select a team...</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.key})</option>)}
            </select>
            <button
              onClick={handleInit}
              disabled={!selectedTeam || initLoading}
              className="w-full bg-zinc-950 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-sm active:scale-95"
            >
              {initLoading ? "Initializing..." : "Create Project Board"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const columns = states.filter(s => ["unstarted", "started", "completed"].includes(s.type));

  return (
    <div className="flex-1 h-full flex flex-col bg-white overflow-hidden relative">
      {/* Header */}
      <div className="h-10 border-b border-zinc-100 bg-white px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-zinc-900">Projects</span>
          {view === "board" && (
            <button 
              onClick={() => { setSelectedProjectId(null); setView("list"); setIssues([]); fetchData(); }}
              className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-md transition-all uppercase tracking-tight"
            >
              Back to Projects
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {loading && (
            <div className="mr-2">
              <svg className="animate-spin h-3.5 w-3.5 text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
          <button 
            onClick={() => fetchData()}
            className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-all"
            title="Refresh"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {view === "list" && (
            <button 
              onClick={() => { 
                setCreateType("project"); 
                setIsCreateModalOpen(true); 
              }}
              className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-800 transition-all"
              title="New Project"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {loading && view === "board" && issues.length === 0 && (
         <div className="absolute inset-x-0 top-10 bottom-0 bg-white z-20 flex flex-col items-center justify-center gap-4">
             <div className="w-8 h-8 border-b-2 border-zinc-900 rounded-full animate-spin" />
             <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Loading Board...</p>
         </div>
      )}

      {view === "list" ? (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest pl-1">Recent Projects</h2>
            </div>
            
            <div className="grid gap-3">
              {allProjects.length === 0 ? (
                <div className="py-12 text-center bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200">
                  <p className="text-xs text-zinc-400">No Linear projects found</p>
                </div>
              ) : (
                allProjects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProjectId(p.id); fetchData(p.id); }}
                    className="w-full text-left p-4 bg-white border border-zinc-200 rounded-2xl hover:border-zinc-400 hover:shadow-md transition-all group relative overflow-hidden"
                  >
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">
                          {p.teams?.nodes?.[0]?.key || "PRJ"}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setPToDelete({ id: p.id, name: p.name }); }}
                            className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            title="Delete Project"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          <div className="w-1.5 h-1.5 rounded-full bg-zinc-200 group-hover:bg-zinc-900 transition-colors" />
                        </div>
                      </div>
                      <h3 className="text-[13px] font-bold text-zinc-800 mb-1 group-hover:text-zinc-950">{p.name}</h3>
                      <p className="text-[11px] text-zinc-400 line-clamp-1 mb-3">{p.description || "No description provided."}</p>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-300 font-medium">
                          Updated {new Date(p.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-[11px] font-bold text-zinc-900 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 flex items-center gap-1">
                          Open Board
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5-5 5M6 7l5 5-5 5" /></svg>
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-zinc-100">
               <button 
                onClick={() => { setCreateType("project"); setIsCreateModalOpen(true); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-zinc-200 text-zinc-400 hover:text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 transition-all text-xs font-bold"
               >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                  Create New Project
               </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4 flex gap-4 items-stretch bg-zinc-50/10">
          <div className="absolute top-4 left-4 h-full pointer-events-none border-l border-zinc-100" />
          {columns.map(column => (
            <div 
              key={column.id} 
              className="w-72 shrink-0 flex flex-col gap-3 relative z-10 h-full"
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, column.id)}
            >
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shadow-sm" style={{ backgroundColor: column.color }} />
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{column.name}</span>
                  <span className="text-[9px] font-bold text-zinc-400 bg-white px-1.5 py-0.5 rounded-full border border-zinc-200">
                    {issues.filter(i => i.state.id === column.id).length}
                  </span>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto min-h-0 pr-1 pb-4 scrollbar-hide hover:scrollbar-default">
                {issues.filter(i => i.state.id === column.id).map(issue => (
                  editingIssueId === issue.id ? (
                    <div key={issue.id} className="bg-white border-2 border-zinc-900 p-3 rounded-2xl shadow-xl animate-in fade-in scale-95 duration-200">
                      <textarea
                        autoFocus
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleUpdateIssue(issue.id);
                          }
                          if (e.key === 'Escape') setEditingIssueId(null);
                        }}
                        className="w-full text-[12px] font-semibold text-zinc-800 bg-transparent border-none outline-none resize-none min-h-[40px] mb-3"
                      />
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                        <div className="flex gap-2">
                          <div className="relative group/sel">
                            <button className="p-1 text-zinc-400 hover:text-zinc-900 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            </button>
                            <select 
                              value={editAssignee}
                              onChange={e => setEditAssignee(e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            >
                              <option value="">Reassign...</option>
                              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          </div>
                          <div className="relative">
                            <button className="p-1 text-zinc-400 hover:text-zinc-900 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </button>
                            <input 
                              type="date"
                              value={editDueDate}
                              onChange={e => setEditDueDate(e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => setEditingIssueId(null)} className="px-2 py-1 text-[10px] font-bold text-zinc-400 hover:text-zinc-600 uppercase transition-colors">Cancel</button>
                          <button onClick={() => handleUpdateIssue(issue.id)} className="px-3 py-1 text-[10px] font-black text-white bg-zinc-900 rounded-lg uppercase shadow-sm transition-all active:scale-95">Save</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div 
                      key={issue.id} 
                      draggable
                      onDragStart={(e) => onDragStart(e, issue.id)}
                      onDragEnd={onDragEnd}
                      onClick={() => {
                        setEditingIssueId(issue.id);
                        setEditTitle(issue.title);
                        setEditAssignee(issue.assignees?.nodes?.[0]?.id || "");
                        setEditDueDate(issue.dueDate ? issue.dueDate.split('T')[0] : "");
                      }}
                      className={`group bg-white border border-zinc-200 p-3 rounded-2xl shadow-sm hover:shadow-md hover:border-zinc-300 transition-all cursor-grab active:cursor-grabbing ${draggedIssueId === issue.id ? 'opacity-40 border-dashed scale-95' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-300 tracking-wider">#{issue.identifier}</span>
                        <div className="flex items-center gap-1.5">
                          {issue.dueDate && (
                            <span className="text-[9px] text-zinc-400 font-bold border border-zinc-100 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <svg className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              {new Date(issue.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          <div className="flex -space-x-1.5 overflow-hidden">
                            {issue.assignees?.nodes?.slice(0, 2).map((a, idx) => (
                              <img 
                                key={a.id} 
                                src={a.avatarUrl} 
                                className="w-5 h-5 rounded-full border-2 border-white bg-zinc-50" 
                                title={a.name}
                                style={{ zIndex: 10 - idx }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-[12px] font-semibold text-zinc-800 leading-snug mb-3 line-clamp-2 group-hover:text-zinc-950 transition-colors">
                        {issue.title}
                      </p>
                      
                      <div className="flex items-center justify-between pt-2.5 border-t border-zinc-50">
                        <div className="flex gap-1.5">
                           <div className="flex -space-x-0.5">
                              {issue.labels?.map(label => (
                                <div key={label.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: label.color }} title={label.name} />
                              ))}
                           </div>
                           <span className="text-[9px] font-bold text-zinc-300 group-hover:text-zinc-500 uppercase tracking-tight transition-colors">Details</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <a href={issue.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1 -m-1 text-zinc-200 hover:text-zinc-400 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                ))}

                {inlineAddingTo === column.id ? (
                  <div className="bg-white border-2 border-zinc-900 p-3 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
                    <textarea
                      autoFocus
                      value={inlineTitle}
                      onChange={e => setInlineTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleInlineSubmit(column.id);
                        }
                        if (e.key === 'Escape') setInlineAddingTo(null);
                      }}
                      placeholder="Task title..."
                      className="w-full text-[12px] font-semibold text-zinc-800 bg-transparent border-none outline-none resize-none min-h-[40px] mb-3"
                    />
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                      <div className="flex gap-2">
                        <div className="relative group/sel">
                          <button className="p-1 text-zinc-400 hover:text-zinc-900 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          </button>
                          <select 
                            value={inlineAssignee}
                            onChange={e => setInlineAssignee(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          >
                            <option value="">Assignee</option>
                            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                        <div className="relative">
                          <button className="p-1 text-zinc-400 hover:text-zinc-900 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </button>
                          <input 
                            type="date"
                            value={inlineDueDate}
                            onChange={e => setInlineDueDate(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button 
                          onClick={() => setInlineAddingTo(null)}
                          className="px-2 py-1 text-[10px] font-bold text-zinc-400 hover:text-zinc-600 uppercase"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => handleInlineSubmit(column.id)}
                          disabled={!inlineTitle || creatingIssue}
                          className="px-3 py-1 text-[10px] font-black text-white bg-zinc-900 rounded-lg uppercase transition-all active:scale-95 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  column.type === "unstarted" && (
                    <button 
                      onClick={() => {
                        setInlineAddingTo(column.id);
                        setInlineTitle("");
                        setInlineAssignee("");
                        setInlineDueDate("");
                      }}
                      className="flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-800 hover:bg-white hover:border-zinc-300 hover:shadow-sm py-3 rounded-2xl transition-all text-[11px] font-bold border border-dashed border-zinc-200"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                      New Card
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isCreateModalOpen && view === "list" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-zinc-950/20 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)} />
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-5">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-[14px] font-bold text-zinc-900">Create New Project</h3>
                        <button onClick={() => setIsCreateModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <form onSubmit={handleCreateProject} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider pl-0.5">Project Name</label>
                            <input 
                                autoFocus
                                required
                                value={newProjectName}
                                onChange={e => setNewProjectName(e.target.value)}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-zinc-400 transition-all font-medium"
                                placeholder="Growth Strategy, Q3 Roadmap, etc."
                            />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="submit" disabled={creatingIssue || !newProjectName} className="w-full bg-zinc-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-zinc-200">
                                {creatingIssue ? "Creating Board..." : "Create & Link Board"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
       <DeleteConfirmModal 
         isOpen={!!pToDelete}
         onClose={() => setPToDelete(null)}
         onConfirm={handleDeleteProject}
         title="Delete Linear Project?"
         itemName={pToDelete?.name || ""}
       />
    </div>
  );
}
