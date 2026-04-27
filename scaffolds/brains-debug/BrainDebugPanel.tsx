'use client';

// Debug + demo panel for the lib/brains module.
// Proves: spawn, event routing, LLM call (Minimax), tool-call parsing,
// canvas ops, bubble rendering, AND — new in this checkpoint — custom SVG
// shapes authored by the Brain plus icons resolved via the iconify proxy.

import { useEffect, useRef, useState } from 'react';
import { useBrains, useBrainNodes, useCanvasNodes, useRegisteredTools } from '@/lib/brains/provider';
import { makeEvent } from '@/lib/brains/events';
import { getSessionTokenUsage, resetSessionTokenUsage } from '@/lib/brains/llm';
import type { BrainSpec, BrainEvent, Zone, BubbleNode, RectNode, CustomShapeNode } from '@/lib/brains/types';

const PALETTE = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#ec4899'];

function makeTestSpec(n: number): BrainSpec {
  return {
    id: `test-brain-${Date.now().toString(36)}-${n}`,
    name: `Test Brain ${n}`,
    emoji: '🧠',
    color: PALETTE[n % PALETTE.length],
    modelProvider: 'minimax',
    modelId: 'MiniMax-M2.7-highspeed',
    systemPrompt:
      `You are Test Brain ${n}, an autonomous canvas colleague used for debugging the Brain pipeline. You see every canvas event and decide for yourself whether to act.\n\n` +
      `TOOLS:\n` +
      `- place_node({id, kind, x, y, label, connectsFrom?}): PRIMARY. Always pass an id slug; reference it via connectsFrom on later calls. Kinds include service, database, cache, queue, api, external, actor, file, decision, note + basic + flowchart shapes + sticky.\n` +
      `- say, move_to, draw_arrow (rare — prefer connectsFrom), place_shape (only for distinctive iconography via iconId="lucide:..."), mermaid_diagram (only for sequence/ER/state/gantt), chart, register_tool, message_brain.\n\n` +
      `RULES:\n` +
      `- Anchor work inside your zone (shown in Recent context). Read the Occupancy grid; never place on "##" cells; prefer listed Free regions coordinates. 60px minimum clearance from existing nodes.\n` +
      `- Real readable labels in sentence-case. Smallest diagram that answers fully.\n` +
      `- When you invent a reusable shape, register_tool it so other Brains find it.\n` +
      `- Connect what you place when the connection adds meaning — connections aren't a quota.\n\n` +
      `EVENTS:\n` +
      `- user_prompt: do the work the user asked for, in your zone.\n` +
      `- heartbeat_tick: patrol — ONE small thing or stay silent. Never redraw, never duplicate existing ids.\n` +
      `- peer_message: do the work AND message_brain back with a short ack.`,
    allowedTools: ['say', 'move_to', 'place_node', 'place_rect', 'place_shape', 'draw_arrow', 'mermaid_diagram', 'chart', 'register_tool'],
    heartbeatIntervalMs: 180_000,
    budget: { tokensPerHour: 20_000, tokensUsedThisHour: 0, hourResetAt: Date.now() + 3_600_000 },
    permissions: {
      canSpawnBrains: false,
      canEditOtherBrainsNodes: false,
      canRequestZoneResize: false,
      canAskUser: false,
    },
    capabilities: ['debug', 'general-diagram'],
  };
}

function makeZone(n: number): Zone {
  const col = n % 3;
  const row = Math.floor(n / 3) % 3;
  return { x: 40 + col * 400, y: 40 + row * 260, w: 360, h: 220 };
}

