"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";

interface Issue {
  id: string;
  title: string;
  identifier: string;
  url: string;
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
}

export function LinearPanel({ projectId }: LinearPanelProps) {
  const [loading, setLoading] = useState(true);
  const [initLoading, setInitLoading] = useState(false);
  const [status, setStatus] = useState<"loading" | "uninitialized" | "ready">("loading");
  const [teams, setTeams] = useState<any[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");

  const fetchData = async () => {
    try {
      const resp = await fetch(`/api/projects/${projectId}/linear`);
      if (resp.status === 403) {
          setStatus("loading");
          setLoading(false);
          // Special state for not connected
          (window as any).__LINEAR_NOT_CONNECTED = true; 
          setLoading(false);
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
      } else if (data.states) {
        setStates(data.states.sort((a: any, b: any) => a.position - b.position));
        setIssues(data.issues || []);
        setStatus("ready");
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
  }, [projectId]);

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
    setIssues(issues.map(iss => iss.id === issueId ? { ...iss, state: states.find(s => s.id === stateId)! } : iss));

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
              href={`/api/auth/connect?connection=linear&returnTo=/project/${projectId}`}
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
          <div className="w-12 h-12 bg-zinc-950 rounded-xl flex items-center justify-center mb-6">
             <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
              className="w-full bg-zinc-950 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-sm"
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
    <div className="flex-1 flex flex-col bg-zinc-50/50 overflow-hidden">
      <div className="h-14 border-b border-zinc-200 bg-white px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-950 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <div>
                <h2 className="text-sm font-bold text-zinc-900">Project Workspace</h2>
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Live Sync</span>
                </div>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <button 
                onClick={fetchData}
                className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-all"
                title="Refresh board"
            >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6 flex gap-6 items-start">
        {columns.map(column => (
          <div key={column.id} className="w-80 shrink-0 flex flex-col gap-4">
             <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full shadow-sm" style={{ backgroundColor: column.color }} />
                  <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">{column.name}</span>
                  <span className="text-[10px] font-bold text-zinc-400 bg-white px-2 py-0.5 rounded-full border border-zinc-200">
                    {issues.filter(i => i.state.id === column.id).length}
                  </span>
                </div>
             </div>

             <div className="flex flex-col gap-2.5">
                {issues.filter(i => i.state.id === column.id).map(issue => (
                  <div 
                    key={issue.id} 
                    className="group bg-white border border-zinc-200 p-4 rounded-xl shadow-sm hover:shadow-md hover:border-zinc-300 transition-all cursor-default"
                  >
                    <div className="flex items-start justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-300 tracking-wider">#{issue.identifier}</span>
                        {issue.assignee && (
                          <img src={issue.assignee.avatarUrl} className="w-5 h-5 rounded-full border border-zinc-100 shadow-sm" title={issue.assignee.name} />
                        )}
                    </div>
                    <p className="text-xs font-semibold text-zinc-800 leading-relaxed mb-4 line-clamp-3 group-hover:text-zinc-950 transition-colors">{issue.title}</p>
                    
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-50">
                       <div className="flex gap-1.5">
                          {states.filter(s => s.id !== column.id && ["unstarted", "started", "completed"].includes(s.type)).map(nextState => (
                            <button
                              key={nextState.id}
                              onClick={() => handleMove(issue.id, nextState.id)}
                              className="text-[9px] font-black text-zinc-400 hover:text-white bg-zinc-50 hover:bg-zinc-900 px-2 py-1 rounded-md border border-zinc-200 hover:border-zinc-900 transition-all opacity-0 group-hover:opacity-100 uppercase"
                            >
                              {nextState.name.split(' ')[0]}
                            </button>
                          ))}
                       </div>
                       <a href={issue.url} target="_blank" rel="noopener noreferrer" className="text-zinc-200 hover:text-zinc-950 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                       </a>
                    </div>
                  </div>
                ))}
                
                <button className="flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-800 hover:bg-white hover:shadow-sm p-4 rounded-xl transition-all text-[11px] font-bold border border-dashed border-zinc-200 hover:border-zinc-300">
                   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                   New Issue
                </button>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
