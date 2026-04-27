'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useBrainNodes } from '@/lib/brains/provider';

interface FloatingPromptBarProps {
  projectId: string;
  isRunning: boolean;
  onSendInstruction: (prompt: string, context?: string) => void;
  getCanvasContext?: () => string;
  // When true, the send button is enabled even if no legacy agents are toggled on
  // (the Brain pipeline will handle the prompt).
  brainPipelineReady?: boolean;
}

export function FloatingPromptBar({ projectId, isRunning, onSendInstruction, getCanvasContext, brainPipelineReady }: FloatingPromptBarProps) {
  const brains = useBrainNodes();
  const liveBrains = brains.filter((b) => !b.retiredAt && b.state !== 'retired');

  const [prompt, setPrompt] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSend = () => {
    if (!prompt.trim() || isRunning) return;
    const context = getCanvasContext ? getCanvasContext() : undefined;
    onSendInstruction(prompt, context);
    setPrompt('');
    setMenuOpen(false);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeAgentsCount = liveBrains.length;
  const canSend = Boolean(brainPipelineReady);

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 pointer-events-none">
      
      {/* Popover Menu */}
      {menuOpen && (
        <div 
          ref={menuRef}
          className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-64 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden pointer-events-auto"
          style={{ backdropFilter: 'blur(16px)', animation: 'slideUp 0.2s ease-out' }}
        >
          <div className="px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
            <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Live brains on this canvas</h4>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 space-y-1">
            {liveBrains.map(b => (
              <div key={b.id} className="flex items-center gap-2 p-2 rounded-lg">
                <span className="text-lg">{b.emoji}</span>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{b.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)] truncate">
                    {b.state} · {b.spec.modelProvider}/{b.spec.modelId}
                  </span>
                </div>
                <span className="w-2 h-2 rounded-full" style={{ background: b.color }} />
              </div>
            ))}
            {liveBrains.length === 0 && (
              <div className="p-3 text-xs text-center text-[var(--text-muted)]">
                No brains alive yet — the Lead spawns on your first prompt. Visit /brains to add specialists.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Bar */}
      <div className="flex items-end gap-2 bg-[var(--bg-panel)]/80 border border-[var(--border-color)] p-2 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] pointer-events-auto transition-all"
           style={{ backdropFilter: 'blur(20px) saturate(180%)' }}>
        
        <button 
          onClick={() => setMenuOpen(!menuOpen)}
          className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-all ${menuOpen ? 'bg-blue-500/10 text-blue-400' : 'hover:bg-[var(--bg-app)] text-[var(--text-secondary)]'}`}
          title="Manage Brains"
        >
          {activeAgentsCount > 0 ? (
            <div className="relative">
              <span className="text-lg">🤖</span>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 text-white text-[8px] font-bold flex items-center justify-center rounded-full border border-[var(--bg-panel)]">
                {activeAgentsCount}
              </span>
            </div>
          ) : (
            <span className="text-xl">+</span>
          )}
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={canSend ? "Ask anything..." : "Configure an AI connection in Settings to begin..."}
            className="w-full bg-transparent border-none outline-none resize-none max-h-[150px] py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] font-medium"
            rows={1}
            disabled={isRunning}
          />
        </div>

        <button
          onClick={handleSend}
          disabled={!prompt.trim() || isRunning || !canSend}
          className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
            isRunning
              ? 'bg-blue-500/20 text-blue-400 cursor-wait'
              : prompt.trim() && canSend
                ? 'bg-[var(--canvas-selection)] text-white hover:opacity-90 shadow-lg shadow-blue-500/20'
                : 'bg-[var(--bg-app)] text-[var(--text-muted)] cursor-not-allowed'
          }`}
        >
          {isRunning ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translate(-50%, 10px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
