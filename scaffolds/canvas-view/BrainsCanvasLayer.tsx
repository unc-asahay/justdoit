'use client';

// Renders the lib/brains Y.Doc onto the /canvas page: brain cursors, chat
// bubbles, placed rects, and custom shapes. Mounted on top of the legacy
// InteractiveCanvas SVG as a pointer-events:none overlay, sharing the same
// viewport transform so world coordinates map consistently.
//
// When checkpoint 6 retires the legacy orchestrator path, this layer becomes
// the primary renderer and InteractiveCanvas steps back into a host shell.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useBrains, useBrainNodes, useCanvasNodes } from '@/lib/brains/provider';
import { applyOps, createCustomShape, createArrow } from '@/lib/brains/canvas-ops';
import { renderNodeShape, isNodeKind, defaultSizeFor, type NodeKind } from '@/lib/brains/tools/shapes';
import { makeEvent } from '@/lib/brains/events';
import type { ToolBehavior } from '@/lib/canvas/tool-catalog';
import type { BrainNode, BubbleNode, RectNode, CustomShapeNode, ArrowNode, CanvasNode } from '@/lib/brains/types';

interface BrainsCanvasLayerProps {
  viewport: { x: number; y: number; zoom: number };
  // Selected tool from the toolbar — when set, clicking on the canvas
  // places that primitive at the click point. null means default
  // select/edit mode (drag, edit, delete).
  activeTool?: ToolBehavior | null;
  onToolConsumed?: () => void;
}

interface PeerMessageGhost { id: string; fromId: string; toId: string; content: string; ts: number }
interface HoverInspect { nodeId: string; screenX: number; screenY: number }

