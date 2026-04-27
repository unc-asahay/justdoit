'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useGitHub } from '@/lib/hooks/useGitHub';
import { useActiveProject } from '@/lib/hooks/useActiveProject';
import { InteractiveCanvas } from '@/scaffolds/canvas-view/InteractiveCanvas';
import { FigJamToolbar } from '@/scaffolds/canvas-toolbar/FigJamToolbar';
import { FloatingPromptBar } from '@/scaffolds/prompt-zone/FloatingPromptBar';
import { useCanvasContext } from '@/scaffolds/canvas-view/hooks/useCanvasContext';
import type { ToolBehavior } from '@/lib/canvas/tool-catalog';
import { useBrains, useBrainNodes } from '@/lib/brains/provider';
import { ensureLeadBrain } from '@/lib/brains/lead';
import { makeEvent } from '@/lib/brains/events';
import {
  clearCanvasContent,
  getNodesMap,
  getBrainsMap,
  getToolsMap,
  getTasksMap,
} from '@/lib/brains/canvas-ops';
import { BRAIN_TEMPLATES, TEMPLATE_TRIGGERS } from '@/lib/brains/templates';
import { useSettings } from '@/lib/ai/settings-store';
import { useSync } from '@/scaffolds/prompt-zone/hooks/useSync';
import type { CanvasSnapshot } from '@/lib/github/sync-engine';

