'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import * as Y from 'yjs';
import { BrainsCanvasLayer } from './BrainsCanvasLayer';
import { useBrainNodes, useCanvasNodes as useBrainCanvasNodes } from '@/lib/brains/provider';
import { WebrtcProvider } from 'y-webrtc';
import type { CanvasAction, NodeAction, EdgeAction, DiagramAction, AgentStatus } from '@/lib/orchestrator/types';
import type { ChatMessage, AgentDef } from '@/lib/ai/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CanvasNode {
  id: string;
  label: string;
  type: NodeAction['type'];
  description?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  metadata?: Record<string, string>;
}

interface CanvasGroup {
  id: string;
  label: string;
  nodeIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  type: EdgeAction['type'];
  midPoint?: { x: number; y: number };
}

interface CanvasPath {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

interface CanvasDiagram {
  id: string;
  htmlContent: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InteractiveCanvasProps {
  actions: CanvasAction[];
  messages?: ChatMessage[];
  agentStatuses?: Record<string, AgentStatus>;
  enabledAgents?: AgentDef[];
  pendingInstruction?: {prompt: string, context: string} | null;
  onInstructionHandled?: () => void;
  onTriggerOrchestrator?: (prompt: string, context: string) => void;
  activeTool: string | null;
  onToolChange?: (toolId: string | null) => void;
  // Behavior of the active toolbar tool, threaded straight to the
  // BrainsCanvasLayer so click-to-place + connector-draw can work without
  // routing through the legacy canvas's tool model.
  activeBrainTool?: import('@/lib/canvas/tool-catalog').ToolBehavior | null;
  onBrainToolConsumed?: () => void;
  projectName?: string;
  onCanvasSync?: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EDGE_COLORS: Record<string, { color: string; dash: string }> = {
  data_flow: { color: '#10b981', dash: '' },
  dependency: { color: '#374151', dash: '' },
  api_call: { color: '#8b5cf6', dash: '' },
  event: { color: '#f59e0b', dash: '4,4' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getHandles(x: number, y: number, w: number, h: number) {
  return [
    { cx: x, cy: y, cursor: 'nw-resize' },
    { cx: x + w, cy: y, cursor: 'ne-resize' },
    { cx: x + w, cy: y + h, cursor: 'se-resize' },
    { cx: x, cy: y + h, cursor: 'sw-resize' },
  ];
}

function getConnectorAnchors(x: number, y: number, w: number, h: number) {
  return [
    { cx: x + w / 2, cy: y, side: 'top' },
    { cx: x + w, cy: y + h / 2, side: 'right' },
    { cx: x + w / 2, cy: y + h, side: 'bottom' },
    { cx: x, cy: y + h / 2, side: 'left' },
  ];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function InteractiveCanvas({
  actions,
  messages = [],
  agentStatuses = {},
  enabledAgents = [],
  pendingInstruction,
  onInstructionHandled,
  onTriggerOrchestrator,
  activeTool,
  onToolChange,
  activeBrainTool,
  onBrainToolConsumed,
  projectName,
  onCanvasSync
}: InteractiveCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  
  // React State for Rendering (Synced with Yjs)
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [paths, setPaths] = useState<CanvasPath[]>([]);
  const [diagrams, setDiagrams] = useState<CanvasDiagram[]>([]);
  const [groups, setGroups] = useState<CanvasGroup[]>([]);
  const [awarenessUsers, setAwarenessUsers] = useState<any[]>([]);

  // Animation tracking — newly created node IDs for fade-in
  const [animatingNodeIds, setAnimatingNodeIds] = useState<Set<string>>(new Set());
  const [animatingEdgeIds, setAnimatingEdgeIds] = useState<Set<string>>(new Set());
  // Track which actions we've already processed
  const processedActionsRef = useRef<Set<string>>(new Set());
  
  // Human-like Action Pacing Queue (Multi-Agent)
  const agentQueuesRef = useRef<Record<string, CanvasAction[]>>({});
  const isProcessingQueueRef = useRef<Record<string, boolean>>({});
  const brainTargetsRef = useRef<Record<string, {x: number, y: number}>>({});

  // Persistent Brains & Greeting Choreography
  const userCursorRef = useRef<{x: number, y: number}>({ x: 400, y: 300 });
  const [greeted, setGreeted] = useState(false);
  const patrolTargetsRef = useRef<Record<string, {x: number, y: number}>>({});
  
  // Instruction Routing Choreography (Phase 5)
  const [leadBrainStatus, setLeadBrainStatus] = useState<{message: string, isReading: boolean} | null>(null);
  
  // Plotter Brain Intervention (Phase 3)
  const [plotterStatus, setPlotterStatus] = useState<{message: string, isWorking: boolean} | null>(null);
  // Tracks which node IDs the Plotter has already organized. Re-runs when the
  // set of nodes changes (new arrivals), so late additions get organized too.
  const layoutedIdsRef = useRef<Set<string>>(new Set());

  // Yjs References
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebrtcProvider | null>(null);
  const yNodesRef = useRef<Y.Map<CanvasNode> | null>(null);
  const yEdgesRef = useRef<Y.Map<CanvasEdge> | null>(null);
  const yPathsRef = useRef<Y.Map<CanvasPath> | null>(null);

  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, zoom: 1 });

  // Brain Y.Doc reads — used both for the empty-state watermark gate and
  // the auto-fit calculation below. Must be declared before fitToContent.
  const _brainNodes = useBrainCanvasNodes();
  const _brainList = useBrainNodes();

  // ── Auto-fit to content ───────────────────────────────────────────────────
  // After Brain content arrives, pan/zoom so everything in b_nodes + active
  // Brain cursors fits the viewport. Re-fits on window resize so the canvas
  // adapts to monitor size automatically. Only auto-fits ONCE per "empty →
  // non-empty" transition so user pans/zooms aren't clobbered.
  const didAutoFitRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitToContent = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const screenW = container.clientWidth;
    const screenH = container.clientHeight;
    if (screenW < 100 || screenH < 100) return;

    type Box = { x: number; y: number; w: number; h: number };
    const boxes: Box[] = [];
    for (const n of _brainNodes) {
      const nn = n as { type: string; x?: number; y?: number; w?: number; h?: number };
      if (typeof nn.x === 'number' && typeof nn.y === 'number' && typeof nn.w === 'number' && typeof nn.h === 'number') {
        boxes.push({ x: nn.x, y: nn.y, w: nn.w, h: nn.h });
      }
    }
    for (const b of _brainList) {
      if (b.retiredAt || b.state === 'retired') continue;
      boxes.push({ x: b.cursor.x - 20, y: b.cursor.y - 20, w: 60, h: 40 });
    }
    if (boxes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of boxes) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    const bw = Math.max(50, maxX - minX);
    const bh = Math.max(50, maxY - minY);
    const padding = 0.12; // 12% gutter on each axis
    const zoom = Math.max(0.15, Math.min(2, Math.min(screenW / bw, screenH / bh) * (1 - padding * 2)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewport({ x: screenW / 2 - cx * zoom, y: screenH / 2 - cy * zoom, zoom });
  }, [_brainNodes, _brainList]);

  useEffect(() => {
    // First time content shows up → auto-fit. After that, respect user pans.
    if (didAutoFitRef.current) return;
    if (_brainNodes.length > 0 || _brainList.some((b) => !b.retiredAt && b.state !== 'retired')) {
      // Defer one frame so the container has its real size.
      const id = requestAnimationFrame(() => {
        fitToContent();
        didAutoFitRef.current = true;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [_brainNodes.length, _brainList, fitToContent]);

  useEffect(() => {
    // On window resize re-run fit so the canvas adapts to monitor size.
    // Also listen for the page-level "Fit" button event.
    const onResize = () => {
      if (didAutoFitRef.current) fitToContent();
    };
    const onFitRequest = () => {
      didAutoFitRef.current = true;
      fitToContent();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('justdoit:fit-content', onFitRequest);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('justdoit:fit-content', onFitRequest);
    };
  }, [fitToContent]);

  // Selection State
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Interaction State
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [drawingPathId, setDrawingPathId] = useState<string | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; vpX: number; vpY: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currX: number; currY: number } | null>(null);
  const [draggingNodes, setDraggingNodes] = useState<{ offsets: { id: string; offsetX: number; offsetY: number }[] } | null>(null);
  const [draggingEdge, setDraggingEdge] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);

  // ── Yjs Initialization ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const doc = new Y.Doc();
    ydocRef.current = doc;

    // Use a unique room name for the project, or fallback to a default
    const roomName = projectName ? `justdoit-${projectName.replace(/\s+/g, '-').toLowerCase()}` : 'justdoit-canvas-room';
    
    // Using default public signaling servers for zero-config local testing
    const provider = new WebrtcProvider(roomName, doc, {
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com', 'wss://y-webrtc-signaling-us.herokuapp.com']
    });
    providerRef.current = provider;

    const yNodes = doc.getMap<CanvasNode>('nodes');
    const yEdges = doc.getMap<CanvasEdge>('edges');
    const yPaths = doc.getMap<CanvasPath>('paths');

    yNodesRef.current = yNodes;
    yEdgesRef.current = yEdges;
    yPathsRef.current = yPaths;

    const updateReactState = () => {
      setNodes(Array.from(yNodes.values()));
      setEdges(Array.from(yEdges.values()));
      setPaths(Array.from(yPaths.values()));
    };

    yNodes.observe(updateReactState);
    yEdges.observe(updateReactState);
    yPaths.observe(updateReactState);
    
    // Initial sync
    updateReactState();

    // Setup Awareness (Multiplayer Cursors)
    const awareness = provider.awareness;
    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#ec4899'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    awareness.setLocalStateField('user', {
      name: 'Human',
      color: randomColor,
    });

    awareness.on('change', () => {
      const states = Array.from(awareness.getStates().entries())
        .filter(([clientId]) => clientId !== awareness.clientID)
        .map(([_, state]) => state);
      setAwarenessUsers(states);
    });

    return () => {
      provider.destroy();
      doc.destroy();
    };
  }, [projectName]);

  const handleMouseMoveAwareness = useCallback((x: number, y: number) => {
    if (!providerRef.current) return;
    providerRef.current.awareness.setLocalStateField('cursor', { x, y });
    userCursorRef.current = { x, y };

    // Trigger greeting once on first movement
    if (!greeted) {
      setGreeted(true);
      // Wait 3 seconds then remove greeting
      setTimeout(() => setGreeted(false), 4000);
    }
  }, [greeted]);

  // ── Sync canvas state to parent for AI context ─────────────────────────────
  useEffect(() => {
    if (onCanvasSync) {
      onCanvasSync(nodes, edges);
    }
  }, [nodes, edges, onCanvasSync]);

  // ── Phase 5: Distributed Instruction Transfer ───────────────────────────────
  useEffect(() => {
    if (pendingInstruction && enabledAgents && enabledAgents.length > 0 && onTriggerOrchestrator && onInstructionHandled) {
      const prompt = pendingInstruction.prompt;
      const context = pendingInstruction.context;
      
      // Step 1: Fly to console and read
      setLeadBrainStatus({ message: `Reading task: "${prompt.slice(0, 30)}..."`, isReading: true });
      
      // Step 2: Acknowledge and Delegate
      setTimeout(() => {
        setLeadBrainStatus({ message: "Got it! Delegating to the team...", isReading: true });
        
        // Step 3: Trigger actual LLM stream
        setTimeout(() => {
          setLeadBrainStatus(null); // Release control back to LLM stream
          onTriggerOrchestrator(prompt, context);
          onInstructionHandled();
        }, 1500);
      }, 1500);
    }
  }, [pendingInstruction, enabledAgents, onTriggerOrchestrator, onInstructionHandled]);

  // ── Phase 3: Plotter Brain Auto-Layout Intervention ───────────────────────
  // Re-runs whenever the set of node IDs changes (not just on first layout),
  // so new nodes added after the initial diagram still get organized.
  // Covers every node type — anything not UI/API/Data lands in an "Other" lane
  // instead of being left at the overlapping incoming positions.
  useEffect(() => {
    if (!enabledAgents?.find(a => a.id === 'plotter-agent')) return;

    const isStreaming = messages?.some(m => m.isStreaming);
    const hasPendingQueues = Object.values(isProcessingQueueRef.current).some(v => v);
    if (isStreaming || hasPendingQueues || pendingInstruction || plotterStatus?.isWorking) return;
    if (nodes.length < 2) return;

    // Skip if we already organized this exact set.
    const currentIds = nodes.map(n => n.id);
    const prev = layoutedIdsRef.current;
    if (currentIds.length === prev.size && currentIds.every(id => prev.has(id))) return;

    // Wait 1 second before intervening.
    const timer = setTimeout(() => {
      setPlotterStatus({ message: 'Aligning architecture and generating regions...', isWorking: true });

      const centerX = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
      const centerY = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
      brainTargetsRef.current['plotter-agent'] = { x: centerX, y: centerY };

      setTimeout(() => {
        ydocRef.current?.transact(() => {
          const uis = nodes.filter(n => n.type === 'ui');
          const apis = nodes.filter(n => n.type === 'api' || n.type === 'service');
          const dbs = nodes.filter(n => n.type === 'database' || n.type === 'external');
          const placed = new Set<string>([...uis, ...apis, ...dbs].map(n => n.id));
          const others = nodes.filter(n => !placed.has(n.id));

          let currentY = 100;
          const newGroups: CanvasGroup[] = [];

          const layoutSection = (sectionNodes: CanvasNode[], label: string) => {
            if (sectionNodes.length === 0) return;
            let minX = 9999, maxX = 0;
            sectionNodes.forEach((n, i) => {
              const updated = { ...n, x: 200 + i * 260, y: currentY };
              yNodesRef.current?.set(n.id, updated);
              if (updated.x < minX) minX = updated.x;
              if (updated.x + updated.width > maxX) maxX = updated.x + updated.width;
            });
            newGroups.push({
              id: `group-${label.replace(/\W+/g, '-').toLowerCase()}`,
              label,
              nodeIds: sectionNodes.map(n => n.id),
              x: minX - 40,
              y: currentY - 60,
              width: (maxX - minX) + 80,
              height: 200,
            });
            currentY += 260;
          };

          layoutSection(uis, 'Frontend / UI Layer');
          layoutSection(apis, 'Backend / API Layer');
          layoutSection(dbs, 'Data / Storage Layer');
          layoutSection(others, 'Other');

          setGroups(newGroups);
          layoutedIdsRef.current = new Set(currentIds);
        });

        setTimeout(() => setPlotterStatus(null), 2000);
      }, 1500);
    }, 1000);

    return () => clearTimeout(timer);
  }, [messages, pendingInstruction, nodes, enabledAgents, plotterStatus?.isWorking]);

  // ── Sync Orchestrator Actions to Yjs (Parallel Multi-Agent Pacing) ─────────
  
  const processAgentQueue = useCallback((agentId: string) => {
    if (!agentQueuesRef.current[agentId] || agentQueuesRef.current[agentId].length === 0) {
      isProcessingQueueRef.current[agentId] = false;
      return;
    }
    
    isProcessingQueueRef.current[agentId] = true;
    const action = agentQueuesRef.current[agentId][0]; // Peek first
    
    if (!ydocRef.current || !yNodesRef.current || !yEdgesRef.current) return;

    if (action.type === 'create_node') {
      const p = action.payload as NodeAction;
      if (!yNodesRef.current.has(p.id)) {
        const existingCount = yNodesRef.current.size;
        const targetX = p.position?.x ?? (100 + (existingCount % 3) * 280);
        const targetY = p.position?.y ?? (100 + Math.floor(existingCount / 3) * 200);
        
        // Step 1: Fly to Left Toolbar
        brainTargetsRef.current[agentId] = { x: 30, y: 400 }; 
        
        setTimeout(() => {
          // Step 2: Fly back to Canvas coordinates
          brainTargetsRef.current[agentId] = { x: targetX, y: targetY };
          
          setTimeout(() => {
            // Step 3: Drop the Node
            agentQueuesRef.current[agentId].shift(); // Remove from queue
            
            ydocRef.current?.transact(() => {
              yNodesRef.current!.set(p.id, {
                id: p.id, label: p.label, type: p.type, description: p.description,
                x: targetX, y: targetY,
                width: 200, height: 72, metadata: p.metadata,
              });
            });

            setAnimatingNodeIds(prev => new Set([...prev, p.id]));
            setTimeout(() => {
              setAnimatingNodeIds(prev => {
                const next = new Set(prev);
                next.delete(p.id);
                return next;
              });
            }, 600);

            // Small rest before next action
            setTimeout(() => processAgentQueue(agentId), 200);
          }, 600); // Travel back
        }, 600); // Travel to toolbar
        return;
      }
    } else if (action.type === 'create_edge') {
      agentQueuesRef.current[agentId].shift();
      const p = action.payload as EdgeAction;
      
      if (yNodesRef.current.has(p.sourceId) && yNodesRef.current.has(p.targetId)) {
        ydocRef.current.transact(() => {
          if (!yEdgesRef.current!.has(p.id)) {
            yEdgesRef.current!.set(p.id, { id: p.id, sourceId: p.sourceId, targetId: p.targetId, label: p.label, type: p.type });
            setAnimatingEdgeIds(prev => new Set([...prev, p.id]));
            setTimeout(() => {
              setAnimatingEdgeIds(prev => {
                const next = new Set(prev);
                next.delete(p.id);
                return next;
              });
            }, 800);
          }
        });
        setTimeout(() => processAgentQueue(agentId), 400); // Edges draw faster
        return;
      } else {
        // Nodes not ready, push to back
        agentQueuesRef.current[agentId].push(action);
        setTimeout(() => processAgentQueue(agentId), 100);
        return;
      }
    } else if (action.type === 'create_diagram') {
      agentQueuesRef.current[agentId].shift();
      const p = action.payload as DiagramAction;
      setDiagrams(prev => {
        if (prev.some(d => d.id === p.id)) return prev;
        return [...prev, {
          id: p.id, htmlContent: p.htmlContent,
          x: p.position?.x ?? 100, y: p.position?.y ?? 100,
          width: p.width, height: p.height,
        }];
      });
      setTimeout(() => processAgentQueue(agentId), 400);
      return;
    }

    // Default fallback
    agentQueuesRef.current[agentId].shift();
    setTimeout(() => processAgentQueue(agentId), 100);
  }, []);

  useEffect(() => {
    if (actions.length === 0 || !ydocRef.current || !yNodesRef.current || !yEdgesRef.current) return;
    
    const newActions = actions.filter(a => {
      const key = `${a.type}:${(a.payload as any).id}`;
      return !processedActionsRef.current.has(key);
    });

    if (newActions.length === 0) return;

    // Preferred assignee by node type. Falls back to any enabled non-Plotter
    // Brain so we never animate a phantom cursor for a Brain the user hasn't
    // enabled. If NO Brain is enabled to do the work, drop the node directly —
    // no fake choreography.
    const enabledIds = new Set(
      (enabledAgents ?? []).filter(a => a.enabled && a.id !== 'plotter-agent').map(a => a.id),
    );
    const firstEnabled = (enabledAgents ?? []).find(a => a.enabled && a.id !== 'plotter-agent')?.id;

    for (const action of newActions) {
      const key = `${action.type}:${(action.payload as any).id}`;
      processedActionsRef.current.add(key);

      let assignee = 'arch-agent';
      if (action.type === 'create_node') {
        const type = (action.payload as NodeAction).type;
        if (type === 'ui') assignee = 'design-agent';
        else if (type === 'database') assignee = 'data-agent';
        else if (type === 'service' || type === 'api') assignee = 'arch-agent';
        else if (type === 'external') assignee = 'biz-agent';
      }

      if (!enabledIds.has(assignee)) {
        if (firstEnabled) {
          assignee = firstEnabled;
        } else if (action.type === 'create_node' && ydocRef.current && yNodesRef.current) {
          // No Brain enabled — drop directly, honestly, with no flight animation.
          const p = action.payload as NodeAction;
          const tx = p.position?.x ?? 100;
          const ty = p.position?.y ?? 100;
          if (!yNodesRef.current.has(p.id)) {
            ydocRef.current.transact(() => {
              yNodesRef.current!.set(p.id, {
                id: p.id, label: p.label, type: p.type, description: p.description,
                x: tx, y: ty, width: 200, height: 72, metadata: p.metadata,
              });
            });
          }
          continue;
        }
      }

      if (!agentQueuesRef.current[assignee]) {
        agentQueuesRef.current[assignee] = [];
      }
      agentQueuesRef.current[assignee].push(action);
    }

    // Trigger processing for all updated queues
    Object.keys(agentQueuesRef.current).forEach(agentId => {
      if (!isProcessingQueueRef.current[agentId]) {
        processAgentQueue(agentId);
      }
    });
  }, [actions, processAgentQueue]);
  // ── Handlers ──────────────────────────────────────────────────────────────
  const getMousePos = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - viewport.x) / viewport.zoom,
      y: (e.clientY - rect.top - viewport.y) / viewport.zoom
    };
  };

  const handleCanvasClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingNodes || draggingEdge || panning || drawingPathId || selectionBox || activeTool === 'hand' || isSpacePressed) return;

    if (!(e.target as HTMLElement).closest('.canvas-node') && !(e.target as HTMLElement).closest('.canvas-edge')) {
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
      setEditingNodeId(null);
    }

    if (!activeTool || activeTool === 'pen' || activeTool === 'select') return;

    const { x, y } = getMousePos(e);

    const toolNodeMap: Record<string, { type: NodeAction['type']; label: string }> = {
      rect: { type: 'service', label: 'Service' },
      ellipse: { type: 'api', label: 'API' },
      flowchart: { type: 'service', label: 'Process' },
      uml: { type: 'service', label: 'Class' },
      mindmap: { type: 'decision', label: 'Idea' },
      text: { type: 'decision', label: 'Note' },
      sticky: { type: 'ui', label: 'Sticky Note' },
      triangle: { type: 'external', label: 'External' },
      arrow: { type: 'decision', label: 'Arrow' },
    };

    const config = toolNodeMap[activeTool];
    if (config && yNodesRef.current) {
      const newNodeId = `node-${crypto.randomUUID().slice(0, 8)}`;
      yNodesRef.current.set(newNodeId, {
        id: newNodeId,
        label: activeTool === 'text' ? 'New Text' : '', type: config.type,
        x: x - 100, y: y - 36, width: 200, height: 72,
        metadata: { shape: activeTool }
      });
      setSelectedNodeIds([newNodeId]);
      if (activeTool === 'text') setEditingNodeId(newNodeId);
      if (onToolChange) onToolChange('select');
    }
  }, [activeTool, draggingNodes, draggingEdge, panning, drawingPathId, selectionBox, viewport, isSpacePressed, onToolChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Kept for completeness, but the real listener is a window-level one
    // (see useEffect below) — when the cursor is over a Brain-placed shape
    // in BrainsCanvasLayer, the wheel event bubbles to that sibling layer,
    // not to this SVG. Without the window listener, alt+wheel only worked
    // on empty canvas regions.
    if (!e.altKey && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setViewport(v => ({ ...v, zoom: Math.max(0.15, Math.min(4, v.zoom * delta)) }));
  }, []);

  // Window-level wheel listener — catches alt+wheel regardless of which
  // layer (InteractiveCanvas or BrainsCanvasLayer) the cursor happens to
  // be over. Non-passive so we can preventDefault. Filtered to events
  // whose target is inside the canvas root via the data attribute below.
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.altKey && !e.ctrlKey && !e.metaKey) return;
      const target = e.target as Element | null;
      if (!target?.closest('[data-canvas-root="true"]')) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      setViewport(v => ({ ...v, zoom: Math.max(0.15, Math.min(4, v.zoom * delta)) }));
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (activeTool === 'hand' || isSpacePressed))) {
      setPanning({ startX: e.clientX, startY: e.clientY, vpX: viewport.x, vpY: viewport.y });
    } else if (e.button === 0 && (activeTool === 'select' || !activeTool) && !(e.target as HTMLElement).closest('.canvas-node') && !(e.target as HTMLElement).closest('.canvas-edge')) {
      const { x, y } = getMousePos(e);
      setSelectionBox({ startX: x, startY: y, currX: x, currY: y });
      if (!e.shiftKey) {
        setSelectedNodeIds([]);
        setSelectedEdgeIds([]);
      }
      setEditingNodeId(null);
    } else if (e.button === 0 && activeTool === 'pen') {
      const { x, y } = getMousePos(e);
      const newPathId = `path-${crypto.randomUUID().slice(0, 8)}`;
      if (yPathsRef.current) {
        yPathsRef.current.set(newPathId, { id: newPathId, points: [{x, y}], color: 'var(--canvas-edge)', width: 3 });
      }
      setDrawingPathId(newPathId);
    }
  }, [activeTool, isSpacePressed, viewport]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getMousePos(e);
    handleMouseMoveAwareness(x, y);

    if (panning) {
      setViewport(v => ({ ...v, x: panning.vpX + (e.clientX - panning.startX), y: panning.vpY + (e.clientY - panning.startY) }));
    } else if (drawingPathId && yPathsRef.current) {
      const path = yPathsRef.current.get(drawingPathId);
      if (path) {
        yPathsRef.current.set(drawingPathId, { ...path, points: [...path.points, {x, y}] });
      }
    } else if (selectionBox) {
      setSelectionBox(prev => prev ? { ...prev, currX: x, currY: y } : null);
      
      const minX = Math.min(selectionBox.startX, x);
      const maxX = Math.max(selectionBox.startX, x);
      const minY = Math.min(selectionBox.startY, y);
      const maxY = Math.max(selectionBox.startY, y);
      
      const newSelectedNodes = nodes.filter(n => 
        n.x < maxX && (n.x + n.width) > minX && n.y < maxY && (n.y + n.height) > minY
      ).map(n => n.id);
      
      setSelectedNodeIds(newSelectedNodes);
    } else if (draggingNodes && yNodesRef.current) {
      const snap = 20;
      ydocRef.current?.transact(() => {
        for (const offsetInfo of draggingNodes.offsets) {
          const n = yNodesRef.current!.get(offsetInfo.id);
          if (n) {
            const rawX = x - offsetInfo.offsetX;
            const rawY = y - offsetInfo.offsetY;
            yNodesRef.current!.set(offsetInfo.id, { ...n, x: Math.round(rawX / snap) * snap, y: Math.round(rawY / snap) * snap });
          }
        }
      });
    } else if (draggingEdge && yEdgesRef.current) {
      const snap = 20;
      const ed = yEdgesRef.current.get(draggingEdge.id);
      if (ed) {
        yEdgesRef.current.set(draggingEdge.id, { 
          ...ed, 
          midPoint: { x: Math.round((x - draggingEdge.offsetX) / snap) * snap, y: Math.round((y - draggingEdge.offsetY) / snap) * snap } 
        });
      }
    }
  }, [panning, draggingNodes, draggingEdge, drawingPathId, selectionBox, viewport, nodes, handleMouseMoveAwareness]);

  const handleMouseUp = useCallback(() => { 
    setPanning(null); 
    setDraggingNodes(null);
    setDraggingEdge(null);
    setDrawingPathId(null); 
    setSelectionBox(null);
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (activeTool === 'hand' || isSpacePressed) return;
    e.stopPropagation();
    if (activeTool === 'pen') return;
    
    let newSelection = selectedNodeIds;
    if (!selectedNodeIds.includes(nodeId)) {
      if (e.shiftKey) {
        newSelection = [...selectedNodeIds, nodeId];
      } else {
        newSelection = [nodeId];
      }
      setSelectedNodeIds(newSelection);
    }
    setSelectedEdgeIds([]);
    if (editingNodeId !== nodeId) setEditingNodeId(null);
    
    const { x, y } = getMousePos(e);
    const offsets = newSelection.map(id => {
      const n = nodes.find(node => node.id === id);
      return n ? { id, offsetX: x - n.x, offsetY: y - n.y } : null;
    }).filter(Boolean) as { id: string; offsetX: number; offsetY: number }[];
    
    setDraggingNodes({ offsets });
  }, [nodes, viewport, activeTool, selectedNodeIds, isSpacePressed, editingNodeId]);

  const handleNodeDoubleClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (activeTool === 'hand' || isSpacePressed || activeTool === 'pen') return;
    e.stopPropagation();
    setEditingNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
  }, [activeTool, isSpacePressed]);

  const handleEdgeMouseDown = useCallback((e: React.MouseEvent, edgeId: string, edgeMidX: number, edgeMidY: number) => {
    if (activeTool === 'hand' || isSpacePressed) return;
    e.stopPropagation();
    if (activeTool === 'pen') return;
    
    setSelectedEdgeIds([edgeId]);
    setSelectedNodeIds([]);
    setEditingNodeId(null);
    
    const { x, y } = getMousePos(e);
    setDraggingEdge({ id: edgeId, offsetX: x - edgeMidX, offsetY: y - edgeMidY });
  }, [viewport, activeTool, isSpacePressed]);

  // ── Keyboard & Deletion ───────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    if (!ydocRef.current || !yNodesRef.current || !yEdgesRef.current) return;

    ydocRef.current.transact(() => {
      selectedNodeIds.forEach(id => yNodesRef.current!.delete(id));
      
      const edgesToDelete = edges.filter(ed => 
        selectedEdgeIds.includes(ed.id) || 
        selectedNodeIds.includes(ed.sourceId) || 
        selectedNodeIds.includes(ed.targetId)
      );
      
      edgesToDelete.forEach(ed => yEdgesRef.current!.delete(ed.id));
    });

    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setEditingNodeId(null);
  }, [selectedNodeIds, selectedEdgeIds, edges]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
      if (e.key === 'Escape') {
        setSelectedNodeIds([]);
        setSelectedEdgeIds([]);
        setEditingNodeId(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [deleteSelected]);

  // ── Auto-Connect ──────────────────────────────────────────────────────────
  const handleAutoConnect = useCallback((e: React.MouseEvent, sourceNodeId: string, side: string) => {
    e.stopPropagation();
    const source = nodes.find(n => n.id === sourceNodeId);
    if (!source || !yNodesRef.current || !yEdgesRef.current) return;

    const offset = 280;
    let dx = 0, dy = 0;
    if (side === 'right') dx = offset;
    else if (side === 'left') dx = -offset;
    else if (side === 'bottom') dy = offset * 0.7;
    else if (side === 'top') dy = -offset * 0.7;

    const newNodeId = `node-${crypto.randomUUID().slice(0, 8)}`;
    const newEdgeId = `edge-${crypto.randomUUID().slice(0, 8)}`;

    ydocRef.current?.transact(() => {
      yNodesRef.current!.set(newNodeId, {
        id: newNodeId,
        label: '',
        type: 'service',
        x: source.x + dx,
        y: source.y + dy,
        width: 200, height: 72
      });

      yEdgesRef.current!.set(newEdgeId, {
        id: newEdgeId,
        sourceId: sourceNodeId,
        targetId: newNodeId,
        type: 'dependency'
      });
    });

    setSelectedNodeIds([newNodeId]);
    setEditingNodeId(newNodeId);
  }, [nodes]);

  // ── Render Helpers ────────────────────────────────────────────────────────
  function getEdgePoints(edge: CanvasEdge) {
    const src = nodes.find(n => n.id === edge.sourceId);
    const tgt = nodes.find(n => n.id === edge.targetId);
    if (!src || !tgt) return null;

    const srcAnchors = getConnectorAnchors(src.x, src.y, src.width, src.height);
    const tgtAnchors = getConnectorAnchors(tgt.x, tgt.y, tgt.width, tgt.height);

    const tgtCenter = { x: tgt.x + tgt.width / 2, y: tgt.y + tgt.height / 2 };
    
    let bestSrc = srcAnchors[0];
    let minDistSrc = Infinity;
    for (const a of srcAnchors) {
      const d = Math.hypot(a.cx - tgtCenter.x, a.cy - tgtCenter.y);
      if (d < minDistSrc) { minDistSrc = d; bestSrc = a; }
    }

    let bestTgt = tgtAnchors[0];
    let minDistTgt = Infinity;
    for (const a of tgtAnchors) {
      const d = Math.hypot(a.cx - bestSrc.cx, a.cy - bestSrc.cy);
      if (d < minDistTgt) { minDistTgt = d; bestTgt = a; }
    }

    return {
      x1: bestSrc.cx, y1: bestSrc.cy, side1: bestSrc.side,
      x2: bestTgt.cx, y2: bestTgt.cy, side2: bestTgt.side,
    };
  }

  // Empty-state watermark only shows when BOTH the legacy nodes/edges/paths
  // AND the new b_nodes / b_brains maps are empty.
  const _brainContent = _brainNodes.length + _brainList.filter(b => !b.retiredAt && b.state !== 'retired').length;
  const isEmpty = nodes.length === 0 && edges.length === 0 && paths.length === 0 && _brainContent === 0;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden" style={{ backgroundColor: 'var(--canvas-bg)' }}>
      {projectName && (
        <div className="absolute top-3 left-4 z-10 text-xs font-mono flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <span>📋</span><span>{projectName}</span>
        </div>
      )}

      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center space-y-3 opacity-40">
            <div className="text-5xl">🗺️</div>
            <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Architecture Canvas</h3>
            <p className="text-xs max-w-[280px]" style={{ color: 'var(--text-muted)' }}>
              {activeTool ? `Click anywhere to use ${activeTool}` : 'Send a prompt or select a tool from the toolbar'}
            </p>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 right-4 z-10 text-[10px] font-mono px-2 py-1 rounded"
        style={{ color: 'var(--text-muted)', backgroundColor: 'var(--toolbar-bg)', border: '1px solid var(--border-subtle)' }}>
        {Math.round(viewport.zoom * 100)}%
      </div>

      {/* lib/brains overlay — renders autonomous Brains, their cursors, bubbles, and placed shapes. */}
      <BrainsCanvasLayer viewport={viewport} activeTool={activeBrainTool ?? null} onToolConsumed={onBrainToolConsumed} />

      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ cursor: panning ? 'grabbing' : (activeTool === 'hand' || isSpacePressed) ? 'grab' : activeTool === 'select' ? 'default' : activeTool ? 'crosshair' : 'default' }}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <pattern id="grid-sm" width="20" height="20" patternUnits="userSpaceOnUse"
            patternTransform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
            <circle cx="10" cy="10" r="0.8" fill="var(--canvas-dot)" />
          </pattern>
          <pattern id="grid-lg" width="100" height="100" patternUnits="userSpaceOnUse"
            patternTransform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
            <circle cx="50" cy="50" r="1.2" fill="var(--canvas-dot-lg)" />
          </pattern>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--canvas-edge)" />
          </marker>
          <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.08" />
          </filter>
          <filter id="node-shadow-hover" x="-10%" y="-10%" width="120%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.15" />
          </filter>
        </defs>

        <rect width="100%" height="100%" fill="var(--canvas-bg)" />
        <rect width="100%" height="100%" fill="url(#grid-sm)" />
        <rect width="100%" height="100%" fill="url(#grid-lg)" />

        <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
          {/* Selection Box */}
          {selectionBox && (
            <rect 
              x={Math.min(selectionBox.startX, selectionBox.currX)}
              y={Math.min(selectionBox.startY, selectionBox.currY)}
              width={Math.abs(selectionBox.currX - selectionBox.startX)}
              height={Math.abs(selectionBox.currY - selectionBox.startY)}
              fill="rgba(59, 130, 246, 0.1)"
              stroke="rgba(59, 130, 246, 0.5)"
              strokeWidth="1"
            />
          )}

          {/* Groups */}
          {groups.map(group => (
            <g key={group.id} className="canvas-group">
              <rect 
                x={group.x} y={group.y} 
                width={group.width} height={group.height} 
                rx="16" ry="16"
                fill="rgba(255, 255, 255, 0.02)" 
                stroke="var(--border-subtle)" 
                strokeWidth="2" 
                strokeDasharray="8 8"
              />
              <text 
                x={group.x + 20} y={group.y + 30} 
                fill="var(--text-muted)" 
                fontSize="14" 
                fontFamily="sans-serif" 
                fontWeight="bold"
                letterSpacing="1px"
                style={{ textTransform: 'uppercase' }}
              >
                {group.label}
              </text>
            </g>
          ))}

          {/* Paths (Pen tool) */}
          {paths.map(path => {
            const d = path.points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
            return (
              <path key={path.id} d={d} fill="none" stroke={path.color} strokeWidth={path.width} strokeLinecap="round" strokeLinejoin="round" />
            );
          })}

          {/* Edges */}
          {edges.map(edge => {
            const pts = getEdgePoints(edge);
            if (!pts) return null;
            const style = EDGE_COLORS[edge.type] || EDGE_COLORS.dependency;
            const isSelected = selectedEdgeIds.includes(edge.id);
            
            let pathD = '';
            let midX, midY;
            
            if (edge.midPoint) {
              midX = edge.midPoint.x;
              midY = edge.midPoint.y;
              pathD = `M ${pts.x1} ${pts.y1} Q ${midX} ${midY} ${pts.x2} ${pts.y2}`;
            } else {
              const dist = Math.max(Math.hypot(pts.x2 - pts.x1, pts.y2 - pts.y1) / 2.5, 40);
              
              const c1x = pts.side1 === 'right' ? pts.x1 + dist : pts.side1 === 'left' ? pts.x1 - dist : pts.x1;
              const c1y = pts.side1 === 'bottom' ? pts.y1 + dist : pts.side1 === 'top' ? pts.y1 - dist : pts.y1;
              
              const c2x = pts.side2 === 'right' ? pts.x2 + dist : pts.side2 === 'left' ? pts.x2 - dist : pts.x2;
              const c2y = pts.side2 === 'bottom' ? pts.y2 + dist : pts.side2 === 'top' ? pts.y2 - dist : pts.y2;
              
              pathD = `M ${pts.x1} ${pts.y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts.x2} ${pts.y2}`;
              
              midX = (pts.x1 + pts.x2) / 2;
              midY = (pts.y1 + pts.y2) / 2;
            }

            return (
              <g key={edge.id} className="canvas-edge" style={{ cursor: 'pointer' }}
                 onMouseDown={(e) => handleEdgeMouseDown(e, edge.id, midX, midY)}>
                <path d={pathD} fill="none" stroke="transparent" strokeWidth="15" />
                <path d={pathD} fill="none" stroke={isSelected ? 'var(--canvas-selection)' : style.color} 
                  strokeWidth={isSelected ? "5" : "3"} strokeDasharray={style.dash || (animatingEdgeIds.has(edge.id) ? '1000' : '')}
                  strokeDashoffset={animatingEdgeIds.has(edge.id) ? '1000' : '0'}
                  markerEnd="url(#arrowhead)" opacity="0.9"
                  style={animatingEdgeIds.has(edge.id) ? { animation: 'edgeDrawIn 0.8s ease-out forwards' } : {}} />
                
                {isSelected && (
                  <circle cx={midX} cy={midY} r="6" fill="#ffffff" stroke="var(--canvas-selection)" strokeWidth="2"
                    style={{ cursor: 'move' }} />
                )}
                
                {edge.label && (
                  <text x={midX} y={midY - 12}
                    fill="var(--canvas-node-meta)" fontSize="10" textAnchor="middle">{edge.label}</text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const isSelected = selectedNodeIds.includes(node.id);
            const isEditing = editingNodeId === node.id;
            const isHovered = node.id === hoveredNodeId;
            let shape = node.metadata?.shape || 'rect';
            
            // Auto-map LLM generated types to rich shapes
            if (!node.metadata?.shape) {
              if (node.type === 'database') shape = 'cylinder';
              else if (node.type === 'ui') shape = 'browser';
              else if (node.type === 'api') shape = 'hexagon';
              else if (node.type === 'external') shape = 'triangle';
            }

            const isAnimating = animatingNodeIds.has(node.id);

            return (
              <g key={node.id} className={`canvas-node${isAnimating ? ' node-fade-in' : ''}`}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, node.id)}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                style={{ cursor: 'move' }}>

                {/* Node Background based on Shape */}
                {shape === 'ellipse' ? (
                  <ellipse cx={node.x + node.width / 2} cy={node.y + node.height / 2} rx={node.width / 2} ry={node.height / 2}
                    fill="var(--canvas-node-bg)"
                    stroke={isSelected ? 'var(--canvas-selection)' : 'var(--canvas-node-border)'}
                    strokeWidth={isSelected ? 3 : 2}
                    filter={isHovered ? 'url(#node-shadow-hover)' : 'url(#node-shadow)'} />
                ) : shape === 'triangle' ? (
                  <polygon points={`${node.x + node.width / 2},${node.y} ${node.x + node.width},${node.y + node.height} ${node.x},${node.y + node.height}`}
                    fill="var(--canvas-node-bg)"
                    stroke={isSelected ? 'var(--canvas-selection)' : 'var(--canvas-node-border)'}
                    strokeWidth={isSelected ? 3 : 2}
                    filter={isHovered ? 'url(#node-shadow-hover)' : 'url(#node-shadow)'} />
                ) : shape === 'arrow' ? (
                  <polygon points={`
                    ${node.x},${node.y + node.height / 3}
                    ${node.x + node.width * 0.7},${node.y + node.height / 3}
                    ${node.x + node.width * 0.7},${node.y}
                    ${node.x + node.width},${node.y + node.height / 2}
                    ${node.x + node.width * 0.7},${node.y + node.height}
                    ${node.x + node.width * 0.7},${node.y + node.height * 0.66}
                    ${node.x},${node.y + node.height * 0.66}
                  `}
                    fill="var(--canvas-node-bg)"
                    stroke={isSelected ? 'var(--canvas-selection)' : 'var(--canvas-node-border)'}
                    strokeWidth={isSelected ? 3 : 2}
                    filter={isHovered ? 'url(#node-shadow-hover)' : 'url(#node-shadow)'} />
                ) : shape === 'cylinder' ? (
                  <g>
                    <path d={`M ${node.x} ${node.y + 15} A ${node.width/2} 15 0 0 0 ${node.x + node.width} ${node.y + 15} L ${node.x + node.width} ${node.y + node.height - 15} A ${node.width/2} 15 0 0 1 ${node.x} ${node.y + node.height - 15} Z`}
                      fill="var(--canvas-node-bg)" stroke={isSelected ? 'var(--canvas-selection)' : 'var(--canvas-node-border)'} strokeWidth={isSelected ? 3 : 2} filter={isHovered ? 'url(#node-shadow-hover)' : 'url(#node-shadow)'} />
                    <ellipse cx={node.x + node.width/2} cy={node.y + 15} rx={node.width/2} ry={15} 
                      fill="rgba(255,255,255,0.05)" stroke={isSelected ? 'var(--canvas-selection)' : 'var(--canvas-node-border)'} strokeWidth={isSelected ? 3 : 2} />
                  </g>
                ) : shape === 'browser' ? (
                  <g filter={isHovered ? 'url(#node-shadow-hover)' : 'url(#node-shadow)'}>
                    <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="8" ry="8" fill="var(--canvas-node-bg)" stroke={isSelected ? 'var(--canvas-selection)' : 'var(--canvas-node-border)'} strokeWidth={isSelected ? 3 : 2} />
                    <path d={`M ${node.x} ${node.y + 24} L ${node.x + node.width} ${node.y + 24}`} stroke={isSelected ? 'var(--canvas-selection)' : 'var(--canvas-node-border)'} strokeWidth="1" />
                    <circle cx={node.x + 12} cy={node.y + 12} r="3" fill="#ef4444" />
                    <circle cx={node.x + 22} cy={node.y + 12} r="3" fill="#eab308" />
                    <circle cx={node.x + 32} cy={node.y + 12} r="3" fill="#22c55e" />
                  </g>
                ) : shape === 'hexagon' ? (
                  <polygon points={`
                    ${node.x + node.width * 0.1},${node.y} 
                    ${node.x + node.width * 0.9},${node.y} 
                    ${node.x + node.width},${node.y + node.height / 2} 
                    ${node.x + node.width * 0.9},${node.y + node.height} 
                    ${node.x + node.width * 0.1},${node.y + node.height} 
                    ${node.x},${node.y + node.height / 2}
                  `} fill="var(--canvas-node-bg)" stroke={isSelected ? 'var(--canvas-selection)' : 'var(--canvas-node-border)'} strokeWidth={isSelected ? 3 : 2} filter={isHovered ? 'url(#node-shadow-hover)' : 'url(#node-shadow)'} />
                ) : shape === 'text' ? (
                  /* No background for text tool */ null
                ) : (
                  <rect x={node.x} y={node.y} width={node.width} height={node.height}
                    rx="12" ry="12"
                    fill={shape === 'sticky' ? '#FEF3C7' : 'var(--canvas-node-bg)'}
                    stroke={isSelected ? 'var(--canvas-selection)' : (shape === 'sticky' ? '#F59E0B' : 'var(--canvas-node-border)')}
                    strokeWidth={isSelected ? 3 : 2}
                    filter={isHovered ? 'url(#node-shadow-hover)' : 'url(#node-shadow)'} />
                )}

                {/* Label / Input */}
                <foreignObject x={node.x + 12} y={shape === 'browser' ? node.y + 24 : shape === 'cylinder' ? node.y + 24 : node.y + 12} width={node.width - 24} height={shape === 'browser' ? node.height - 36 : shape === 'cylinder' ? node.height - 36 : node.height - 24}>
                  <div className="flex items-center justify-center w-full h-full">
                    {isEditing ? (
                      <textarea
                        autoFocus
                        value={node.label}
                        placeholder={shape === 'text' ? 'Type something...' : 'Add text'}
                        onBlur={() => setEditingNodeId(null)}
                        onChange={e => {
                          const val = e.target.value;
                          const target = e.target;
                          target.style.height = '0px'; 
                          const scrollH = target.scrollHeight;
                          target.style.height = '100%'; 
                          
                          if (yNodesRef.current) {
                            const n = yNodesRef.current.get(node.id);
                            if (n) {
                              const newHeight = Math.max(72, scrollH + 24);
                              yNodesRef.current.set(node.id, { ...n, label: val, height: newHeight });
                            }
                          }
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          color: 'var(--canvas-node-text)',
                          fontSize: '13px',
                          fontWeight: '500',
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                          textAlign: 'center',
                          resize: 'none',
                          overflow: 'hidden'
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '100%',
                        color: node.label ? 'var(--canvas-node-text)' : 'var(--text-muted)',
                        fontSize: '13px',
                        fontWeight: '500',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        textAlign: 'center',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        pointerEvents: 'none',
                        userSelect: 'none'
                      }}>
                        {node.label || (shape === 'text' ? 'Double click to type' : 'Add text')}
                      </div>
                    )}
                  </div>
                </foreignObject>

                {/* ── Selection handles (4 corner squares) ─────────────── */}
                {isSelected && selectedNodeIds.length === 1 && getHandles(node.x, node.y, node.width, node.height).map((h, i) => (
                  <rect key={i} x={h.cx - 5} y={h.cy - 5} width="10" height="10"
                    rx="1.5" fill="#ffffff" stroke="var(--canvas-selection)" strokeWidth="2"
                    style={{ cursor: h.cursor }} />
                ))}

                {/* ── Connector anchor dots (appear on hover) ────────── */}
                {shape !== 'text' && shape !== 'pen' && (isHovered || isSelected) && selectedNodeIds.length <= 1 && getConnectorAnchors(node.x, node.y, node.width, node.height).map((a, i) => (
                  <g key={`anchor-${i}`} className="group">
                    <circle cx={a.cx} cy={a.cy} r="5" fill="var(--canvas-selection)" opacity="0.9" />
                    <circle cx={a.cx} cy={a.cy} r="2.5" fill="#ffffff" />
                    
                    <circle cx={a.cx} cy={a.cy} r="15" fill="transparent" style={{ cursor: 'pointer' }} />
                    
                    <g className="opacity-0 group-hover:opacity-100 transition-opacity" 
                       onClick={(e) => handleAutoConnect(e, node.id, a.side)} 
                       style={{ cursor: 'pointer' }}>
                      <circle cx={a.side === 'right' ? a.cx + 20 : a.side === 'left' ? a.cx - 20 : a.cx} 
                              cy={a.side === 'bottom' ? a.cy + 20 : a.side === 'top' ? a.cy - 20 : a.cy} 
                              r="12" fill="var(--canvas-node-bg)" stroke="var(--canvas-node-border)" />
                      <text x={a.side === 'right' ? a.cx + 20 : a.side === 'left' ? a.cx - 20 : a.cx} 
                            y={a.side === 'bottom' ? a.cy + 24 : a.side === 'top' ? a.cy - 16 : a.cy + 4} 
                            fontSize="12" textAnchor="middle" fill="var(--canvas-edge)">
                        {a.side === 'right' ? '→' : a.side === 'left' ? '←' : a.side === 'bottom' ? '↓' : '↑'}
                      </text>
                    </g>
                  </g>
                ))}
              </g>
            );
          })}

          {/* Diagrams (Editorial HTML+SVG) */}
          {diagrams.map(diagram => (
            <foreignObject
              key={diagram.id}
              x={diagram.x}
              y={diagram.y}
              width={diagram.width}
              height={diagram.height}
              className="canvas-node node-fade-in"
              style={{ cursor: 'move', overflow: 'visible' }}
              onMouseDown={(e) => {
                e.stopPropagation();
                const pos = getMousePos(e);
                setDraggingNodes({ offsets: [{ id: diagram.id, offsetX: pos.x - diagram.x, offsetY: pos.y - diagram.y }] });
              }}
            >
              <div style={{ width: diagram.width, height: diagram.height, borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--canvas-node-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <iframe
                  srcDoc={diagram.htmlContent}
                  style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                  sandbox="allow-same-origin"
                  title={`Diagram ${diagram.id}`}
                />
              </div>
            </foreignObject>
          ))}


          {/* Multiplayer Cursors (Awareness) */}
          {awarenessUsers.map((user, i) => {
            if (!user.cursor || !user.user) return null;
            return (
              <g key={`cursor-${i}`} transform={`translate(${user.cursor.x}, ${user.cursor.y})`} style={{ pointerEvents: 'none', transition: 'transform 0.05s linear' }}>
                <path d="M0,0 L14,14 L7,16 L0,24 Z" fill={user.user.color} stroke="#ffffff" strokeWidth="1" />
                <rect x="12" y="14" width={user.user.name.length * 8 + 12} height="20" rx="4" fill={user.user.color} />
                <text x="18" y="28" fill="#ffffff" fontSize="10" fontFamily="sans-serif" fontWeight="bold">{user.user.name}</text>
              </g>
            );
          })}

          {/* Persistent Brain Cursors & Choreography */}
          {(enabledAgents || []).map((agent, i) => {
            const seed = agent.name.charCodeAt(0);
            const isStreaming = messages?.some(m => m.role === 'assistant' && m.isStreaming && m.agentName === agent.name);
            const streamingMsg = messages?.findLast(m => m.role === 'assistant' && m.isStreaming && m.agentName === agent.name);
            
            // Phase 5: The Lead Brain (index 0) handles the instruction interception
            const isLeadBrain = i === 0;
            const isIntercepting = isLeadBrain && leadBrainStatus?.isReading;
            
            // Phase 3: Plotter Brain intervention
            const isPlotterIntervening = agent.id === 'plotter-agent' && plotterStatus?.isWorking;
            
            // Check if this specific agent has an active target queue
            const activeTarget = brainTargetsRef.current[agent.id];
            const patrolTarget = patrolTargetsRef.current[agent.id];
            
            let targetX, targetY, currentMsg = '';

            if (isIntercepting && isLeadBrain) {
              // Intercepting: Fly to the bottom console area and read the task
              targetX = window.innerWidth / 2;
              targetY = window.innerHeight - 100;
              currentMsg = leadBrainStatus.message;
            } else if (isPlotterIntervening) {
              // Plotter working
              targetX = activeTarget ? activeTarget.x : 500;
              targetY = activeTarget ? activeTarget.y : 300;
              currentMsg = plotterStatus.message;
            } else if (activeTarget) {
              // Working: fly near the target node being placed or toolbar
              targetX = activeTarget.x + Math.sin(Date.now() / 1500 + seed) * 40 + 50;
              targetY = activeTarget.y + Math.cos(Date.now() / 1800 + seed) * 40 + 10;
              currentMsg = streamingMsg?.content || `Building block...`;
            } else if (isStreaming) {
              // Streaming but no target yet: hover nearby
              targetX = 400 + Math.sin(Date.now() / 1500 + seed) * 40 + 100;
              targetY = 300 + Math.cos(Date.now() / 1800 + seed) * 40 + 36;
              currentMsg = streamingMsg?.content || '';
            } else if (patrolTarget) {
              // Idle: Patrol the canvas autonomously (slow, sweeping movements)
              targetX = patrolTarget.x + Math.sin(Date.now() / 3000 + seed) * 100;
              targetY = patrolTarget.y + Math.cos(Date.now() / 4000 + seed) * 100;
              currentMsg = ''; // silent when idle
            } else {
              targetX = 400;
              targetY = 300;
              currentMsg = '';
            }

            const color = agent.name.includes('Architect') ? '#3b82f6' : 
                          agent.name.includes('Frontend') ? '#ec4899' : 
                          agent.name.includes('Database') ? '#10b981' : '#8b5cf6';
            
            const truncated = currentMsg.length > 60 ? '...' + currentMsg.slice(-57) : currentMsg;
            
            return (
              <g key={`brain-${agent.id}`} transform={`translate(${targetX}, ${targetY})`} style={{ pointerEvents: 'none', transition: 'transform 0.15s ease-out' }}>
                <path d="M0,0 L14,14 L7,16 L0,24 Z" fill={color} stroke="#ffffff" strokeWidth="1" />
                
                {/* Always show name when idle, or chat bubble when talking */}
                {truncated ? (
                  <g transform="translate(16, 0)">
                    <rect x="0" y="-30" width={Math.max(120, truncated.length * 6 + 20)} height="26" rx="8" fill={color} opacity="0.9" />
                    <path d="M0,0 L10,-10 L0,-10 Z" fill={color} opacity="0.9" />
                    <text x="10" y="-13" fill="#ffffff" fontSize="11" fontFamily="sans-serif" fontWeight="500">
                      <tspan fontWeight="bold">{agent.name}: </tspan>
                      {truncated}
                    </text>
                  </g>
                ) : (
                  <g>
                    <rect x="12" y="14" width={agent.name.length * 8 + 12} height="20" rx="4" fill={color} opacity="0.6" />
                    <text x="18" y="28" fill="#ffffff" fontSize="10" fontFamily="sans-serif" fontWeight="bold" opacity="0.8">{agent.name}</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── Floating Action Bar (Nodes) ────────────────────────────────── */}
      {selectedNodeIds.length > 0 && !panning && !draggingNodes && !selectionBox && (() => {
        // Find bounding box of all selected nodes to position toolbar
        const selectedNodesList = nodes.filter(n => selectedNodeIds.includes(n.id));
        if (selectedNodesList.length === 0) return null;
        const minX = Math.min(...selectedNodesList.map(n => n.x));
        const minY = Math.min(...selectedNodesList.map(n => n.y));
        const maxWidth = Math.max(...selectedNodesList.map(n => n.width));

        return (
          <div 
            className="absolute z-30 flex items-center bg-[var(--toolbar-bg)] border border-[var(--toolbar-border)] rounded-full px-3 py-1.5 shadow-[var(--toolbar-shadow)]"
            style={{
              top: `${minY * viewport.zoom + viewport.y - 50}px`,
              left: `${(minX + maxWidth / 2) * viewport.zoom + viewport.x}px`,
              transform: 'translateX(-50%)',
              pointerEvents: 'auto'
            }}
          >
            <div className="flex gap-2 items-center text-xs text-[var(--text-primary)]">
              <button className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center" title="Color">🎨</button>
              
              {selectedNodeIds.length === 1 && (
                <>
                  <div className="w-[1px] h-4 bg-[var(--border-strong)]" />
                  <button className="px-2 h-6 rounded-md hover:bg-white/10 font-medium" onClick={() => setEditingNodeId(selectedNodeIds[0])}>Text</button>
                  <button className="w-6 h-6 rounded-md hover:bg-white/10 font-bold" title="Bold">B</button>
                  <div className="w-[1px] h-4 bg-[var(--border-strong)]" />
                  <button className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center" title="Link">🔗</button>
                </>
              )}

              <div className="w-[1px] h-4 bg-[var(--border-strong)]" />
              <button className="w-6 h-6 rounded-md hover:bg-red-500/20 text-red-400 flex items-center justify-center" title="Delete" 
                onClick={(e) => { e.stopPropagation(); deleteSelected(); }}>🗑️</button>
            </div>
          </div>
        );
      })()}

      {/* ── Floating Action Bar (Edges) ────────────────────────────────── */}
      {selectedEdgeIds.length === 1 && selectedNodeIds.length === 0 && !panning && !draggingEdge && !selectionBox && (() => {
        const edge = edges.find(e => e.id === selectedEdgeIds[0]);
        if (!edge) return null;
        const pts = getEdgePoints(edge);
        if (!pts) return null;
        const midX = edge.midPoint ? edge.midPoint.x : (pts.x1 + pts.x2) / 2;
        const midY = edge.midPoint ? edge.midPoint.y : (pts.y1 + pts.y2) / 2;
        
        return (
          <div 
            className="absolute z-30 flex items-center bg-[var(--toolbar-bg)] border border-[var(--toolbar-border)] rounded-full px-3 py-1.5 shadow-[var(--toolbar-shadow)]"
            style={{
              top: `${midY * viewport.zoom + viewport.y - 50}px`,
              left: `${midX * viewport.zoom + viewport.x}px`,
              transform: 'translateX(-50%)',
              pointerEvents: 'auto'
            }}
          >
            <div className="flex gap-2 items-center text-xs text-[var(--text-primary)]">
              <button className="w-6 h-6 rounded-full bg-gray-500 hover:opacity-80" title="Color" />
              <button className="px-1 h-6 rounded-md hover:bg-white/10" title="Line Style">≡</button>
              <div className="w-[1px] h-4 bg-[var(--border-strong)]" />
              <button className="w-6 h-6 rounded-md hover:bg-white/10 font-serif" title="Add Text">T</button>
              <div className="w-[1px] h-4 bg-[var(--border-strong)]" />
              <button className="px-1 h-6 rounded-md hover:bg-white/10" title="Start Point">|</button>
              <button className="px-1 h-6 rounded-md hover:bg-white/10" title="Line Shape">∫</button>
              <button className="px-1 h-6 rounded-md hover:bg-white/10" title="End Point">↓</button>
              <div className="w-[1px] h-4 bg-[var(--border-strong)]" />
              <button className="w-6 h-6 rounded-md hover:bg-red-500/20 text-red-400 flex items-center justify-center" title="Delete" 
                onClick={(e) => { e.stopPropagation(); deleteSelected(); }}>🗑️</button>
            </div>
          </div>
        );
      })()}

      {/* ── Properties Inspector (Right Sidebar) ────────────────────────── */}
      {(selectedNodeIds.length === 1 || selectedEdgeIds.length === 1) && (
        <div className="absolute right-4 top-4 z-40 w-72 bg-[var(--sidebar-bg)] border border-[var(--border-strong)] rounded-lg shadow-2xl flex flex-col overflow-hidden pointer-events-auto">
          <div className="px-4 py-3 border-b border-[var(--border-strong)] flex justify-between items-center bg-[var(--sidebar-header)]">
            <h3 className="font-semibold text-sm">Properties</h3>
          </div>
          <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
            {selectedNodeIds.length === 1 && (() => {
              const node = nodes.find(n => n.id === selectedNodeIds[0]);
              if (!node) return null;
              return (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Label</label>
                    <textarea 
                      className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-y min-h-[60px]"
                      value={node.label}
                      onChange={(e) => {
                        const newLabel = e.target.value;
                        setNodes(prev => prev.map(n => n.id === node.id ? { ...n, label: newLabel } : n));
                        if (yNodesRef.current) {
                          ydocRef.current?.transact(() => {
                            const yNode = yNodesRef.current!.get(node.id);
                            if (yNode) yNodesRef.current!.set(node.id, { ...yNode, label: newLabel });
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Description</label>
                    <textarea 
                      className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-y min-h-[80px]"
                      value={node.description || ''}
                      placeholder="Add a description..."
                      onChange={(e) => {
                        const newDesc = e.target.value;
                        setNodes(prev => prev.map(n => n.id === node.id ? { ...n, description: newDesc } : n));
                        if (yNodesRef.current) {
                          ydocRef.current?.transact(() => {
                            const yNode = yNodesRef.current!.get(node.id);
                            if (yNode) yNodesRef.current!.set(node.id, { ...yNode, description: newDesc });
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2 pt-2 border-t border-[var(--border-strong)]">
                    <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Color Theme</label>
                    <div className="flex flex-wrap gap-2">
                      {['default', 'blue', 'green', 'yellow', 'red', 'purple', 'gray'].map(color => (
                        <button 
                          key={color}
                          className={`w-6 h-6 rounded-full border border-white/20 hover:scale-110 transition-transform ${node.metadata?.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}
                          style={{
                            backgroundColor: color === 'default' ? '#1f2937' : `var(--color-${color}-500, ${color})`
                          }}
                          onClick={() => {
                            const newMeta = { ...node.metadata, color };
                            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, metadata: newMeta } : n));
                            if (yNodesRef.current) {
                              ydocRef.current?.transact(() => {
                                const yNode = yNodesRef.current!.get(node.id);
                                if (yNode) yNodesRef.current!.set(node.id, { ...yNode, metadata: newMeta });
                              });
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}

            {selectedEdgeIds.length === 1 && (() => {
              const edge = edges.find(e => e.id === selectedEdgeIds[0]);
              if (!edge) return null;
              return (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Edge Label</label>
                    <input 
                      type="text"
                      className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      value={edge.label || ''}
                      placeholder="e.g., uses, belongs to"
                      onChange={(e) => {
                        const newLabel = e.target.value;
                        setEdges(prev => prev.map(ed => ed.id === edge.id ? { ...ed, label: newLabel } : ed));
                        if (yEdgesRef.current) {
                          ydocRef.current?.transact(() => {
                            const yEdge = yEdgesRef.current!.get(edge.id);
                            if (yEdge) yEdgesRef.current!.set(edge.id, { ...yEdge, label: newLabel });
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Edge Type</label>
                    <select 
                      className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      value={edge.type}
                      onChange={(e) => {
                        const newType = e.target.value as EdgeAction['type'];
                        setEdges(prev => prev.map(ed => ed.id === edge.id ? { ...ed, type: newType } : ed));
                        if (yEdgesRef.current) {
                          ydocRef.current?.transact(() => {
                            const yEdge = yEdgesRef.current!.get(edge.id);
                            if (yEdge) yEdgesRef.current!.set(edge.id, { ...yEdge, type: newType });
                          });
                        }
                      }}
                    >
                      <option value="data_flow">Data Flow (Solid)</option>
                      <option value="dependency">Dependency (Solid Dark)</option>
                      <option value="api_call">API Call (Solid Purple)</option>
                      <option value="event">Event (Dashed)</option>
                    </select>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Zoom & Export Controls (Bottom Left) ─────────────────────── */}
      <div className="absolute left-20 bottom-6 z-40 flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center bg-[var(--toolbar-bg)] border border-[var(--toolbar-border)] rounded-lg shadow-lg overflow-hidden">
          <button 
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 text-[var(--text-primary)] transition-colors"
            onClick={() => setViewport(v => ({ ...v, zoom: Math.max(0.1, v.zoom - 0.1) }))}
            title="Zoom Out"
          >−</button>
          <div className="w-12 text-center text-xs font-medium text-[var(--text-primary)] border-x border-[var(--toolbar-border)]">
            {Math.round(viewport.zoom * 100)}%
          </div>
          <button 
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 text-[var(--text-primary)] transition-colors"
            onClick={() => setViewport(v => ({ ...v, zoom: Math.min(5, v.zoom + 0.1) }))}
            title="Zoom In"
          >+</button>
        </div>
        
        <div className="flex items-center bg-[var(--toolbar-bg)] border border-[var(--toolbar-border)] rounded-lg shadow-lg overflow-hidden">
          <button 
            className="px-3 h-8 flex items-center justify-center gap-1 hover:bg-white/10 text-[var(--text-primary)] transition-colors text-xs font-medium"
            onClick={() => {
              // Simple SVG Export
              if (!svgRef.current) return;
              const svgData = new XMLSerializer().serializeToString(svgRef.current);
              const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${projectName || 'canvas'}-export.svg`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            title="Export as SVG"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            SVG
          </button>
        </div>
      </div>

      {/* ── Minimap (Bottom Right) ────────────────────────────────────── */}
      {nodes.length > 0 && (() => {
        // Calculate bounds of all nodes
        const minX = Math.min(...nodes.map(n => n.x)) - 100;
        const minY = Math.min(...nodes.map(n => n.y)) - 100;
        const maxX = Math.max(...nodes.map(n => n.x + n.width)) + 100;
        const maxY = Math.max(...nodes.map(n => n.y + n.height)) + 100;
        const width = Math.max(maxX - minX, 1000);
        const height = Math.max(maxY - minY, 1000);
        
        // Viewport rect in minimap coords
        const vpW = (typeof window !== 'undefined' ? window.innerWidth : 1000) / viewport.zoom;
        const vpH = (typeof window !== 'undefined' ? window.innerHeight : 1000) / viewport.zoom;
        const vpX = -viewport.x / viewport.zoom;
        const vpY = -viewport.y / viewport.zoom;

        return (
          <div className="absolute right-6 bottom-6 z-40 w-48 h-32 bg-[var(--sidebar-bg)] border border-[var(--border-strong)] rounded-lg shadow-xl overflow-hidden pointer-events-auto">
            <svg 
              width="100%" height="100%" 
              viewBox={`${minX} ${minY} ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              className="bg-black/20"
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Map click back to canvas coordinates
                const canvasX = minX + (x / rect.width) * width;
                const canvasY = minY + (y / rect.height) * height;
                
                // Center viewport on click
                const winW = window.innerWidth;
                const winH = window.innerHeight;
                setViewport(v => ({
                  ...v,
                  x: -(canvasX * v.zoom - winW / 2),
                  y: -(canvasY * v.zoom - winH / 2)
                }));
              }}
              style={{ cursor: 'pointer' }}
            >
              {nodes.map(n => (
                <rect 
                  key={`mm-${n.id}`}
                  x={n.x} y={n.y} width={n.width} height={n.height} 
                  fill={n.metadata?.color && n.metadata.color !== 'default' ? `var(--color-${n.metadata.color}-500, #374151)` : '#374151'}
                  rx={8}
                />
              ))}
              <rect 
                x={vpX} y={vpY} width={vpW} height={vpH}
                fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.5)" strokeWidth={width * 0.005}
                style={{ pointerEvents: 'none' }}
              />
            </svg>
          </div>
        );
      })()}

      {/* ── Canvas Animations ────────────────────────────────────── */}
      <style>{`
        @keyframes nodeFadeIn {
          0% { opacity: 0; transform: scale(0.8) translateY(10px); }
          60% { opacity: 1; transform: scale(1.05) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes edgeDrawIn {
          0% { stroke-dashoffset: 1000; opacity: 0.3; }
          100% { stroke-dashoffset: 0; opacity: 0.9; }
        }
        .node-fade-in {
          animation: nodeFadeIn 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
