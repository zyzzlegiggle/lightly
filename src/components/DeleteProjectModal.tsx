"use client";

import { useState } from "react";

interface DeleteProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  projectName: string;
}

export function DeleteProjectModal({ isOpen, onClose, onConfirm, projectName }: DeleteProjectModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setIsDeleting(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md transition-opacity duration-300">
      <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-zinc-100 flex flex-col animate-slide-up">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 mb-2">Delete Project?</h2>
          <p className="text-sm text-zinc-500 leading-relaxed max-w-[280px]">
            Are you sure you want to delete <span className="font-bold text-zinc-900">{projectName}</span>? This action cannot be undone.
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-[13px] text-red-800 leading-relaxed">
              The DigitalOcean Droplet and all associated data will be permanently destroyed.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-100 border border-red-200 text-red-700 text-xs rounded-xl animate-in shake-in">
              {error}
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <button 
            onClick={handleConfirm}
            disabled={isDeleting}
            className="w-full bg-red-500 text-white text-[15px] font-bold py-3.5 rounded-2xl hover:bg-red-600 active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(239,68,68,0.2)] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Deleting...
              </>
            ) : "Confirm Delete"}
          </button>
          <button 
            onClick={onClose}
            disabled={isDeleting}
            className="w-full py-3.5 text-[15px] font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 rounded-2xl transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