export function BrainDebugPanel() {
  const { registry, eventBus } = useBrains();
  const brains = useBrainNodes();
  const nodes = useCanvasNodes();
  const tools = useRegisteredTools();
  const [expanded, setExpanded] = useState(false);
  const [eventLog, setEventLog] = useState<BrainEvent[]>([]);
  const [tokenUsage, setTokenUsage] = useState(0);
  const spawnCounter = useRef(0);

  useEffect(() => {
    const unsub = eventBus.subscribe({}, (evt) => {
      setEventLog((prev) => [evt, ...prev].slice(0, 8));
    });
    return () => unsub();
  }, [eventBus]);

  useEffect(() => {
    const id = setInterval(() => setTokenUsage(getSessionTokenUsage()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleSpawn = () => {
    const n = ++spawnCounter.current;
    registry.spawn(makeTestSpec(n), makeZone(brains.length));
  };

  const handleWakeBasic = (brainId: string) => {
    const brain = brains.find((b) => b.id === brainId);
    if (!brain) return;
    eventBus.publish(
      makeEvent(
        'user_note',
        { content: 'Hello — here is a master idea: design a realtime notification service.' },
        { authorId: 'debug-user', zoneHint: brain.zone },
      ),
    );
  };

  const handleWakeShape = (brainId: string) => {
    const brain = brains.find((b) => b.id === brainId);
    if (!brain) return;
    eventBus.publish(
      makeEvent(
        'user_note',
        {
          content:
            'Draw a PostgreSQL database on the canvas. Use a cylinder shape (place_shape with appropriate SVG, OR the iconify id "simple-icons:postgresql"). Label it and register the cylinder as a reusable tool called "database-cylinder" so other Brains can use it.',
        },
        { authorId: 'debug-user', zoneHint: brain.zone },
      ),
    );
  };

  // Tests cross-Brain tool awareness: the Brain should spot the already-
  // registered database-cylinder in its context and place_shape instances of
  // it via toolId, instead of re-inventing the shape.
  const handleWakeReuse = (brainId: string) => {
    const brain = brains.find((b) => b.id === brainId);
    if (!brain) return;
    eventBus.publish(
      makeEvent(
        'user_note',
        {
          content:
            'Draw three labeled databases on the canvas, spaced horizontally: Users DB, Orders DB, Inventory DB. Check the already-registered custom tools for a suitable shape and reuse it instead of inventing a new one.',
        },
        { authorId: 'debug-user', zoneHint: brain.zone },
      ),
    );
  };

  const handleRetire = (id: string) => registry.retire(id, 'debug-panel');

  const handleTestIconify = async () => {
    try {
      const res = await fetch('/api/brain/icon?id=simple-icons:postgresql');
      const data = await res.json();
      alert(`Iconify returned ${data.svg?.length ?? 0} chars of SVG for simple-icons:postgresql.\n\nPreview:\n${(data.svg ?? data.error ?? '').slice(0, 200)}`);
    } catch (err) {
      alert(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const bubbles = nodes.filter((n): n is BubbleNode => n.type === 'bubble');
  const rects = nodes.filter((n): n is RectNode => n.type === 'rect');
  const shapes = nodes.filter((n): n is CustomShapeNode => n.type === 'customShape');
  const recentBubbles = [...bubbles].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const recentShapes = [...shapes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  return (
    <div style={{
      position: 'sticky', bottom: 0,
      background: 'var(--bg-nav, #0f172a)',
      borderTop: '1px solid var(--border-color, #1e293b)',
      color: 'var(--text-primary, #e2e8f0)',
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
      zIndex: 10,
    }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%', padding: '6px 12px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'transparent', border: 'none', color: 'inherit',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textAlign: 'left',
        }}
      >
        <span>🧪</span>
        <span style={{ fontWeight: 600 }}>Brain Debug Panel</span>
        <span style={{ opacity: 0.6 }}>checkpoint 3.5 · self-extending tools</span>
        <span style={{ marginLeft: 'auto', opacity: 0.6 }}>
          {brains.length} brain{brains.length === 1 ? '' : 's'} · {tokenUsage.toLocaleString()} tokens · {shapes.length} shapes · {tools.length} tools · {expanded ? '▼' : '▲'}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '8px 12px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <button onClick={handleSpawn} style={buttonStyle}>+ Spawn test Brain</button>
              <button onClick={handleTestIconify} style={buttonStyle}>🔗 Test iconify proxy</button>
              <button onClick={() => resetSessionTokenUsage()} style={buttonStyle}>↻ Reset tokens</button>
            </div>
            <div style={{ maxHeight: 160, overflowY: 'auto', borderRadius: 4, background: 'rgba(0,0,0,0.3)' }}>
              {brains.length === 0 ? (
                <div style={{ padding: 12, opacity: 0.5 }}>No Brains yet. Click Spawn.</div>
              ) : (
                brains.map((b) => (
                  <div key={b.id} style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: b.color, fontSize: 14 }}>{b.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                    <span style={{ opacity: 0.6, width: 90, fontSize: 10 }}>({Math.round(b.cursor.x)},{Math.round(b.cursor.y)})</span>
                    <span style={{ opacity: 0.6, width: 60, color: b.state === 'thinking' ? '#fbbf24' : undefined }}>{b.state}</span>
                    <button onClick={() => handleWakeBasic(b.id)} style={{ ...miniBtn, color: '#86efac' }}>wake</button>
                    <button onClick={() => handleWakeShape(b.id)} style={{ ...miniBtn, color: '#fbbf24' }}>shape</button>
                    <button onClick={() => handleWakeReuse(b.id)} style={{ ...miniBtn, color: '#a78bfa' }}>reuse</button>
                    <button onClick={() => handleRetire(b.id)} style={{ ...miniBtn, color: '#f87171' }}>retire</button>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: 10, marginBottom: 6, fontWeight: 600, opacity: 0.7 }}>
              Recent Brain bubbles ({bubbles.length} total)
            </div>
            <div style={{ maxHeight: 100, overflowY: 'auto', borderRadius: 4, background: 'rgba(0,0,0,0.3)' }}>
              {recentBubbles.length === 0 ? (
                <div style={{ padding: 10, opacity: 0.5 }}>Nothing said yet.</div>
              ) : (
                recentBubbles.map((b) => (
                  <div key={b.id} style={{ padding: '4px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 11 }}>
                    <span style={{ opacity: 0.5 }}>{new Date(b.createdAt).toLocaleTimeString()}</span>{' '}
                    <span style={{ color: '#93c5fd' }}>{b.brainId.slice(-10)}</span>:{' '}
                    <span>{b.content}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 6, fontWeight: 600, opacity: 0.7 }}>
              Recent custom shapes ({shapes.length} total · rects: {rects.length})
            </div>
            <div style={{ maxHeight: 160, overflowY: 'auto', borderRadius: 4, background: 'rgba(0,0,0,0.3)', padding: 4 }}>
              {recentShapes.length === 0 ? (
                <div style={{ padding: 10, opacity: 0.5 }}>No custom shapes yet. Click "shape" on a Brain.</div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {recentShapes.map((s) => (
                    <div key={s.id} style={{ padding: 6, borderRadius: 4, background: 'rgba(255,255,255,0.05)', minWidth: 110 }}>
                      <svg viewBox={s.iconId ? `0 0 24 24` : `0 0 ${s.w} ${s.h}`} width={s.w} height={s.h} style={{ display: 'block', background: '#fff', borderRadius: 3, color: '#0f172a' }} dangerouslySetInnerHTML={{ __html: s.svgContent }} />
                      <div style={{ fontSize: 10, marginTop: 4, opacity: 0.9, textAlign: 'center' }}>{s.label ?? '(no label)'}</div>
                      {s.iconId && <div style={{ fontSize: 9, opacity: 0.5, textAlign: 'center' }}>📦 {s.iconId}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, marginBottom: 6, fontWeight: 600, opacity: 0.7 }}>
              Registered tools ({tools.length})
            </div>
            <div style={{ maxHeight: 100, overflowY: 'auto', borderRadius: 4, background: 'rgba(0,0,0,0.3)', padding: 4 }}>
              {tools.length === 0 ? (
                <div style={{ padding: 10, opacity: 0.5 }}>No tools registered yet.</div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {tools.map((t) => (
                    <div key={t.id} style={{ padding: 6, borderRadius: 4, background: 'rgba(255,255,255,0.05)', minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, marginBottom: 2 }}>
                        <span style={{ fontSize: 14 }}>{t.emoji}</span>
                        <span style={{ fontWeight: 600 }}>{t.name}</span>
                      </div>
                      <svg viewBox={`0 0 ${t.defaultW} ${t.defaultH}`} width={t.defaultW} height={t.defaultH} style={{ display: 'block', background: '#fff', borderRadius: 3, color: '#0f172a' }} dangerouslySetInnerHTML={{ __html: t.svgContent }} />
                      <div style={{ fontSize: 9, opacity: 0.6, marginTop: 3 }}>{t.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, marginBottom: 6, fontWeight: 600, opacity: 0.7 }}>Event bus (last 8)</div>
            <div style={{ maxHeight: 80, overflowY: 'auto', borderRadius: 4, background: 'rgba(0,0,0,0.3)' }}>
              {eventLog.length === 0 ? (
                <div style={{ padding: 10, opacity: 0.5 }}>No events yet.</div>
              ) : (
                eventLog.map((e) => (
                  <div key={e.id} style={{ padding: '3px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 10 }}>
                    <span style={{ opacity: 0.5 }}>{new Date(e.at).toLocaleTimeString()}</span>{' '}
                    <span style={{ color: '#93c5fd' }}>{e.type}</span>
                    {e.targetBrainId && <span style={{ opacity: 0.6 }}> → {e.targetBrainId.slice(-10)}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)',
  color: 'inherit', cursor: 'pointer',
  fontSize: 11, fontFamily: 'inherit',
};

const miniBtn: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 3,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: 'inherit', cursor: 'pointer',
  fontSize: 10, fontFamily: 'inherit',
};
