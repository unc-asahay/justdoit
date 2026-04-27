'use client';

// Live Brains panel — replaces the legacy AgentsTab roster (which advertised
// 11 hardcoded agents that never actually ran on the canvas). This panel
// reads the truth: BrainNodes from the shared Y.Doc, the user's currently
// active AI connection, and live session token usage. Every Brain shown here
// is a real autonomous LLM context that responds to canvas events.

import { useEffect, useMemo, useState } from 'react';
import { useBrains, useBrainNodes } from '@/lib/brains/provider';
import { useSettings } from '@/lib/ai/settings-store';
import { ensureLeadBrain, LEAD_BRAIN_ID } from '@/lib/brains/lead';
import { getSessionTokenUsage, getSessionTokenCap, setSessionTokenCap, resetSessionTokenUsage } from '@/lib/brains/llm';
import { makeEvent } from '@/lib/brains/events';
import { getLog, subscribeLog, dumpLogJSON, clearLog, type LogEntry } from '@/lib/brains/log';
import { BRAIN_TEMPLATES, type BrainTemplate } from '@/lib/brains/templates';
import { getPalace } from '@/lib/memory';
import type { BrainNode } from '@/lib/brains/types';

type RightTab = 'detail' | 'activity';

export function BrainsPanel() {
  const { registry, eventBus } = useBrains();
  const brains = useBrainNodes();
  const { getActiveConnection } = useSettings();
  const [tokenUsage, setTokenUsage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<RightTab>('detail');
  const [logs, setLogs] = useState<LogEntry[]>(() => getLog());

  useEffect(() => {
    const id = setInterval(() => setTokenUsage(getSessionTokenUsage()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsub = subscribeLog(() => setLogs(getLog()));
    return () => unsub();
  }, []);

  const connection = getActiveConnection();
  const activeBrains = brains.filter((b) => !b.retiredAt && b.state !== 'retired');
  const retiredBrains = brains.filter((b) => b.retiredAt || b.state === 'retired');
  const selectedBrain = selected ? brains.find((b) => b.id === selected) ?? null : null;

  const handleSpawnLead = () => {
    if (!connection) return;
    ensureLeadBrain(registry, brains);
  };

  const handleSpawnTemplate = (tpl: BrainTemplate) => {
    if (!connection) return;
    registry.spawn(tpl.buildSpec(), tpl.defaultZone, tpl.defaultCursor);
  };

  const handleRetire = (brainId: string) => {
    registry.retire(brainId, 'user');
    if (selected === brainId) setSelected(null);
  };

  const handleWake = (brainId: string) => {
    eventBus.publish(makeEvent(
      'heartbeat_tick',
      { reason: 'manual_wake' },
      { authorId: 'user', targetBrainId: brainId },
    ));
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-app)' }}>
      {/* Left: Brain roster */}
      <aside style={{ width: 360, borderRight: '1px solid var(--border-color)', overflow: 'auto', background: 'var(--bg-panel)' }}>
        <ConnectionBanner
          connection={connection}
          tokenUsage={tokenUsage}
          activeCount={activeBrains.length}
        />
        <TokenBudgetSection tokenUsage={tokenUsage} />

        <div style={{ padding: '12px 16px 4px' }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>
            Live Brains
          </h3>
        </div>

        {activeBrains.length === 0 && (
          <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
            No Brains alive yet. They spawn on the first canvas prompt — or you can{' '}
            <button onClick={handleSpawnLead} disabled={!connection} style={inlineLink}>
              wake the Lead now
            </button>.
          </div>
        )}

        {activeBrains.map((b) => (
          <BrainRow key={b.id} brain={b} selected={selected === b.id} onSelect={() => setSelected(b.id)} />
        ))}

        {retiredBrains.length > 0 && (
          <>
            <div style={{ padding: '20px 16px 4px' }}>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>
                Retired
              </h3>
            </div>
            {retiredBrains.slice(0, 6).map((b) => (
              <BrainRow key={b.id} brain={b} selected={selected === b.id} onSelect={() => setSelected(b.id)} />
            ))}
          </>
        )}
      </aside>

      {/* Right: detail / actions / activity */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <RightTabs tab={tab} onChange={setTab} activityCount={logs.length} />
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {tab === 'activity' ? (
            <ActivityPanel logs={logs} brains={brains} selectedBrainId={selected} onSelectBrain={setSelected} />
          ) : selectedBrain ? (
            <BrainDetail brain={selectedBrain} onRetire={() => handleRetire(selectedBrain.id)} onWake={() => handleWake(selectedBrain.id)} />
          ) : (
            <>
              <EmptyDetail hasConnection={Boolean(connection)} />
              <TemplateSpawnGrid hasConnection={Boolean(connection)} onSpawn={handleSpawnTemplate} liveBrainIds={new Set(activeBrains.map((b) => b.id))} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function RightTabs({ tab, onChange, activityCount }: { tab: RightTab; onChange: (t: RightTab) => void; activityCount: number }) {
  return (
    <div style={{
      display: 'flex', gap: 0, borderBottom: '1px solid var(--border-color)',
      background: 'var(--bg-panel)', padding: '0 16px',
    }}>
      <TabButton active={tab === 'detail'} onClick={() => onChange('detail')}>Detail</TabButton>
      <TabButton active={tab === 'activity'} onClick={() => onChange('activity')}>
        Activity {activityCount > 0 && <span style={{ opacity: 0.6 }}>({activityCount})</span>}
      </TabButton>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 14px', fontSize: 12, fontWeight: 500,
        background: 'transparent', border: 'none',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
        marginBottom: -1, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ActivityPanel({ logs, brains, selectedBrainId, onSelectBrain }: {
  logs: LogEntry[];
  brains: BrainNode[];
  selectedBrainId: string | null;
  onSelectBrain: (id: string | null) => void;
}) {
  const [filterKind, setFilterKind] = useState<string>('all');
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);

  const filtered = useMemo(() => {
    const reversed = logs.slice().reverse(); // newest first
    return reversed.filter(e => {
      if (selectedBrainId && e.brainId !== selectedBrainId) return false;
      if (filterKind !== 'all' && e.kind !== filterKind) return false;
      if (showOnlyErrors && e.level !== 'error' && e.level !== 'warn') return false;
      return true;
    });
  }, [logs, selectedBrainId, filterKind, showOnlyErrors]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(dumpLogJSON());
    } catch {
      const ta = document.createElement('textarea');
      ta.value = dumpLogJSON();
      document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
    }
  };

  const handleClear = () => { clearLog(); };

  const brainName = (id?: string) => {
    if (!id) return '';
    const b = brains.find(x => x.id === id);
    return b ? `${b.emoji} ${b.name}` : id;
  };

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Activity</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} of {logs.length} entries</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={handleCopy} style={btnSmall}>Copy JSON</button>
          <button onClick={handleClear} style={btnSmall}>Clear</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} style={selectStyle}>
          <option value="all">all kinds</option>
          <option value="wake">wake</option>
          <option value="llm_request">llm_request</option>
          <option value="llm_response">llm_response</option>
          <option value="llm_error">llm_error</option>
          <option value="tool_call">tool_call</option>
          <option value="op_applied">op_applied</option>
          <option value="spawn">spawn</option>
          <option value="retire">retire</option>
          <option value="park">park</option>
          <option value="heartbeat_skip">heartbeat_skip</option>
          <option value="error">error</option>
        </select>
        <select value={selectedBrainId ?? ''} onChange={(e) => onSelectBrain(e.target.value || null)} style={selectStyle}>
          <option value="">all brains</option>
          {brains.map(b => (
            <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={showOnlyErrors} onChange={(e) => setShowOnlyErrors(e.target.checked)} />
          errors/warnings only
        </label>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No matching log entries. Send a prompt on /canvas to start populating this.
        </div>
      ) : (
        <div style={{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11.5,
          border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden',
        }}>
          {filtered.map((e) => (
            <div key={e.id} style={{
              padding: '6px 10px', borderBottom: '1px solid var(--border-subtle, var(--border-color))',
              display: 'grid', gridTemplateColumns: '78px 70px 110px 1fr', gap: 8,
              background: levelBg(e.level), color: 'var(--text-primary)',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{formatTime(e.ts)}</span>
              <span style={{ fontWeight: 600, color: levelColor(e.level) }}>{e.level}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{e.kind}</span>
              <span>
                {e.brainId && <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{brainName(e.brainId)}</span>}
                {e.message}
                {e.data && Object.keys(e.data).length > 0 && (
                  <details style={{ marginTop: 2 }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10 }}>data</summary>
                    <pre style={{ margin: '4px 0 0', fontSize: 10.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(e.data, null, 2)}
                    </pre>
                  </details>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}
function levelColor(l: LogEntry['level']): string {
  return l === 'error' ? '#ef4444' : l === 'warn' ? '#f59e0b' : l === 'info' ? '#3b82f6' : '#94a3b8';
}
function levelBg(l: LogEntry['level']): string {
  return l === 'error' ? 'rgba(239, 68, 68, 0.06)' : l === 'warn' ? 'rgba(245, 158, 11, 0.05)' : 'transparent';
}

const btnSmall: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, fontWeight: 500,
  background: 'var(--bg-panel)', color: 'var(--text-primary)',
  border: '1px solid var(--border-color)', borderRadius: 4, cursor: 'pointer',
};
const selectStyle: React.CSSProperties = {
  padding: '4px 8px', fontSize: 12,
  background: 'var(--bg-panel)', color: 'var(--text-primary)',
  border: '1px solid var(--border-color)', borderRadius: 4,
};

function TokenBudgetSection({ tokenUsage }: { tokenUsage: number }) {
  // Local state mirrors the module-level cap so slider edits are responsive.
  // On mount we read the persisted value; setSessionTokenCap writes back to
  // localStorage and updates the module's enforcement variable.
  const PRESETS = [
    { label: '50k', value: 50_000 },
    { label: '200k', value: 200_000 },
    { label: '500k', value: 500_000 },
    { label: '1M', value: 1_000_000 },
    { label: 'No cap', value: 0 }, // 0 => unlimited
  ];
  const initial = getSessionTokenCap();
  const [cap, setCap] = useState<number>(Number.isFinite(initial) ? initial : 0);
  const apply = (v: number) => {
    setCap(v);
    setSessionTokenCap(v === 0 ? Number.POSITIVE_INFINITY : v);
  };
  const isUnlimited = !Number.isFinite(cap) || cap === 0;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((tokenUsage / Math.max(1, cap)) * 100));
  const danger = !isUnlimited && pct >= 85;

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Session token budget
        </span>
        <button
          onClick={() => resetSessionTokenUsage()}
          style={{
            fontSize: 10, padding: '3px 8px',
            background: 'transparent', color: 'var(--text-muted)',
            border: '1px solid var(--border-color)', borderRadius: 4, cursor: 'pointer',
          }}
        >↻ Reset usage</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 6 }}>
        <strong>{tokenUsage.toLocaleString()}</strong>
        <span style={{ color: 'var(--text-muted)' }}> / {isUnlimited ? '∞' : cap.toLocaleString()} tokens</span>
      </div>
      {!isUnlimited && (
        <div style={{ width: '100%', height: 6, background: 'var(--bg-app)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: danger ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e',
            transition: 'width 200ms ease-out',
          }} />
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {PRESETS.map((p) => {
          const active = (p.value === 0 && isUnlimited) || (Number.isFinite(cap) && cap === p.value);
          return (
            <button
              key={p.label}
              onClick={() => apply(p.value)}
              style={{
                fontSize: 11, padding: '4px 8px',
                background: active ? '#3b82f6' : 'transparent',
                color: active ? '#ffffff' : 'var(--text-secondary)',
                border: `1px solid ${active ? '#3b82f6' : 'var(--border-color)'}`,
                borderRadius: 4, cursor: 'pointer',
              }}
            >{p.label}</button>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4 }}>
        Hard cap on cumulative LLM tokens for this browser session. Resets on reload or via the button above. Persisted to localStorage.
      </div>
    </div>
  );
}

function ConnectionBanner({ connection, tokenUsage, activeCount }: {
  connection: ReturnType<ReturnType<typeof useSettings>['getActiveConnection']>;
  tokenUsage: number;
  activeCount: number;
}) {
  const ok = Boolean(connection);
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid var(--border-color)',
      background: ok ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{ok ? '🟢' : '🔴'}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {ok ? 'AI connection active' : 'No AI connection'}
        </span>
      </div>
      {ok ? (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <div><strong>{connection!.activeModel}</strong></div>
          <div style={{ opacity: 0.7 }}>{connection!.transport} · {connection!.baseUrl ?? 'default endpoint'}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
            <span>{activeCount} live</span>
            <span>{tokenUsage.toLocaleString()} tokens this session</span>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Open <a href="/settings" style={inlineLink}>Settings → AI</a> to configure a model. Brains can&apos;t think without one.
        </div>
      )}
    </div>
  );
}

function BrainRow({ brain, selected, onSelect }: { brain: BrainNode; selected: boolean; onSelect: () => void }) {
  const isLead = brain.id === LEAD_BRAIN_ID;
  const isRetired = Boolean(brain.retiredAt) || brain.state === 'retired';
  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%', textAlign: 'left',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: selected ? 'var(--bg-card-hover)' : 'transparent',
        borderTop: 'none', borderRight: 'none', borderBottom: 'none',
        borderLeftWidth: 3,
        borderLeftStyle: 'solid',
        borderLeftColor: selected ? brain.color : 'transparent',
        cursor: 'pointer',
        opacity: isRetired ? 0.5 : 1,
        color: 'var(--text-primary)',
      }}
    >
      <span style={{ fontSize: 18 }}>{brain.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{brain.name}</span>
          {isLead && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: brain.color, color: '#fff', fontWeight: 600 }}>LEAD</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
          {isRetired ? 'retired' : brain.state} · {brain.spec.modelProvider}
        </div>
      </div>
      <StateDot state={brain.state} retired={isRetired} />
    </button>
  );
}

function StateDot({ state, retired }: { state: BrainNode['state']; retired: boolean }) {
  if (retired) return <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>○</span>;
  const color = state === 'thinking' ? '#f59e0b' : state === 'acting' ? '#3b82f6' : state === 'listening' ? '#a855f7' : '#22c55e';
  const pulsing = state === 'thinking' || state === 'acting';
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%', background: color,
      boxShadow: pulsing ? `0 0 0 0 ${color}` : 'none',
      animation: pulsing ? 'brain-pulse 1.4s infinite' : 'none',
    }} />
  );
}

function BrainDetail({ brain, onRetire, onWake }: { brain: BrainNode; onRetire: () => void; onWake: () => void }) {
  const isLead = brain.id === LEAD_BRAIN_ID;
  const isRetired = Boolean(brain.retiredAt) || brain.state === 'retired';

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 32 }}>{brain.emoji}</span>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: 'var(--text-primary)' }}>{brain.name}</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            id: <code>{brain.id}</code> · state: <strong>{isRetired ? 'retired' : brain.state}</strong>
            {isLead && <> · <span style={{ color: brain.color }}>Lead Brain</span></>}
            {brain.spawnedBy && <> · spawned by <code>{brain.spawnedBy}</code></>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={onWake} disabled={isRetired} style={btnPrimary}>↻ Wake now</button>
        <button onClick={onRetire} disabled={isRetired} style={btnDanger}>✕ Retire</button>
      </div>

      <Section title="Model">
        <Kv k="provider" v={brain.spec.modelProvider} />
        <Kv k="model" v={brain.spec.modelId} />
        <Kv k="heartbeat" v={`${Math.round(brain.spec.heartbeatIntervalMs / 1000)}s`} />
      </Section>

      <Section title="Spatial">
        <Kv k="cursor" v={`(${Math.round(brain.cursor.x)}, ${Math.round(brain.cursor.y)})`} />
        <Kv k="zone" v={`x=${brain.zone.x}..${brain.zone.x + brain.zone.w}, y=${brain.zone.y}..${brain.zone.y + brain.zone.h}`} />
      </Section>

      <Section title="Allowed tools">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {brain.spec.allowedTools.map((t) => (
            <span key={t} style={chip}>{t}</span>
          ))}
        </div>
      </Section>

      <Section title="System prompt">
        <pre style={{
          fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)',
          background: 'var(--bg-panel)', padding: 12, borderRadius: 6,
          border: '1px solid var(--border-color)', maxHeight: 280, overflow: 'auto',
          whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        }}>
          {brain.spec.systemPrompt}
        </pre>
      </Section>

      <FeedKnowledge brainId={brain.id} brainName={brain.name} />
    </div>
  );
}

// Feed Knowledge — paste content the user wants this Brain to remember.
// Saved to MemPalace under this Brain's wing; auto-categorized into a
// matching room. Survives reloads via localStorage.
function FeedKnowledge({ brainId, brainName }: { brainId: string; brainName: string }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);

  const projectSlug = useMemo(() => {
    if (typeof window === 'undefined') return 'default';
    return new URLSearchParams(window.location.search).get('project') || 'default';
  }, []);

  const palace = getPalace(projectSlug);
  // Subscribe to palace changes so the recent-snippets list stays live.
  useEffect(() => {
    return palace.onChange(() => setTick((n) => n + 1));
  }, [palace]);

  const wing = palace.getWing(brainId);
  const allEntries: Array<{ room: string; content: string; ts: number }> = [];
  for (const [roomName, room] of wing.rooms) {
    for (const e of room.entries) allEntries.push({ room: roomName, content: e.content, ts: e.timestamp });
  }
  allEntries.sort((a, b) => b.ts - a.ts);

  const handleSave = () => {
    const content = text.trim();
    if (!content) return;
    setSaving(true);
    try {
      palace.storeAuto(brainId, content, {
        agentId: brainId,
        agentName: brainName,
        metadata: { type: 'user-fed-knowledge' },
      });
      setText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title={`Feed knowledge (MemPalace · ${allEntries.length} entries)`}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Paste docs, notes, decisions, or any source material you want ${brainName} to remember and reference. It'll auto-categorize into a relevant room and surface as prior context on the next think().`}
        style={{
          width: '100%', minHeight: 90, padding: 10, fontSize: 12,
          background: 'var(--bg-panel)', color: 'var(--text-primary)',
          border: '1px solid var(--border-color)', borderRadius: 6,
          fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
          marginBottom: 8,
        }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button onClick={handleSave} disabled={saving || !text.trim()} style={btnPrimary}>
          {saving ? 'Saving…' : '+ Feed to Brain'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Auto-categorized into a room. Persisted to localStorage.
        </span>
      </div>

      {allEntries.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Recent entries — {tick >= 0 ? null : null}
          </div>
          <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
            {allEntries.slice(0, 12).map((e, i) => (
              <div key={i} style={{ padding: '6px 10px', borderBottom: i < 11 ? '1px solid var(--border-subtle, var(--border-color))' : 'none', fontSize: 11.5, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>[{e.room}]</span>
                {e.content.length > 200 ? e.content.slice(0, 200) + '…' : e.content}
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function TemplateSpawnGrid({ hasConnection, onSpawn, liveBrainIds }: {
  hasConnection: boolean;
  onSpawn: (tpl: BrainTemplate) => void;
  liveBrainIds: Set<string>;
}) {
  return (
    <div style={{ marginTop: 32, maxWidth: 720 }}>
      <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' }}>
        Quick-spawn specialist Brains
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {BRAIN_TEMPLATES.map((tpl) => {
          // A template is "alive" if any live brain shares its template prefix
          // (heuristic: id starts with `brain_<prefix>_`).
          const prefix = tpl.id;
          const alreadySpawned = Array.from(liveBrainIds).some((id) => id.startsWith(`brain_${prefix === 'architect' ? 'arch' : prefix === 'designer' ? 'design' : prefix === 'reviewer' ? 'review' : prefix === 'plotter' ? 'plot' : prefix}_`));
          return (
            <button
              key={tpl.id}
              onClick={() => onSpawn(tpl)}
              disabled={!hasConnection}
              style={{
                textAlign: 'left',
                padding: 14,
                border: `1px solid ${tpl.color}40`,
                borderLeft: `4px solid ${tpl.color}`,
                borderRadius: 8,
                background: 'var(--bg-panel, #ffffff)',
                cursor: hasConnection ? 'pointer' : 'not-allowed',
                opacity: hasConnection ? 1 : 0.5,
                color: 'var(--text-primary)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
              title={alreadySpawned ? 'Click to spawn another instance' : `Spawn ${tpl.name}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>{tpl.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{tpl.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {alreadySpawned ? '✓ already on canvas' : 'click to spawn'}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {tpl.tagline}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyDetail({ hasConnection }: { hasConnection: boolean }) {
  return (
    <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18, color: 'var(--text-secondary)' }}>Live Brains</h2>
      <p>This panel reflects the actual Brains running on your canvas — pulled from the shared Y.Doc, not a hardcoded roster.</p>
      <p>Each Brain is its own autonomous LLM context. The Lead Brain auto-spawns on the first canvas prompt; peers are created when the Lead calls <code>spawn_brain</code>.</p>
      {!hasConnection && (
        <p style={{ color: '#ef4444' }}>You don&apos;t have an active AI connection. <a href="/settings" style={inlineLink}>Configure one</a> first.</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 0 8px' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', fontSize: 12, marginBottom: 4 }}>
      <span style={{ width: 100, color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{v}</span>
    </div>
  );
}

const inlineLink: React.CSSProperties = {
  color: '#3b82f6', background: 'transparent', border: 'none', padding: 0,
  cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit',
};

const btnPrimary: React.CSSProperties = {
  padding: '6px 12px', fontSize: 12, fontWeight: 500,
  background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
};

const btnDanger: React.CSSProperties = {
  padding: '6px 12px', fontSize: 12, fontWeight: 500,
  background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 6, cursor: 'pointer',
};

const chip: React.CSSProperties = {
  padding: '3px 8px', fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 4,
  color: 'var(--text-secondary)',
};