export function CanvasPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get('project');
  const { projectId: savedProjectId, setActiveProject } = useActiveProject();
  
  // Use URL param first, fallback to last active project
  const projectId = urlProjectId || savedProjectId;
  
  const { isAuthenticated, isLoading, repo } = useGitHub();
  const { syncCanvas, getCanvasContext } = useCanvasContext();

  // Brain pipeline is the only path now — the legacy /api/ai/stream + iframe
  // srcdoc orchestrator is retired. If no AI connection is configured, the
  // prompt bar is disabled rather than silently falling through.
  const { registry, eventBus, ydoc } = useBrains();
  const brainNodes = useBrainNodes();
  const { getActiveConnection } = useSettings();

  // ── Save / Push wiring ──────────────────────────────────────────────────
  // Snapshot is read fresh on every save; the callback is stable across
  // renders so useSync doesn't tear down its engine.
  const getCanvasSnapshot = useCallback((): CanvasSnapshot | null => {
    try {
      const nodes = getNodesMap(ydoc).toJSON();
      const brains = getBrainsMap(ydoc).toJSON();
      const tools = getToolsMap(ydoc).toJSON();
      const tasks = getTasksMap(ydoc).toJSON();
      return {
        canvasJson: JSON.stringify(nodes, null, 2),
        brainsJson: JSON.stringify(brains, null, 2),
        toolsJson: JSON.stringify(tools, null, 2),
        tasksJson: JSON.stringify(tasks, null, 2),
      };
    } catch {
      return null;
    }
  }, [ydoc]);

  const syncOptions = useMemo(
    () => ({
      repoFullName: repo?.fullName,
      defaultBranch: repo?.defaultBranch ?? 'main',
      getCanvasSnapshot,
    }),
    [repo?.fullName, repo?.defaultBranch, getCanvasSnapshot],
  );

  const sync = useSync(projectId ?? 'default', syncOptions);

  // Auto-start the engine (autosave + autopush timers) once we have both a
  // project and a connected repo. Without a repo, save would 404.
  useEffect(() => {
    if (!projectId || !repo?.fullName) return;
    sync.start();
    return () => sync.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, repo?.fullName]);

  // Mark dirty whenever the Y.Doc changes — but skip cosmetic transactions
  // (idle-wander cursor drift fires every 10s; committing every 10s would
  // both spam GitHub and cause not-fast-forward races between overlapping
  // saves). Real Brain placements + user edits use other origins, so this
  // filter doesn't suppress meaningful changes.
  useEffect(() => {
    if (!projectId || !repo?.fullName) return;
    const COSMETIC_ORIGINS = new Set(['idle-wander']);
    const onUpdate = (
      _update: Uint8Array,
      origin: unknown,
    ) => {
      if (typeof origin === 'string' && COSMETIC_ORIGINS.has(origin)) return;
      sync.markDirty();
    };
    ydoc.on('update', onUpdate);
    return () => ydoc.off('update', onUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ydoc, projectId, repo?.fullName]);

  const [savePushError, setSavePushError] = useState<string | null>(null);
  useEffect(() => {
    if (sync.errorMessage) setSavePushError(sync.errorMessage);
  }, [sync.errorMessage]);
  useEffect(() => {
    if (!savePushError) return;
    const id = setTimeout(() => setSavePushError(null), 6000);
    return () => clearTimeout(id);
  }, [savePushError]);

  const handleManualSave = useCallback(async () => {
    if (!repo?.fullName) {
      setSavePushError('Connect a GitHub repo before saving.');
      return;
    }
    try {
      await sync.forceSave();
    } catch (e) {
      setSavePushError(e instanceof Error ? e.message : 'Save failed');
    }
  }, [repo?.fullName, sync]);

  // Save already writes directly to GitHub via the Contents API — there's
  // no separate "push" step in this architecture. So Push = force-save then
  // open the repo on GitHub so the user can see what landed.
  const handleManualPush = useCallback(async () => {
    if (!repo?.fullName) {
      setSavePushError('Connect a GitHub repo before pushing.');
      return;
    }
    try {
      await sync.forceSave();
      // Honest UX: take the user to the live commit so they can verify.
      const url = repo.htmlUrl
        ? `${repo.htmlUrl}/tree/${sync.currentBranch}/projects/${projectId}`
        : `https://github.com/${repo.fullName}/tree/${sync.currentBranch}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setSavePushError(e instanceof Error ? e.message : 'Push failed');
    }
  }, [repo?.fullName, repo?.htmlUrl, projectId, sync]);

  // "Saved 12s ago" formatter — re-renders periodically via tick state below.
  const [, forceTickRender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTickRender((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  const formatRelative = (date: Date | null): string => {
    if (!date) return 'never';
    const ago = Math.round((Date.now() - date.getTime()) / 1000);
    if (ago < 5) return 'just now';
    if (ago < 60) return `${ago}s ago`;
    if (ago < 3600) return `${Math.round(ago / 60)}m ago`;
    return `${Math.round(ago / 3600)}h ago`;
  };

  const [confirmingClear, setConfirmingClear] = useState(false);
  const handleClearCanvas = useCallback(() => {
    // Two-step confirm without native window.confirm() — extensions and
    // some Chromium variants silently block native modals. Inline popover
    // is more reliable.
    if (!confirmingClear) {
      setConfirmingClear(true);
      // Auto-dismiss after 4s if user doesn't follow through.
      setTimeout(() => setConfirmingClear(false), 4000);
      return;
    }
    clearCanvasContent(ydoc);
    setConfirmingClear(false);
  }, [ydoc, confirmingClear]);

  // Manual fit-to-content trigger — InteractiveCanvas already auto-fits on
  // first content arrival; this lets the user re-fit after panning around.
  const handleFitContent = useCallback(() => {
    window.dispatchEvent(new CustomEvent('justdoit:fit-content'));
  }, []);

  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const submitToBrains = useCallback((prompt: string, context?: string): boolean => {
    if (!getActiveConnection()) {
      setPipelineError('No AI connection configured. Open Settings → AI to add one.');
      return false;
    }
    setPipelineError(null);
    ensureLeadBrain(registry, brainNodes);

    // Auto-spawn specialist Brains whose triggers match the prompt. A user
    // typing "design an architecture for an autonomous website" auto-brings
    // Architect, Designer, and (because "autonomous" sounds review-worthy)
    // potentially Reviewer online without the user having to click templates.
    // map storage prefix back to template id (single source — used in both
    // the live-set + audience-routing computations below)
    const PREFIX_TO_TEMPLATE: Record<string, string> = {
      arch: 'architect',
      tarch: 'tech-architect',
      mind: 'mindmap',
      design: 'designer',
      data: 'data',
      review: 'reviewer',
      plot: 'plotter',
    };
    const liveByTemplate = new Set(
      brainNodes.filter((b) => !b.retiredAt).flatMap((b) => {
        const m = b.id.match(/^brain_([a-z]+)_/);
        if (!m) return [];
        return [PREFIX_TO_TEMPLATE[m[1]] ?? m[1]];
      }),
    );
    const matchedTemplateIds = new Set<string>();
    for (const route of TEMPLATE_TRIGGERS) {
      if (!route.triggers.test(prompt)) continue;
      matchedTemplateIds.add(route.templateId);
      if (liveByTemplate.has(route.templateId)) continue;
      const tpl = BRAIN_TEMPLATES.find((t) => t.id === route.templateId);
      if (!tpl) continue;
      registry.spawn(tpl.buildSpec(), tpl.defaultZone, tpl.defaultCursor);
    }

    // Pre-route: only Lead + specialist Brains whose triggers matched receive
    // this user_prompt. Saves the "irrelevant peer wakes, decides silence,
    // costs 4k tokens to think nothing" pattern. Other peers can still
    // collaborate via direct message_brain.
    const templatePrefixForBrainId = (id: string): string | null => {
      const m = id.match(/^brain_([a-z]+)_/);
      if (!m) return null;
      return PREFIX_TO_TEMPLATE[m[1]] ?? m[1];
    };
    const audience = new Set<string>();
    // After spawn() the registry list grew — fetch fresh.
    for (const b of registry.list()) {
      if (b.id === 'lead-brain') { audience.add(b.id); continue; }
      const tplId = templatePrefixForBrainId(b.id);
      if (tplId && matchedTemplateIds.has(tplId)) audience.add(b.id);
    }

    eventBus.publish(makeEvent(
      'user_prompt',
      { prompt, context: context ?? '', audience: Array.from(audience) },
      { authorId: 'user' },
    ));
    return true;
  }, [getActiveConnection, registry, brainNodes, eventBus]);

  // Auto-hide the pipeline error after 6s.
  useEffect(() => {
    if (!pipelineError) return;
    const id = setTimeout(() => setPipelineError(null), 6000);
    return () => clearTimeout(id);
  }, [pipelineError]);

  // Remember this project as the active one
  useEffect(() => {
    if (projectId) {
      setActiveProject(projectId);
    }
  }, [projectId, setActiveProject]);

  // Panel state
  const [panelWidth, setPanelWidth] = useState(35);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeBrainTool, setActiveBrainTool] = useState<ToolBehavior | null>(null);

  // Fullscreen / chat panel state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPinned, setIsPinned] = useState(true);
  const [chatVisible, setChatVisible] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Keyboard shortcuts:
  //   Ctrl+\ → toggle fullscreen
  //   Ctrl+S → manual save (overrides browser "save page as" which has no
  //   sensible meaning here)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        setIsFullscreen(prev => !prev);
        setChatVisible(false);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleManualSave]);

  // Left edge hover to reveal chat in fullscreen mode
  const handleEdgeEnter = useCallback(() => {
    if (!isFullscreen) return;
    hoverTimeoutRef.current = setTimeout(() => setChatVisible(true), 200);
  }, [isFullscreen]);

  const handleEdgeLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      if (!prev) {
        setIsPinned(false);
        setChatVisible(false);
      } else {
        setIsPinned(true);
        setChatVisible(false);
      }
      return !prev;
    });
  }, []);

  // Pin chat panel back to split view
  const pinChat = useCallback(() => {
    setIsFullscreen(false);
    setIsPinned(true);
    setChatVisible(false);
  }, []);

  // No project
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: 'var(--bg-app)' }}>
        <div className="text-center space-y-3">
          <div className="text-4xl">📂</div>
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No project selected</h3>
          <button onClick={() => router.push('/home')}
            className="text-xs text-blue-500 hover:text-blue-400">← Go to Home</button>
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: 'var(--bg-app)' }}>
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Drag handler for resizable panel
  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setIsDragging(true);
    function handleMouseMove(e: MouseEvent) {
      const newWidth = (e.clientX / window.innerWidth) * 100;
      setPanelWidth(Math.max(20, Math.min(60, newWidth)));
    }
    function handleMouseUp() {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  return (
    <div className="flex h-full select-none relative" style={{ backgroundColor: 'var(--canvas-bg, #f5f5f5)' }}>

      {/* ── Canvas Area ────────────────────────────────────────────────── */}
      <div className="flex-1 h-full w-full relative" data-canvas-root="true">
        {/* Top-right action buttons */}
        <div className="absolute top-3 right-4 z-10 flex gap-2 items-center">
          {/* Save status indicator — small text next to the buttons */}
          <span
            className="text-[11px] mr-1 select-none"
            style={{
              color:
                sync.syncState.syncStatus === 'error'
                  ? '#dc2626'
                  : sync.issyncing
                    ? 'var(--text-tertiary, var(--text-secondary))'
                    : sync.isDirty
                      ? '#d97706'
                      : 'var(--text-tertiary, var(--text-secondary))',
            }}
            title={
              repo?.fullName
                ? `${repo.fullName} • branch ${sync.currentBranch}`
                : 'No GitHub repo connected'
            }
          >
            {sync.issyncing
              ? 'Syncing…'
              : sync.syncState.syncStatus === 'error'
                ? 'Save failed'
                : sync.isDirty
                  ? 'Unsaved'
                  : sync.lastSavedAt
                    ? `Saved ${formatRelative(sync.lastSavedAt)}`
                    : 'Not saved'}
          </span>
          <button
            onClick={handleManualSave}
            disabled={sync.issyncing || !repo?.fullName}
            title={
              !repo?.fullName
                ? 'Connect a GitHub repo to enable saving'
                : 'Save current canvas to GitHub (Ctrl+S)'
            }
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--toolbar-bg, var(--bg-panel))',
              border: '1px solid var(--border-subtle, var(--border-color))',
            }}
          >
            {sync.issyncing ? '⏳ Saving…' : '💾 Save'}
          </button>
          <button
            onClick={handleManualPush}
            disabled={sync.issyncing || !repo?.fullName}
            title={
              !repo?.fullName
                ? 'Connect a GitHub repo to enable push'
                : 'Save the canvas and open the repo on GitHub'
            }
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--toolbar-bg, var(--bg-panel))',
              border: '1px solid var(--border-subtle, var(--border-color))',
            }}
          >
            ⬆ Push & View
          </button>
          <button onClick={handleFitContent} title="Fit canvas to content"
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--toolbar-bg, var(--bg-panel))',
              border: '1px solid var(--border-subtle, var(--border-color))',
            }}>
            ⤢ Fit
          </button>
          <button onClick={handleClearCanvas} title="Clear all drawings (Brains stay)"
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              color: confirmingClear ? '#ffffff' : 'var(--text-secondary)',
              backgroundColor: confirmingClear ? '#dc2626' : 'var(--toolbar-bg, var(--bg-panel))',
              border: `1px solid ${confirmingClear ? '#dc2626' : 'var(--border-subtle, var(--border-color))'}`,
            }}>
            {confirmingClear ? '⚠ Click again to confirm' : '🧹 Clear'}
          </button>
          <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen (Ctrl+\\)' : 'Fullscreen canvas (Ctrl+\\)'}
            className="px-2 py-1 rounded text-xs transition-colors hidden"
            style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--toolbar-bg)', border: '1px solid var(--border-subtle)' }}>
            {isFullscreen ? '⤡' : '⤢'}
          </button>
        </div>

        <InteractiveCanvas
          actions={[]}
          messages={[]}
          agentStatuses={[]}
          enabledAgents={[]}
          pendingInstruction={null}
          onInstructionHandled={() => {}}
          onTriggerOrchestrator={() => {}}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          activeBrainTool={activeBrainTool}
          onBrainToolConsumed={() => { setActiveTool(null); setActiveBrainTool(null); }}
          projectName={projectId.slice(0, 8)}
          onCanvasSync={syncCanvas}
        />

        {/* Pipeline error toast — shown above the prompt bar when something
            silently failed (no AI connection, etc) so the user knows why. */}
        {pipelineError && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium pointer-events-none"
               style={{ background: '#7f1d1d', color: '#fee2e2', border: '1px solid #b91c1c', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
            {pipelineError}
          </div>
        )}

        {/* Save/Push error toast */}
        {savePushError && (
          <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium pointer-events-none"
               style={{ background: '#7f1d1d', color: '#fee2e2', border: '1px solid #b91c1c', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
            ⚠ {savePushError}
          </div>
        )}

        {/* Floating Prompt Bar (Omnibar) */}
        <FloatingPromptBar
          projectId={projectId}
          isRunning={false}
          brainPipelineReady={Boolean(getActiveConnection())}
          onSendInstruction={(prompt, context) => {
            submitToBrains(prompt, context);
          }}
          getCanvasContext={getCanvasContext}
        />

        {/* FigJam-style toolbar (bottom-center, above the prompt bar) */}
        <FigJamToolbar
          activeToolId={activeTool}
          onToolChange={(id, behavior) => { setActiveTool(id); setActiveBrainTool(behavior); }}
        />
      </div>

      {/* Slide-in animation */}
      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