export function BrainsCanvasLayer({ viewport, activeTool, onToolConsumed }: BrainsCanvasLayerProps) {
  const { ydoc, eventBus } = useBrains();
  const brains = useBrainNodes();
  const nodes = useCanvasNodes();
  const [now, setNow] = useState(Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  // Transient peer-message arrows — render from sender's cursor to target's
  // cursor for ~5s after a message_brain call, so handoffs are visible.
  const [peerGhosts, setPeerGhosts] = useState<PeerMessageGhost[]>([]);
  const [hover, setHover] = useState<HoverInspect | null>(null);
  // Connector draw state — first click captures source node id; second click
  // (on another node) creates the arrow.
  const [connectorSourceId, setConnectorSourceId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Drag state lives in a ref so mousemove can read latest values without
  // forcing a re-render on every mouse pixel — we only re-render when Y.Doc
  // updates (which happens via the move op we issue mid-drag).
  const dragRef = useRef<{
    nodeId: string;
    nodeType: 'rect' | 'customShape';
    startWorldX: number;
    startWorldY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // FigJam-style connector drag — when the user mouse-downs on a hover-handle
  // dot, we capture the source node and follow the cursor with a preview line
  // until mouseup. If they release over another shape, we createArrow.
  const connectDragRef = useRef<{
    sourceId: string;
    sourceSide: 'top' | 'right' | 'bottom' | 'left';
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
  } | null>(null);
  // Bumped on every mousemove during a connector drag so the preview path
  // re-renders. (ref alone wouldn't trigger React; full state would re-render
  // every shape on every pixel.)
  const [connectDragTick, setConnectDragTick] = useState(0);

  // Marquee selection — drag from empty canvas with the Select tool to lasso
  // multiple shapes. Stored as a ref+tick like connectDrag so mousemove
  // doesn't thrash React.
  const marqueeRef = useRef<{
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
  } | null>(null);
  const [marqueeTick, setMarqueeTick] = useState(0);
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  // Spacebar-held = pan mode (FigJam/Figma standard). When true, ALL pointer
  // events from this layer drop through to the underlying InteractiveCanvas
  // which already has middle-click + space-pan handlers wired.
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  // Re-render once a second so expired bubbles + peer-message ghosts fade
  // out without needing a separate Y.Doc write.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // Spacebar = pan mode. We only TRACK the state here; the actual pan logic
  // lives in InteractiveCanvas. This component just gets out of the way (drops
  // pointer-events on its background rect + shape interaction layer) so the
  // legacy SVG below us can receive the mousedown.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      e.preventDefault(); // stop space from scrolling the page
      setIsSpaceHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      setIsSpaceHeld(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Subscribe to peer_message events on the EventBus and capture them as
  // visible "ghost" arrows that fade after 5s.
  useEffect(() => {
    const unsub = eventBus.subscribe(
      { types: ['peer_message'] },
      (event) => {
        if (!event.authorId || !event.targetBrainId) return;
        setPeerGhosts((prev) => [
          ...prev.filter((g) => Date.now() - g.ts < 5000),
          {
            id: event.id,
            fromId: event.authorId,
            toId: event.targetBrainId,
            content: String(event.payload?.content ?? ''),
            ts: Date.now(),
          },
        ].slice(-6));
      },
    );
    return () => unsub();
  }, [eventBus]);

  // Convert screen-relative pointer coordinates to world coordinates,
  // accounting for the panel's scroll offset and the viewport pan/zoom.
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return {
      x: (localX - viewport.x) / viewport.zoom,
      y: (localY - viewport.y) / viewport.zoom,
    };
  }, [viewport.x, viewport.y, viewport.zoom]);

  // Drag move handler — runs while the user is dragging a shape OR a
  // connector handle. We commit an update op every move for shape-drag; for
  // connector-drag we only bump a tick so the preview line re-renders.
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Connector handle drag — preview follows cursor.
      const cdrag = connectDragRef.current;
      if (cdrag) {
        const world = screenToWorld(e.clientX, e.clientY);
        if (Math.abs(world.x - cdrag.currentWorldX) + Math.abs(world.y - cdrag.currentWorldY) > 1) {
          cdrag.currentWorldX = world.x;
          cdrag.currentWorldY = world.y;
          setConnectDragTick((t) => (t + 1) | 0);
        }
        return;
      }
      // Marquee drag — extend the box.
      const mq = marqueeRef.current;
      if (mq) {
        const world = screenToWorld(e.clientX, e.clientY);
        if (Math.abs(world.x - mq.currentWorldX) + Math.abs(world.y - mq.currentWorldY) > 1) {
          mq.currentWorldX = world.x;
          mq.currentWorldY = world.y;
          setMarqueeTick((t) => (t + 1) | 0);
        }
        return;
      }
      // Node body drag.
      const drag = dragRef.current;
      if (!drag) return;
      const world = screenToWorld(e.clientX, e.clientY);
      const dx = world.x - drag.startWorldX;
      const dy = world.y - drag.startWorldY;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return; // ignore jitter
      drag.moved = true;
      applyOps(ydoc, [{ op: 'update', nodeId: drag.nodeId, patch: { x: drag.origX + dx, y: drag.origY + dy } as Partial<CanvasNode> }], 'user-drag');
    };
    const onMouseUp = (e: MouseEvent) => {
      // Resolve a connector drag.
      // If released over another shape: create arrow source → that shape.
      // If released over empty canvas: create a NEW shape at the release
      // point AND connect source → new shape (FigJam drag-to-create).
      const cdrag = connectDragRef.current;
      if (cdrag) {
        const world = screenToWorld(e.clientX, e.clientY);
        const map = ydoc.getMap<CanvasNode>('b_nodes');
        let hitId: string | null = null;
        for (const [, n] of map.entries()) {
          if (n.type !== 'rect' && n.type !== 'customShape') continue;
          if (n.id === cdrag.sourceId) continue;
          const r = n as { x: number; y: number; w: number; h: number };
          if (world.x >= r.x && world.x <= r.x + r.w && world.y >= r.y && world.y <= r.y + r.h) {
            hitId = n.id;
            break;
          }
        }

        // Only count as a real drag if the cursor moved beyond a small
        // threshold — otherwise this was a stray click on the dot, ignore.
        const moved = Math.abs(cdrag.currentWorldX - cdrag.startWorldX) + Math.abs(cdrag.currentWorldY - cdrag.startWorldY) > 12;

        if (hitId) {
          applyOps(ydoc, [createArrow({
            fromNodeId: cdrag.sourceId,
            toNodeId: hitId,
            owner: 'user',
            routing: 'curved',
          })], 'user-handle-connect');
        } else if (moved) {
          // Empty-space drop: create a new shape at the release point matching
          // the source's kind (so dragging from a service makes another service)
          // and connect them. Same gesture FigJam uses.
          const source = map.get(cdrag.sourceId) as { type?: string; kind?: string; w?: number; h?: number } | undefined;
          const sourceKind = (source && (source as { kind?: string }).kind) || 'rectangle';
          const validKind: NodeKind = isNodeKind(sourceKind) ? sourceKind : 'rectangle';
          const def = defaultSizeFor(validKind);
          const w = def.w, h = def.h;
          const newX = world.x - w / 2;
          const newY = world.y - h / 2;
          const svg = renderNodeShape(validKind, { w, h, label: '' });
          const placeOp = createCustomShape({
            x: newX, y: newY, w, h,
            svgContent: svg,
            label: undefined,
            labelInside: true,
            kind: validKind,
            owner: 'user',
          });
          // Pull the new node's id out of the create op so we can wire the arrow.
          const newId = placeOp.op === 'create' ? placeOp.node.id : '';
          const arrowOp = createArrow({
            fromNodeId: cdrag.sourceId,
            toNodeId: newId,
            owner: 'user',
            routing: 'curved',
          });
          applyOps(ydoc, [placeOp, arrowOp], 'user-handle-create');
          // Select the new node so the user can immediately edit its label.
          if (newId) setSelectedId(newId);
        }
        connectDragRef.current = null;
        setConnectDragTick((t) => (t + 1) | 0);
        return;
      }
      // Resolve a marquee drag — collect every shape whose bounding box
      // intersects the marquee rect, set as marqueeIds.
      const mq = marqueeRef.current;
      if (mq) {
        const x0 = Math.min(mq.startWorldX, mq.currentWorldX);
        const x1 = Math.max(mq.startWorldX, mq.currentWorldX);
        const y0 = Math.min(mq.startWorldY, mq.currentWorldY);
        const y1 = Math.max(mq.startWorldY, mq.currentWorldY);
        const moved = (x1 - x0) + (y1 - y0) > 8;
        if (moved) {
          const map = ydoc.getMap<CanvasNode>('b_nodes');
          const hits: string[] = [];
          for (const [, n] of map.entries()) {
            if (n.type !== 'rect' && n.type !== 'customShape') continue;
            const r = n as { x: number; y: number; w: number; h: number };
            // Intersection (not containment) — feels more natural; FigJam too.
            if (r.x + r.w >= x0 && r.x <= x1 && r.y + r.h >= y0 && r.y <= y1) {
              hits.push(n.id);
            }
          }
          setMarqueeIds(hits);
          setSelectedId(null);
        }
        marqueeRef.current = null;
        setMarqueeTick((t) => (t + 1) | 0);
        return;
      }
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [ydoc, screenToWorld]);

  // Delete-or-Escape on selected nodes. Escape deselects everything, Delete/
  // Backspace removes — works for single-select (selectedId) AND marquee
  // selection (marqueeIds). When a node is deleted, any arrows referencing it
  // are also removed so we don't leave dangling connections.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      const ids = new Set<string>();
      if (selectedId) ids.add(selectedId);
      for (const id of marqueeIds) ids.add(id);
      if (ids.size === 0) return;

      if (e.key === 'Escape') {
        setSelectedId(null);
        setMarqueeIds([]);
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      e.preventDefault();

      const map = ydoc.getMap<CanvasNode>('b_nodes');
      const ops: Array<{ op: 'delete'; nodeId: string }> = [];
      for (const id of ids) ops.push({ op: 'delete', nodeId: id });
      // Cascade: delete arrows referencing any of the removed nodes.
      for (const [id, n] of map.entries()) {
        if (n.type === 'arrow' && (ids.has(n.fromNodeId) || ids.has(n.toNodeId))) {
          ops.push({ op: 'delete', nodeId: id });
        }
      }
      applyOps(ydoc, ops, 'user-delete');
      setSelectedId(null);
      setMarqueeIds([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, marqueeIds, ydoc]);

  // Shape-click handler used in connector mode: first click sets source,
  // second click creates the arrow. Defined before startDrag so its closure
  // captures the latest deps without temporal-dead-zone issues.
  const handleShapeClickForConnector = useCallback((nodeId: string) => {
    if (activeTool?.mode !== 'connector') return false;
    if (!connectorSourceId) {
      setConnectorSourceId(nodeId);
    } else if (connectorSourceId !== nodeId) {
      applyOps(ydoc, [createArrow({
        fromNodeId: connectorSourceId,
        toNodeId: nodeId,
        routing: activeTool.routing,
        style: activeTool.style,
        endStart: activeTool.endStart,
        endEnd: activeTool.endEnd,
        owner: 'user',
      })], 'user-connect');
      setConnectorSourceId(null);
      onToolConsumed?.();
    }
    return true;
  }, [activeTool, connectorSourceId, ydoc, onToolConsumed]);

  const startDrag = useCallback((node: RectNode | CustomShapeNode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingId === node.id) return; // don't drag while editing
    // Connector mode: this click selects source / target; do NOT start a drag.
    if (activeTool?.mode === 'connector') {
      handleShapeClickForConnector(node.id);
      return;
    }
    const world = screenToWorld(e.clientX, e.clientY);
    setSelectedId(node.id);
    dragRef.current = {
      nodeId: node.id,
      nodeType: node.type,
      startWorldX: world.x,
      startWorldY: world.y,
      origX: node.x,
      origY: node.y,
      moved: false,
    };
  }, [screenToWorld, editingId, activeTool, handleShapeClickForConnector]);

  const startEdit = useCallback((node: RectNode | CustomShapeNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(node.id);
    setEditingValue(node.label ?? '');
    setSelectedId(node.id);
    // Cancel any in-flight drag the dblclick may have started.
    dragRef.current = null;
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const map = ydoc.getMap<CanvasNode>('b_nodes');
    const node = map.get(editingId);
    if (!node) { setEditingId(null); return; }
    const newLabel = editingValue.trim().slice(0, 80);
    if (newLabel === (node as { label?: string }).label) { setEditingId(null); return; }

    const patch: Partial<CanvasNode> = { label: newLabel } as Partial<CanvasNode>;
    // Re-render the SVG for diagram primitives so the new label appears
    // inside the shape (not just as a stale field).
    if (node.type === 'customShape') {
      const cs = node as CustomShapeNode;
      if (cs.labelInside && cs.kind && isNodeKind(cs.kind)) {
        const newSvg = renderNodeShape(cs.kind, { w: cs.w, h: cs.h, label: newLabel });
        (patch as Partial<CustomShapeNode>).svgContent = newSvg;
      }
    }
    applyOps(ydoc, [{ op: 'update', nodeId: editingId, patch }], 'user-edit-label');

    // Notify Brains so they can react. The Brain that owns this node hears
    // it via the EventBus and may comment in a chat bubble + walk over.
    eventBus.publish(makeEvent(
      'user_edit',
      { nodeId: editingId, oldLabel: (node as { label?: string }).label ?? '', newLabel, x: (node as { x: number }).x, y: (node as { y: number }).y },
      { authorId: 'user', zoneHint: { x: (node as { x: number }).x, y: (node as { y: number }).y, w: (node as { w: number }).w ?? 1, h: (node as { h: number }).h ?? 1 } },
    ));
    setEditingId(null);
  }, [editingId, editingValue, ydoc, eventBus]);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const handleHoverEnter = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (activeTool || dragRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    setHover({ nodeId, screenX: e.clientX - r.left, screenY: e.clientY - r.top });
  }, [activeTool]);

  const handleHoverLeave = useCallback(() => setHover(null), []);

  const startConnectDrag = useCallback((sourceId: string, side: 'top'|'right'|'bottom'|'left', wx: number, wy: number) => {
    connectDragRef.current = {
      sourceId,
      sourceSide: side,
      startWorldX: wx,
      startWorldY: wy,
      currentWorldX: wx,
      currentWorldY: wy,
    };
    // Clear hover/selection so handles don't render on top of the source mid-drag.
    setSelectedId(null);
    setConnectDragTick((t) => (t + 1) | 0);
  }, []);

  const askBrainAboutNode = useCallback((targetBrainId: string, nodeId: string) => {
    const map = ydoc.getMap<CanvasNode>('b_nodes');
    const node = map.get(nodeId) as { label?: string; type?: string } | undefined;
    if (!node) return;
    const label = node.label || nodeId;
    const kind = node.type || 'shape';
    eventBus.publish(makeEvent(
      'peer_message',
      { content: `User is asking about "${label}" (${kind}). What would you suggest improving, and what\'s missing or risky here?`, from: 'user' },
      { authorId: 'user', targetBrainId },
    ));
    setHover(null);
  }, [ydoc, eventBus]);

  // Place a primitive of the given kind at world coords. Used by
  // click-to-place from the toolbar.
  const placeKindAt = useCallback((kind: NodeKind, worldX: number, worldY: number) => {
    const def = defaultSizeFor(kind);
    const w = def.w, h = def.h;
    // Centre the shape on the click for a more natural drop feel.
    const x = worldX - w / 2;
    const y = worldY - h / 2;
    const svgContent = renderNodeShape(kind, { w, h, label: '' });
    applyOps(ydoc, [createCustomShape({
      x, y, w, h, svgContent,
      label: undefined,
      labelInside: true,
      kind,
      owner: 'user',
    })], 'user-place');
  }, [ydoc]);

  // Place an instance of a registered (custom) tool at world coords.
  const placeCustomToolAt = useCallback((toolId: string, worldX: number, worldY: number) => {
    const tools = ydoc.getMap('b_tools');
    const tool = tools.get(toolId) as { svgContent: string; defaultW: number; defaultH: number; name: string } | undefined;
    if (!tool) return;
    const w = tool.defaultW || 120;
    const h = tool.defaultH || 80;
    applyOps(ydoc, [createCustomShape({
      x: worldX - w / 2, y: worldY - h / 2,
      w, h,
      svgContent: tool.svgContent,
      label: tool.name,
      toolId,
      owner: 'user',
    })], 'user-place-custom');
  }, [ydoc]);

  // Background click handler — captures clicks on the empty area when a
  // tool is active and drops the matching primitive there. Mounted on a
  // transparent rect so it only fires when no shape was hit.
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (!activeTool) return;
    const world = screenToWorld(e.clientX, e.clientY);
    if (activeTool.mode === 'place-node') {
      placeKindAt(activeTool.kind, world.x, world.y);
      onToolConsumed?.();
    } else if (activeTool.mode === 'custom-tool') {
      placeCustomToolAt(activeTool.toolId, world.x, world.y);
      onToolConsumed?.();
    }
    // connector / text / select modes ignore background clicks
  }, [activeTool, screenToWorld, placeKindAt, placeCustomToolAt, onToolConsumed]);


  const rects = nodes.filter((n): n is RectNode => n.type === 'rect');
  const shapes = nodes.filter((n): n is CustomShapeNode => n.type === 'customShape');
  const arrows = nodes.filter((n): n is ArrowNode => n.type === 'arrow');
  const bubbles = nodes.filter((n): n is BubbleNode => n.type === 'bubble' && n.expiresAt > now);

  // Map every id-addressable node the renderer can anchor arrows to.
  // Built once per render so arrows look up in O(1).
  const nodeById = new Map<string, CanvasNode>();
  // Secondary index: lowercase label → first matching node, for fuzzy arrow
  // resolution when a Brain references something by slug ("donors") instead
  // of the canonical id, which is common when arrows are added in a later
  // turn than the nodes were placed.
  const nodeByLabel = new Map<string, CanvasNode>();
  for (const n of nodes) {
    nodeById.set(n.id, n);
    const label = (n as { label?: string }).label;
    if (label) {
      const key = label.toLowerCase().trim();
      if (!nodeByLabel.has(key)) nodeByLabel.set(key, n);
    }
  }

  // Resolve an arrow endpoint by canonical id, by trailing-slug after the
  // brain prefix, or by label match. Returns null when nothing fits — the
  // arrow then renders to nothing rather than crashing.
  const resolveRef = (raw: string): CanvasNode | null => {
    if (!raw) return null;
    const direct = nodeById.get(raw);
    if (direct) return direct;
    const colon = raw.indexOf(':');
    const tail = colon >= 0 ? raw.slice(colon + 1) : raw;
    const tailDirect = nodeById.get(tail);
    if (tailDirect) return tailDirect;
    const labelHit = nodeByLabel.get(tail.toLowerCase().replace(/[-_]+/g, ' ').trim());
    return labelHit ?? null;
  };

  // Bubble lookup by brain id — each brain shows its newest live bubble.
  const bubbleByBrain = new Map<string, BubbleNode>();
  for (const b of bubbles) {
    const existing = bubbleByBrain.get(b.brainId);
    if (!existing || b.createdAt > existing.createdAt) bubbleByBrain.set(b.brainId, b);
  }

  const activeBrains = brains.filter((b) => b.state !== 'retired' && !b.retiredAt);

  if (activeBrains.length === 0 && rects.length === 0 && shapes.length === 0 && arrows.length === 0) return null;

  // Find the hovered node + the Brain that owns it for the inspect tooltip.
  const hoveredNode = hover ? nodeById.get(hover.nodeId) : null;
  const hoveredOwner = hoveredNode ? activeBrains.find(b => b.id === (hoveredNode as { owner?: string }).owner) : null;

  return (
    <>
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none', zIndex: 5, cursor: activeTool ? 'crosshair' : 'default' }}
    >
      {/* Background click/drag target. Active when:
            - place-node / custom-tool mode  → click drops a shape
            - select mode (or no tool)       → click+drag draws a marquee
          Disabled when spacebar is held so InteractiveCanvas's pan handler
          (which lives below us) receives the mousedown. */}
      {!isSpaceHeld && (activeTool?.mode === 'place-node' || activeTool?.mode === 'custom-tool' || activeTool?.mode === 'select' || !activeTool) && (
        <rect
          x={0} y={0} width="100%" height="100%"
          fill="transparent"
          style={{ pointerEvents: 'auto' }}
          onClick={handleBackgroundClick}
          onMouseDown={(e) => {
            // Only start a marquee in select-mode or no-tool. Other modes
            // route through their own handlers (place-node uses onClick).
            if (activeTool?.mode === 'place-node' || activeTool?.mode === 'custom-tool') return;
            const world = screenToWorld(e.clientX, e.clientY);
            marqueeRef.current = {
              startWorldX: world.x, startWorldY: world.y,
              currentWorldX: world.x, currentWorldY: world.y,
            };
            setSelectedId(null);
            setMarqueeIds([]);
            setMarqueeTick((t) => (t + 1) | 0);
          }}
        />
      )}
      {/* Shared arrowhead markers — referenced by arrow lines via marker-start/-end. */}
      <defs>
        <marker id="brain-arrowhead-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
        </marker>
        <marker id="brain-arrowhead-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
        </marker>
      </defs>
      <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
        {arrows.map((a) => {
          const from = resolveRef(a.fromNodeId);
          const to = resolveRef(a.toNodeId);
          if (!from || !to) return null;
          const fromBox = nodeBounds(from);
          const toBox = nodeBounds(to);
          if (!fromBox || !toBox) return null;
          const start = edgePoint(fromBox, boxCenter(toBox));
          const end = edgePoint(toBox, boxCenter(fromBox));
          const dasharray = a.style === 'dashed' ? '6 4' : a.style === 'dotted' ? '2 3' : undefined;
          const routing = a.routing ?? 'straight';
          const showEnd = a.endEnd !== 'none';
          const showStart = a.endStart === 'arrow';
          const path = arrowPath(start, end, routing);
          const labelAt = pathMidpoint(start, end, routing);
          const isSel = selectedId === a.id;
          return (
            <g
              key={a.id}
              style={{ pointerEvents: isSpaceHeld ? 'none' : 'auto', cursor: isSpaceHeld ? 'grab' : 'pointer' }}
              onMouseDown={(e) => { e.stopPropagation(); setSelectedId(a.id); }}
            >
              {/* Wide invisible hit-target so the line is easy to click — the
                  visible stroke is 1.6px which is too thin to grab reliably. */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
              />
              <path
                d={path}
                fill="none"
                stroke={isSel ? '#3b82f6' : '#475569'}
                strokeWidth={isSel ? 2.4 : 1.6}
                strokeDasharray={dasharray}
                markerEnd={showEnd ? 'url(#brain-arrowhead-end)' : undefined}
                markerStart={showStart ? 'url(#brain-arrowhead-start)' : undefined}
                style={{ pointerEvents: 'none' }}
              />
              {a.label && (
                <g transform={`translate(${labelAt.x}, ${labelAt.y})`} style={{ pointerEvents: 'none' }}>
                  <rect x={-a.label.length * 3 - 4} y={-8} width={a.label.length * 6 + 8} height={14} rx={3} fill="#ffffff" stroke={isSel ? '#3b82f6' : '#cbd5e1'} strokeWidth={isSel ? 1.5 : 0.5} />
                  <text x={0} y={2} textAnchor="middle" fontSize={10} fill="#334155">{a.label}</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Marquee selection rectangle — dashed blue while user is dragging
            from empty canvas. Subscribed via marqueeTick so it follows the
            cursor live. */}
        {marqueeRef.current && (() => {
          void marqueeTick;
          const m = marqueeRef.current!;
          const x = Math.min(m.startWorldX, m.currentWorldX);
          const y = Math.min(m.startWorldY, m.currentWorldY);
          const w = Math.abs(m.currentWorldX - m.startWorldX);
          const h = Math.abs(m.currentWorldY - m.startWorldY);
          return (
            <rect
              key="marquee"
              x={x} y={y} width={w} height={h}
              fill="rgba(59, 130, 246, 0.08)"
              stroke="#3b82f6" strokeWidth={1.2} strokeDasharray="4 3"
              style={{ pointerEvents: 'none' }}
            />
          );
        })()}

        {/* Connector-drag preview — dashed line from source handle to cursor
            while a hover-handle drag is in flight. Re-renders via connectDragTick. */}
        {connectDragRef.current && (() => {
          void connectDragTick;
          const c = connectDragRef.current!;
          return (
            <path
              key="connect-preview"
              d={`M ${c.startWorldX} ${c.startWorldY} L ${c.currentWorldX} ${c.currentWorldY}`}
              stroke="#3b82f6"
              strokeWidth={1.6}
              strokeDasharray="5 4"
              fill="none"
              markerEnd="url(#brain-arrowhead-end)"
              style={{ pointerEvents: 'none' }}
            />
          );
        })()}

        {rects.map((r) => {
          const isSel = selectedId === r.id || marqueeIds.includes(r.id);
          const isEditing = editingId === r.id;
          return (
            <g
              key={r.id}
              style={{ pointerEvents: isSpaceHeld ? 'none' : 'auto', cursor: isSpaceHeld ? 'grab' : 'move' }}
              onMouseDown={(e) => startDrag(r, e)}
              onDoubleClick={(e) => startEdit(r, e)}
              onMouseEnter={(e) => handleHoverEnter(r.id, e)}
              onMouseLeave={handleHoverLeave}
            >
              <rect
                x={r.x} y={r.y} width={r.w} height={r.h}
                fill={r.fill ?? '#ffffff'}
                stroke={isSel ? '#3b82f6' : (r.stroke ?? '#64748b')}
                strokeWidth={isSel ? 2.5 : 1.5}
                rx={6}
              />
              {r.label && !isEditing && (
                <text
                  x={r.x + r.w / 2} y={r.y + r.h / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={12} fill="#1e293b"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {r.label}
                </text>
              )}
              {isEditing && (
                <LabelEditor x={r.x} y={r.y + r.h / 2 - 12} w={r.w} value={editingValue} onChange={setEditingValue} onCommit={commitEdit} onCancel={cancelEdit} />
              )}
              {!connectDragRef.current && !isEditing && !activeTool && (
                <HandleDots
                  box={{ x: r.x, y: r.y, w: r.w, h: r.h }}
                  onStart={(side, wx, wy) => startConnectDrag(r.id, side, wx, wy)}
                  prominent={hover?.nodeId === r.id}
                />
              )}
            </g>
          );
        })}

        {shapes.map((s) => {
          const isSel = selectedId === s.id || marqueeIds.includes(s.id);
          const isEditing = editingId === s.id;
          return (
            <g
              key={s.id}
              style={{ pointerEvents: isSpaceHeld ? 'none' : 'auto', cursor: isSpaceHeld ? 'grab' : 'move' }}
              onMouseDown={(e) => startDrag(s, e)}
              onDoubleClick={(e) => startEdit(s, e)}
              onMouseEnter={(e) => handleHoverEnter(s.id, e)}
              onMouseLeave={handleHoverLeave}
            >
              <g
                transform={
                  `translate(${s.x}, ${s.y}) ` +
                  (s.iconId ? `scale(${s.w / 24}, ${s.h / 24})` : '')
                }
                style={{ color: '#0f172a' }}
                dangerouslySetInnerHTML={{ __html: s.svgContent }}
              />
              {isSel && (
                <rect
                  x={s.x - 3} y={s.y - 3} width={s.w + 6} height={s.h + 6}
                  fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 3"
                  rx={4}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {s.label && !s.labelInside && !isEditing && (
                <text
                  x={s.x + s.w / 2} y={s.y + s.h + 14}
                  textAnchor="middle"
                  fontSize={11} fill="#1e293b" fontWeight={500}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {s.label}
                </text>
              )}
              {isEditing && (
                <LabelEditor
                  x={s.x}
                  y={s.labelInside ? s.y + s.h / 2 - 12 : s.y + s.h + 2}
                  w={s.w}
                  value={editingValue}
                  onChange={setEditingValue}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                />
              )}
              {!connectDragRef.current && !isEditing && !activeTool && (
                <HandleDots
                  box={{ x: s.x, y: s.y, w: s.w, h: s.h }}
                  onStart={(side, wx, wy) => startConnectDrag(s.id, side, wx, wy)}
                  prominent={hover?.nodeId === s.id}
                />
              )}
            </g>
          );
        })}

        {/* Peer-message ghost arrows — render from sender's cursor to
            target's cursor, fading over 5s. Visualizes Brain teamwork. */}
        {peerGhosts.map((g) => {
          const elapsed = now - g.ts;
          if (elapsed > 5000) return null;
          const opacity = elapsed < 4200 ? 1 : Math.max(0, (5000 - elapsed) / 800);
          const from = activeBrains.find((b) => b.id === g.fromId);
          const to = activeBrains.find((b) => b.id === g.toId);
          if (!from || !to) return null;
          const sx = from.cursor.x + 6, sy = from.cursor.y + 8;
          const tx = to.cursor.x + 6, ty = to.cursor.y + 8;
          const mx = (sx + tx) / 2, my = (sy + ty) / 2;
          const lbl = g.content.length > 30 ? g.content.slice(0, 30) + '…' : g.content;
          return (
            <g key={g.id} opacity={opacity} style={{ transition: 'opacity 600ms ease-out' }}>
              <line
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={from.color} strokeWidth={1.4}
                strokeDasharray="5 4"
                markerEnd="url(#brain-arrowhead-end)"
              />
              <g transform={`translate(${mx}, ${my})`}>
                <rect x={-lbl.length * 3 - 6} y={-9} width={lbl.length * 6 + 12} height={16} rx={8} fill={from.color} />
                <text x={0} y={3} textAnchor="middle" fontSize={10} fill="#ffffff" fontWeight={500}>{lbl}</text>
              </g>
            </g>
          );
        })}

        {activeBrains.map((b) => (
          <BrainCursor
            key={b.id}
            brain={b}
            bubble={bubbleByBrain.get(b.id)}
            now={now}
            obstacles={[...rects, ...shapes].map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }))}
          />
        ))}
      </g>
    </svg>

    {/* Hover-inspect tooltip — shows when the user hovers a Brain-drawn shape.
        Lists kind/label/owner Brain plus quick "Ask {Brain}" buttons that fire
        a peer_message asking the Brain for suggestions on this specific node. */}
    {hover && hoveredNode && (
      <div
        style={{
          position: 'absolute',
          left: hover.screenX + 16,
          top: hover.screenY + 16,
          zIndex: 30,
          background: 'rgba(15, 23, 42, 0.96)',
          color: '#e2e8f0',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.08)',
          fontSize: 12,
          lineHeight: 1.4,
          minWidth: 220,
          maxWidth: 320,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          pointerEvents: 'auto',
          fontFamily: 'ui-sans-serif, system-ui',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>
            {(hoveredNode as { label?: string }).label || hoveredNode.id}
          </span>
          <span style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase' }}>{hoveredNode.type}</span>
        </div>
        {hoveredOwner && (
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
            placed by {hoveredOwner.emoji} {hoveredOwner.name}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {activeBrains.slice(0, 4).map((b) => (
            <button
              key={b.id}
              onClick={() => askBrainAboutNode(b.id, hover.nodeId)}
              style={{
                padding: '4px 8px', fontSize: 11, fontWeight: 500,
                background: b.color, color: '#ffffff',
                border: 'none', borderRadius: 4, cursor: 'pointer',
              }}
            >
              Ask {b.emoji} {b.name.replace(' Brain', '')}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, opacity: 0.5, marginTop: 8 }}>
          Drag to move · double-click to edit · Backspace to delete
        </div>
      </div>
    )}
    </>
  );
}

function BrainCursor({ brain, bubble, now, obstacles }: { brain: BrainNode; bubble: BubbleNode | undefined; now: number; obstacles: Box[] }) {
  const thinking = brain.state === 'thinking';
  const acting = brain.state === 'acting';

  // Pick the bubble side with the least overlap against nearby shapes so it
  // doesn't sit on top of the diagram. Cheap: try four candidates, score by
  // total overlap area, lowest wins. Computed in world coords because
  // obstacles are world; we then convert to local (cursor-relative) for
  // SVG rendering.
  const bubblePlacement = bubble
    ? pickBubbleSide(brain.cursor, estimateBubbleSize(bubble.content), obstacles)
    : null;

  // CSS transition on transform so each move_brain_cursor write animates
  // smoothly over ~380ms (matches executor.cursorTravelMs default) instead
  // of jumping. Easing tuned to feel deliberate, like a person picking a
  // spot, not robotic linear motion.
  return (
    <g
      transform={`translate(${brain.cursor.x}, ${brain.cursor.y})`}
      style={{ transition: 'transform 380ms cubic-bezier(0.4, 0.0, 0.2, 1)' }}
    >
      {/* Cursor body */}
      <polygon points="0,0 0,18 12,14" fill={brain.color} stroke="#ffffff" strokeWidth={0.8} />

      {/* Thinking indicator — pulsing ring */}
      {(thinking || acting) && (
        <circle cx={6} cy={8} r={14} fill="none" stroke={brain.color} strokeWidth={1.5} opacity={0.6}>
          <animate attributeName="r" from="10" to="20" dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.6" to="0" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Status pill — clear text label above the cursor when busy. The
          pulsing ring alone is too subtle on a crowded canvas; an explicit
          "thinking…" / "acting" / "blocked" tells the user at a glance
          which Brain is doing work and what kind. Placed above the name tag
          so it doesn't fight for the same visual slot. */}
      {(thinking || acting || brain.state === 'listening' || brain.state === 'travelling') && (
        <g transform="translate(14, -8)">
          <rect
            x={0}
            y={0}
            rx={8}
            ry={8}
            width={thinking ? 76 : acting ? 56 : brain.state === 'travelling' ? 68 : 64}
            height={14}
            fill={brain.color}
            opacity={0.95}
          />
          <text x={8} y={10.5} fontSize={9} fill="#ffffff" fontWeight={600} letterSpacing={0.2}>
            {thinking ? (
              <>
                thinking
                <tspan>
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.25;0.75;1"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                  …
                </tspan>
              </>
            ) : acting ? (
              'drawing'
            ) : brain.state === 'travelling' ? (
              'on the move'
            ) : (
              'listening'
            )}
          </text>
        </g>
      )}

      {/* Name tag */}
      <g transform="translate(14, 10)">
        <rect x={0} y={0} rx={3} width={brain.name.length * 6.2 + 18} height={16} fill={brain.color} opacity={0.85} />
        <text x={6} y={12} fontSize={10} fill="#ffffff" fontWeight={500}>
          {brain.emoji} {brain.name}
        </text>
      </g>

      {/* Speech bubble — auto-positioned to dodge nearby shapes */}
      {bubble && bubblePlacement && (
        <SpeechBubble
          bubble={bubble}
          now={now}
          offsetX={bubblePlacement.dx}
          offsetY={bubblePlacement.dy}
          tailDir={bubblePlacement.side}
        />
      )}
    </g>
  );
}

// Estimate bubble bounds before we commit to a side. Width capped at 320 to
// match SpeechBubble's clamp, plus a little margin for the tail.
function estimateBubbleSize(content: string): { w: number; h: number } {
  const w = Math.min(320, Math.max(60, content.length * 6 + 28));
  return { w, h: 38 }; // 30 body + 8 tail
}

interface Placement { dx: number; dy: number; side: 'above' | 'below' | 'left' | 'right' }

// Score bubble candidate positions by total overlap area with obstacles
// (clipped to the obstacle's intersection rect). Lowest score wins. Above
// is preferred on a tie because that's the FigJam default.
function pickBubbleSide(cursor: { x: number; y: number }, size: { w: number; h: number }, obstacles: Box[]): Placement {
  const cx = cursor.x;
  const cy = cursor.y;
  const PAD = 14; // gap between cursor and bubble
  const candidates: Array<{ p: Placement; box: Box }> = [
    { p: { dx: -size.w / 2 + 6, dy: -size.h - PAD, side: 'above' }, box: { x: cx - size.w / 2, y: cy - size.h - PAD, w: size.w, h: size.h } },
    { p: { dx: -size.w / 2 + 6, dy: 24 + PAD, side: 'below' },        box: { x: cx - size.w / 2, y: cy + 24 + PAD, w: size.w, h: size.h } },
    { p: { dx: 26, dy: -size.h / 2, side: 'right' },                  box: { x: cx + 26, y: cy - size.h / 2, w: size.w, h: size.h } },
    { p: { dx: -size.w - 18, dy: -size.h / 2, side: 'left' },         box: { x: cx - size.w - 18, y: cy - size.h / 2, w: size.w, h: size.h } },
  ];

  let bestIdx = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let overlap = 0;
    for (const o of obstacles) {
      const ix = Math.max(0, Math.min(c.box.x + c.box.w, o.x + o.w) - Math.max(c.box.x, o.x));
      const iy = Math.max(0, Math.min(c.box.y + c.box.h, o.y + o.h) - Math.max(c.box.y, o.y));
      overlap += ix * iy;
    }
    if (overlap < bestScore) {
      bestScore = overlap;
      bestIdx = i;
    }
  }
  return candidates[bestIdx].p;
}

// Inline label editor — an HTML input mounted via foreignObject so it
// participates in the SVG viewport transform. Auto-focused, commits on
// Enter or blur, cancels on Escape.
function LabelEditor({ x, y, w, value, onChange, onCommit, onCancel }: {
  x: number; y: number; w: number;
  value: string;
  onChange: (s: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <foreignObject x={x} y={y} width={w} height={28} style={{ overflow: 'visible' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') onCommit();
          else if (e.key === 'Escape') onCancel();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onBlur={onCommit}
        style={{
          width: '100%', height: 24, boxSizing: 'border-box',
          padding: '2px 6px', fontSize: 12, fontFamily: 'ui-sans-serif, system-ui',
          color: '#0f172a', background: '#ffffff',
          border: '2px solid #3b82f6', borderRadius: 4, outline: 'none',
          textAlign: 'center',
        }}
      />
    </foreignObject>
  );
}

interface Box { x: number; y: number; w: number; h: number }

function nodeBounds(n: CanvasNode): Box | null {
  if (n.type === 'rect' || n.type === 'customShape' || n.type === 'image' || n.type === 'sticky') {
    return { x: n.x, y: n.y, w: n.w, h: n.h };
  }
  if (n.type === 'brain') {
    return { x: n.cursor.x - 8, y: n.cursor.y - 4, w: 24, h: 24 };
  }
  return null;
}

function boxCenter(b: Box) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// Four fixed connection points per shape — top/right/bottom/left midpoints.
// Always rendered (dim when not hovered, prominent on hover) so the user
// always knows where connectors will land. Mouse-down on a dot starts a
// connector drag (parent captures source id + side via onStart).
// stopPropagation on mousedown is critical so node-body drag doesn't fire.
function HandleDots({ box, onStart, prominent = false }: {
  box: { x: number; y: number; w: number; h: number };
  onStart: (side: 'top' | 'right' | 'bottom' | 'left', wx: number, wy: number, e: React.MouseEvent) => void;
  prominent?: boolean;
}) {
  const sides: Array<{ side: 'top' | 'right' | 'bottom' | 'left'; cx: number; cy: number }> = [
    { side: 'top',    cx: box.x + box.w / 2, cy: box.y },
    { side: 'right',  cx: box.x + box.w,     cy: box.y + box.h / 2 },
    { side: 'bottom', cx: box.x + box.w / 2, cy: box.y + box.h },
    { side: 'left',   cx: box.x,             cy: box.y + box.h / 2 },
  ];
  const radius = prominent ? 5 : 3.5;
  const opacity = prominent ? 0.95 : 0.55;
  return (
    <g style={{ pointerEvents: 'none' }}>
      {sides.map((s) => (
        <circle
          key={s.side}
          cx={s.cx}
          cy={s.cy}
          r={radius}
          fill="#3b82f6"
          stroke="#ffffff"
          strokeWidth={1.25}
          opacity={opacity}
          style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
          onMouseDown={(e) => { e.stopPropagation(); onStart(s.side, s.cx, s.cy, e); }}
        />
      ))}
    </g>
  );
}

// Build an SVG path command for an arrow given its routing style.
// straight: straight line.
// elbow: right-angle bend — horizontal then vertical (FigJam "bent" style).
// curved: cubic bezier with horizontal control handles for an S-curve.
function arrowPath(s: { x: number; y: number }, e: { x: number; y: number }, routing: 'straight' | 'elbow' | 'curved'): string {
  if (routing === 'straight') return `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
  if (routing === 'elbow') {
    // Two-segment route — go horizontal first if the dominant delta is horizontal,
    // otherwise vertical first. Matches FigJam's bent connector behavior.
    const dx = Math.abs(e.x - s.x);
    const dy = Math.abs(e.y - s.y);
    if (dx >= dy) return `M ${s.x} ${s.y} L ${e.x} ${s.y} L ${e.x} ${e.y}`;
    return `M ${s.x} ${s.y} L ${s.x} ${e.y} L ${e.x} ${e.y}`;
  }
  // curved: cubic bezier with control points pulled along the dominant axis.
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const cx = Math.abs(dx) * 0.5;
    return `M ${s.x} ${s.y} C ${s.x + cx} ${s.y}, ${e.x - cx} ${e.y}, ${e.x} ${e.y}`;
  }
  const cy = Math.abs(dy) * 0.5;
  return `M ${s.x} ${s.y} C ${s.x} ${s.y + cy}, ${e.x} ${e.y - cy}, ${e.x} ${e.y}`;
}

function pathMidpoint(s: { x: number; y: number }, e: { x: number; y: number }, routing: 'straight' | 'elbow' | 'curved') {
  if (routing === 'elbow') {
    // Place label on the corner of the elbow for clarity.
    const dx = Math.abs(e.x - s.x);
    const dy = Math.abs(e.y - s.y);
    if (dx >= dy) return { x: e.x, y: s.y };
    return { x: s.x, y: e.y };
  }
  return { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
}

// Connection point on the box — snaps to one of 4 cardinal midpoints
// (top, right, bottom, left) closest to the target direction. Connectors
// land on these fixed points only, never along arbitrary edge positions.
// The dominant axis (whichever of |dx| or |dy| is larger) decides
// horizontal vs vertical exit.
function edgePoint(box: Box, target: { x: number; y: number }) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal dominant — exit through right or left midpoint.
    return dx >= 0
      ? { x: box.x + box.w, y: cy }
      : { x: box.x,         y: cy };
  }
  // Vertical dominant — exit through bottom or top midpoint.
  return dy >= 0
    ? { x: cx, y: box.y + box.h }
    : { x: cx, y: box.y };
}

function SpeechBubble({ bubble, now, offsetX, offsetY, tailDir }: {
  bubble: BubbleNode;
  now: number;
  offsetX: number;
  offsetY: number;
  tailDir: 'above' | 'below' | 'left' | 'right';
}) {
  const msRemaining = bubble.expiresAt - now;
  const fadeMs = 800;
  const opacity = msRemaining < fadeMs ? Math.max(0, msRemaining / fadeMs) : 1;
  const text = bubble.content;
  const approxWidth = Math.min(320, Math.max(60, text.length * 6 + 28));
  const bodyH = 30;

  // Tail rendered on the side facing back toward the cursor.
  let tail: string;
  switch (tailDir) {
    case 'above': // tail at bottom-center pointing down
      tail = `${approxWidth / 2 - 6},${bodyH} ${approxWidth / 2 + 6},${bodyH} ${approxWidth / 2},${bodyH + 8}`;
      break;
    case 'below': // tail at top-center pointing up
      tail = `${approxWidth / 2 - 6},0 ${approxWidth / 2 + 6},0 ${approxWidth / 2},-8`;
      break;
    case 'left': // tail at right-middle pointing right
      tail = `${approxWidth},${bodyH / 2 - 6} ${approxWidth},${bodyH / 2 + 6} ${approxWidth + 8},${bodyH / 2}`;
      break;
    case 'right': // tail at left-middle pointing left
      tail = `0,${bodyH / 2 - 6} 0,${bodyH / 2 + 6} -8,${bodyH / 2}`;
      break;
  }

  return (
    <g transform={`translate(${offsetX}, ${offsetY})`} opacity={opacity} style={{ transition: 'transform 320ms ease-out' }}>
      <rect x={0} y={0} width={approxWidth} height={bodyH} rx={15} fill="#0f172a" stroke="rgba(255,255,255,0.1)" />
      <foreignObject x={12} y={2} width={approxWidth - 24} height={bodyH - 2}>
        <div
          {...{ xmlns: 'http://www.w3.org/1999/xhtml' } as Record<string, string>}
          style={{
            color: '#e2e8f0',
            fontSize: 11,
            fontFamily: 'ui-sans-serif, system-ui',
            lineHeight: '26px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {text}
        </div>
      </foreignObject>
      <polygon points={tail} fill="#0f172a" />
    </g>
  );
}
