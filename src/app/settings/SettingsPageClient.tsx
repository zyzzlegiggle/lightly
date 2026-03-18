"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";

export default function SettingsPageClient({ session }: { session: any }) {
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [syncingRepo, setSyncingRepo] = useState<string | null>(null);

  useEffect(() => {
    fetchRepos();
  }, []);

  const fetchRepos = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/repos");
      if (res.status === 401 || res.status === 404) {
        // Not linked or token missing
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
      await authClient.linkSocial({ provider: "github", callbackURL: "/settings" });
    } catch (err) {
      console.error("Failed to link GitHub", err);
      setIsLinking(false);
    }
  };

  const linkRepoToProject = async (repo: any) => {
    setSyncingRepo(repo.id);
    try {
      // We will call the FastAPI or Next.js backend to sync
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoId: repo.id.toString(),
          githubUrl: repo.clone_url,
          name: repo.name
        })
      });
      if (!res.ok) {
        throw new Error("Failed to link project");
      }
      alert(`Project ${repo.name} linked successfully!`);
    } catch (err: any) {
      alert("Error linking repo: " + err.message);
    } finally {
      setSyncingRepo(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* GitHub Integeration Section */}
      <section className="bg-white border border-border-subtle rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-text-primary">GitHub Integration</h2>
        
        {loading ? (
          <p className="text-sm text-text-muted animate-pulse">Loading repositories...</p>
        ) : error === "github_not_linked" ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-text-muted">You need to connect your GitHub account to link repositories and enable the AI to access your code.</p>
            <button 
              onClick={linkGithub}
              disabled={isLinking}
              className="bg-accent-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2"
            >
              {isLinking ? "Connecting..." : "Connect GitHub"}
            </button>
          </div>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Your GitHub account is connected. Select a repository to index and create a project.</p>
            
            <div className="border border-border-subtle rounded-lg overflow-hidden divide-y divide-border-subtle max-h-96 overflow-y-auto">
              {repos.length === 0 ? (
                <div className="p-4 text-sm text-zinc-500 text-center">No push-enabled repositories found.</div>
              ) : (
                repos.map((repo) => (
                  <div key={repo.id} className="p-4 flex items-center justify-between hover:bg-black/[0.02] transition-colors">
                    <div>
                      <p className="font-medium text-sm text-text-primary">{repo.full_name}</p>
                      <p className="text-xs text-text-muted mt-1">{repo.description || "No description"}</p>
                    </div>
                    <button 
                      onClick={() => linkRepoToProject(repo)}
                      disabled={syncingRepo === repo.id}
                      className="text-xs font-semibold px-3 py-1.5 border border-border-subtle rounded hover:bg-black/[0.05] transition-colors"
                    >
                      {syncingRepo === repo.id ? "Syncing..." : "Link Repo"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
