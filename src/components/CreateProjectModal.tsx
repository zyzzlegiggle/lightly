"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any;
}

export function CreateProjectModal({ isOpen, onClose, session }: CreateProjectModalProps) {
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  
  // New Step States
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [envVars, setEnvVars] = useState([{ key: "", value: "" }]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchRepos();
      setSelectedRepo(null);
      setBranch("");
      setEnvVars([{ key: "", value: "" }]);
      setIsCreatingProject(false);
    }
  }, [isOpen]);

  const fetchRepos = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/repos");
      if (res.status === 401 || res.status === 404) {
        setError("github_not_linked");
      } else if (!res.ok) {
        throw new Error("Failed to fetch repos");
      } else {
        const data = await res.json();
        setRepos(data.repos || []);
        setError("");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const linkGithub = async () => {
    setIsLinking(true);
    try {
      await authClient.linkSocial({ provider: "github", callbackURL: window.location.href });
    } catch (err) {
      console.error("Failed to link GitHub", err);
      setIsLinking(false);
    }
  };
  
  const handleSelectRepo = async (repo: any) => {
    setSelectedRepo(repo);
    setBranch(repo.default_branch || "main");
    setLoadingBranches(true);
    try {
      const res = await fetch(`/api/repos/branches?fullName=${repo.full_name}`);
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
      }
    } catch {
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleEnvChange = (index: number, field: "key" | "value", val: string) => {
    const newVars = [...envVars];
    newVars[index][field] = val;
    setEnvVars(newVars);
  };

  const addEnvVar = () => setEnvVars([...envVars, { key: "", value: "" }]);
  
  const removeEnvVar = (index: number) => {
    const newVars = [...envVars];
    newVars.splice(index, 1);
    setEnvVars(newVars);
  };

  const submitProject = async () => {
    if (!selectedRepo) return;
    setIsCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoId: selectedRepo.id.toString(),
          githubUrl: selectedRepo.clone_url,
          name: selectedRepo.name,
          branch,
          envVars: envVars.filter(v => v.key.trim() !== "")
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Failed to link project");
      }
      
      const { project, liveUrl } = await res.json();
      window.location.href = `/project/${project.id}`;      
    } catch (err: any) {
      alert("Error linking repo: " + err.message);
      setIsCreatingProject(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-2xl shadow-xl border border-zinc-200 flex flex-col max-h-[80vh] overflow-hidden">
        
        {isCreatingProject ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 space-y-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-zinc-100 rounded-full"></div>
              <div className="w-16 h-16 border-4 border-accent-primary border-t-transparent rounded-full animate-spin absolute inset-0"></div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-text-primary mb-2">Loading Project...</h3>
              <p className="text-sm text-text-muted">Setting up your environment</p>
            </div>
          </div>
        ) : !selectedRepo ? (
          <>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-text-primary">Create New Project</h2>
                <p className="text-sm text-text-muted mt-1">Select a GitHub repository to get started.</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-text-muted animate-pulse">Fetching your repositories...</p>
                </div>
              ) : error === "github_not_linked" ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="bg-zinc-50 p-4 rounded-full">
                    <svg className="w-12 h-12 text-zinc-400" fill="currentColor" viewBox="0 0 24 24">
                       <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">GitHub not connected</h3>
                    <p className="text-sm text-text-muted mt-1 max-w-sm">Connect your GitHub account to access and link your repositories.</p>
                  </div>
                  <button 
                    onClick={linkGithub}
                    disabled={isLinking}
                    className="bg-accent-primary text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-accent-hover transition-colors shadow-sm"
                  >
                    {isLinking ? "Connecting..." : "Connect GitHub"}
                  </button>
                </div>
              ) : error ? (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm text-center border border-red-100 italic">
                  {error}
                </div>
              ) : (
                <div className="space-y-4 pr-2">
                  <div className="grid gap-3">
                    {repos.length === 0 ? (
                      <div className="p-12 text-sm text-zinc-500 text-center border-2 border-dashed border-zinc-100 rounded-2xl">
                        No push-enabled repositories found.
                      </div>
                    ) : (
                      repos.map((repo) => (
                        <div key={repo.id} className="p-5 flex items-center justify-between border border-border-subtle rounded-2xl hover:bg-zinc-50/50 transition-colors group">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="font-bold text-base text-text-primary group-hover:text-accent-primary transition-colors">{repo.name}</p>
                            <p className="text-xs text-text-muted mt-1 truncate">{repo.full_name}</p>
                            {repo.description && (
                              <p className="text-xs text-zinc-500 mt-2 line-clamp-1">{repo.description}</p>
                            )}
                          </div>
                          <button 
                            onClick={() => handleSelectRepo(repo)}
                            className="bg-white border border-border-subtle hover:border-accent-primary hover:text-accent-primary text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-sm active:scale-95"
                          >
                            Select
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col h-full max-h-[65vh]">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border-subtle">
              <button onClick={() => setSelectedRepo(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-text-primary">Configure Project</h2>
                <p className="text-sm text-text-muted mt-1">Set up {selectedRepo.name} before deployment.</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 pr-2 space-y-6">
              <div>
                <label className="block text-sm font-bold text-text-primary mb-2">Branch to Deploy</label>
                {loadingBranches ? (
                  <div className="w-full border border-border-subtle rounded-xl px-4 py-3 bg-zinc-50 flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm text-text-muted">Fetching branches...</span>
                  </div>
                ) : (
                  <select 
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full border border-border-subtle rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent bg-white transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.25rem' }}
                  >
                    {!branches.some(b => b.name === branch) && branch && (
                      <option value={branch}>{branch} (default)</option>
                    )}
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>{b.name}</option>
                    ))}
                    {branches.length === 0 && !branch && (
                      <option value="">No branches found</option>
                    )}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-text-primary mb-2">Environment Variables</label>
                <div className="space-y-3">
                  {envVars.map((env, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input 
                        type="text" 
                        value={env.key}
                        onChange={(e) => handleEnvChange(i, "key", e.target.value)}
                        placeholder="KEY"
                        className="flex-1 border border-border-subtle rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all font-mono"
                      />
                      <span className="text-zinc-400">=</span>
                      <input 
                        type="text" 
                        value={env.value}
                        onChange={(e) => handleEnvChange(i, "value", e.target.value)}
                        placeholder="VALUE"
                        className="flex-1 border border-border-subtle rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all font-mono"
                      />
                      <button onClick={() => removeEnvVar(i)} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={addEnvVar}
                    className="text-sm font-bold text-accent-primary hover:text-accent-hover flex items-center gap-1 mt-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                    Add Variable
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-border-subtle flex justify-end">
              <button 
                onClick={submitProject}
                className="bg-accent-primary text-white font-bold px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors shadow-sm"
              >
                Deploy Project
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

