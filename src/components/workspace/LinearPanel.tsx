"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { BoardSkeleton } from "./LoaderComponents";

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
  assignee?: {
    id: string;
    name: string;
    avatarUrl: string;
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
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const fetchData = async (pId?: string) => {
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

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIssueTitle) return;
    setCreatingIssue(true);
    try {
      const resp = await fetch(`/api/projects/${projectId}/linear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "create", 
          title: newIssueTitle, 
          description: newIssueDesc,
          stateId: states.find(s => s.type === "unstarted")?.id
        })
      });
      if (!resp.ok) throw new Error();
      
      setIsCreateModalOpen(false);
      setNewIssueTitle("");
      setNewIssueDesc("");
      fetchData();
      toast.success("Issue created!");
    } catch (err) {
      toast.error("Failed to create issue");
    } finally {
      setCreatingIssue(false);
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
              href={`/api/auth/linear?returnTo=/project/${projectId}`}
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
    <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
      {/* Header */}
      <div className="h-10 border-b border-zinc-100 bg-white px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-zinc-900">Projects</span>
          {view === "board" && (
            <button 
              onClick={() => setView("list")}
              className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-md transition-all uppercase tracking-tight"
            >
              Switch
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={fetchData}
            className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-all"
            title="Refresh"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button 
            onClick={() => { setCreateType("issue"); setIsCreateModalOpen(true); }}
            className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-800 transition-all"
            title="New Issue/Project"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4"/>
            </svg>
          </button>
        </div>
      </div>

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
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-200 group-hover:bg-zinc-900 transition-colors" />
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
        <div className="flex-1 overflow-x-auto p-4 flex gap-4 items-start bg-zinc-50/10">
          <div className="absolute top-4 left-4 h-full pointer-events-none border-l border-zinc-100" />
          {columns.map(column => (
            <div 
              key={column.id} 
              className="w-64 shrink-0 flex flex-col gap-3 relative z-10"
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

              <div className="flex flex-col gap-2.5 min-h-[200px]">
                {issues.filter(i => i.state.id === column.id).map(issue => (
                  <div 
                    key={issue.id} 
                    draggable
                    onDragStart={(e) => onDragStart(e, issue.id)}
                    onDragEnd={onDragEnd}
                    className={`group bg-white border border-zinc-200 p-3 rounded-2xl shadow-sm hover:shadow-md hover:border-zinc-300 transition-all cursor-grab active:cursor-grabbing ${draggedIssueId === issue.id ? 'opacity-40 border-dashed scale-95' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-zinc-300 tracking-wider">#{issue.identifier}</span>
                      <div className="flex items-center gap-1.5">
                        {issue.dueDate && (
                          <span className="text-[9px] text-zinc-400 font-bold border border-zinc-100 px-1.5 py-0.5 rounded-md">
                            {new Date(issue.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {issue.assignee && (
                          <img src={issue.assignee.avatarUrl} className="w-5 h-5 rounded-full border border-zinc-100" title={issue.assignee.name} />
                        )}
                      </div>
                    </div>
                    
                    <p className="text-[12px] font-semibold text-zinc-800 leading-snug mb-3 line-clamp-2 group-hover:text-zinc-950">{issue.title}</p>
                    
                    <div className="flex items-center justify-between pt-2.5 border-t border-zinc-50">
                      <div className="flex gap-1.5">
                        <button 
                          className="text-[9px] font-bold text-zinc-400 hover:text-zinc-600 bg-zinc-50 hover:bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200 transition-colors"
                          title="Labels"
                        >
                          Tag
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={issue.url} target="_blank" rel="noopener noreferrer" className="text-zinc-200 hover:text-zinc-400">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
                
                {column.type === "unstarted" && (
                  <button 
                    onClick={() => { setCreateType("issue"); setIsCreateModalOpen(true); }}
                    className="flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-800 hover:bg-white hover:border-zinc-300 hover:shadow-sm py-3 rounded-2xl transition-all text-[11px] font-bold border border-dashed border-zinc-200"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                    New Card
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-zinc-950/20 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)} />
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-5">
                    <div className="flex items-center gap-4 mb-5 border-b border-zinc-100 -mx-5 px-5 pb-4">
                        <button 
                            onClick={() => setCreateType("issue")}
                            className={`text-xs font-bold transition-all px-2 py-1 rounded-lg ${createType === "issue" ? "text-zinc-900 bg-zinc-100" : "text-zinc-400 hover:text-zinc-600"}`}
                        >
                            New Issue
                        </button>
                        <button 
                            onClick={() => setCreateType("project")}
                            className={`text-xs font-bold transition-all px-2 py-1 rounded-lg ${createType === "project" ? "text-zinc-900 bg-zinc-100" : "text-zinc-400 hover:text-zinc-600"}`}
                        >
                            New Project
                        </button>
                    </div>

                    {createType === "issue" ? (
                        <form onSubmit={handleCreateIssue} className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider pl-0.5">Title</label>
                                <input 
                                    autoFocus
                                    required
                                    value={newIssueTitle}
                                    onChange={e => setNewIssueTitle(e.target.value)}
                                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-zinc-400 transition-all"
                                    placeholder="What needs to be done?"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider pl-0.5">Description</label>
                                <textarea 
                                    value={newIssueDesc}
                                    onChange={e => setNewIssueDesc(e.target.value)}
                                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-zinc-400 transition-all min-h-[80px] resize-none"
                                    placeholder="Add more context..."
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-500 hover:bg-zinc-100">Cancel</button>
                                <button type="submit" disabled={creatingIssue || !newIssueTitle} className="flex-[2] bg-zinc-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-all active:scale-95">
                                    {creatingIssue ? "Creating..." : "Create Issue"}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleCreateProject} className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider pl-0.5">Project Name</label>
                                <input 
                                    autoFocus
                                    required
                                    value={newProjectName}
                                    onChange={e => setNewProjectName(e.target.value)}
                                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-zinc-400 transition-all"
                                    placeholder="Growth Strategy, Q3 Roadmap, etc."
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-500 hover:bg-zinc-100">Cancel</button>
                                <button type="submit" disabled={creatingIssue || !newProjectName} className="flex-[2] bg-zinc-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-all active:scale-95">
                                    {creatingIssue ? "Creating..." : "Create & Link Project"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
