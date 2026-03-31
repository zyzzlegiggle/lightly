"use client";

import { useState, useEffect } from "react";

interface EnvVar {
  key: string;
  value: string;
}

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  onUpdated?: () => void;
}

export function ProjectSettingsModal({ isOpen, onClose, project, onUpdated }: ProjectSettingsModalProps) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen && project) {
      // Extract env vars from appSpecRaw if they exist
      const spec = project.appSpecRaw || {};
      const vars = spec.envVars || [];
      setEnvVars(vars.length > 0 ? vars : [{ key: "", value: "" }]);
    }
  }, [isOpen, project]);

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

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    try {
      const filteredVars = envVars.filter(v => v.key.trim() !== "");
      const res = await fetch(`/api/projects/${project.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ envVars: filteredVars }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update settings");
      }

      if (onUpdated) onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !project) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-xl border border-zinc-200 flex flex-col max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-text-primary">Project Settings</h2>
            <p className="text-xs text-text-muted mt-1 truncate max-w-[300px]">{project.githubUrl}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-text-primary mb-3">Environment Variables</label>
            <div className="space-y-3">
              {envVars.map((env, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input 
                    type="text" 
                    value={env.key}
                    onChange={(e) => handleEnvChange(i, "key", e.target.value)}
                    placeholder="KEY"
                    className="flex-1 border border-border-subtle rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all font-mono"
                  />
                  <span className="text-zinc-400">=</span>
                  <input 
                    type="text" 
                    value={env.value}
                    onChange={(e) => handleEnvChange(i, "value", e.target.value)}
                    placeholder="VALUE"
                    className="flex-1 border border-border-subtle rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all font-mono"
                  />
                  <button onClick={() => removeEnvVar(i)} className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <button 
                onClick={addEnvVar}
                className="text-xs font-bold text-accent-primary hover:text-accent-hover flex items-center gap-1 mt-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                Add Variable
              </button>
            </div>
          </div>
          
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
            <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-xs text-amber-800 leading-relaxed">
              Updating environment variables will rewrite the <code className="font-mono bg-amber-100 px-1 rounded">.env</code> file on your Droplet immediately. You may need to restart the project to apply some changes.
            </p>
          </div>
        </div>

        <div className="pt-6 mt-4 border-t border-border-subtle flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="bg-accent-primary text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-accent-hover transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
