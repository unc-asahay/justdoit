// Structured ring-buffer log for the Brains pipeline.
// Captures wake events, LLM calls, tool calls, ops applied, spawns, retires,
// and errors — so when "nothing happens on the canvas" we have a precise
// trail of what each Brain tried, what came back, and where it stopped.
//
// In-memory only. Cap is small (200 entries) so this is invisible at runtime.
// Dump as JSON to share, or wire into a panel for live viewing.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogKind =
  | 'wake'           // Brain received an event and woke
  | 'llm_request'    // about to call /api/brain/stream
  | 'llm_response'   // got a successful response with tool calls
  | 'llm_error'      // LLM call failed (HTTP, JSON, exception)
  | 'tool_call'      // a single tool call resolved into ops
  | 'op_applied'     // applyOps committed to the Y.Doc
  | 'spawn'          // a Brain hydrated into the registry
  | 'retire'         // a Brain retired
  | 'park'           // cursor parked after a user_prompt
  | 'heartbeat_skip' // a heartbeat tick was suppressed (busy, throttled, no conn)
  | 'error';         // anything else worth surfacing

export interface LogEntry {
  id: number;
  ts: number;        // epoch ms
  level: LogLevel;
  kind: LogKind;
  brainId?: string;
  message: string;   // human-readable one-liner
  data?: Record<string, unknown>; // structured payload (kept small)
}

const CAPACITY = 200;
const buffer: LogEntry[] = [];
let nextId = 1;
const subscribers = new Set<(e: LogEntry) => void>();

export function log(entry: Omit<LogEntry, 'id' | 'ts'>): void {
  const e: LogEntry = { id: nextId++, ts: Date.now(), ...entry };
  buffer.push(e);
  if (buffer.length > CAPACITY) buffer.splice(0, buffer.length - CAPACITY);
  for (const fn of subscribers) {
    try { fn(e); } catch (err) { console.error('[brain-log] subscriber error', err); }
  }
  // Also mirror to console for live dev visibility.
  const tag = `[brain:${entry.kind}${entry.brainId ? `:${entry.brainId}` : ''}]`;
  const consoleFn = entry.level === 'error' ? console.error : entry.level === 'warn' ? console.warn : console.log;
  consoleFn(tag, entry.message, entry.data ?? '');
}

export function getLog(): LogEntry[] {
  return buffer.slice();
}

export function clearLog(): void {
  buffer.length = 0;
}

export function subscribeLog(fn: (e: LogEntry) => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// Compact JSON dump suitable for copy/paste into a chat. Strips long fields
// so payloads stay within practical message sizes.
export function dumpLogJSON(): string {
  const compact = buffer.map(e => {
    const data = e.data ? truncateValues(e.data) : undefined;
    return { ...e, data };
  });
  return JSON.stringify(compact, null, 2);
}

function truncateValues(obj: Record<string, unknown>, maxStr = 240): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.length > maxStr) {
      out[k] = `${v.slice(0, maxStr)}…[+${v.length - maxStr}ch]`;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = truncateValues(v as Record<string, unknown>, maxStr);
    } else {
      out[k] = v;
    }
  }
  return out;
}
