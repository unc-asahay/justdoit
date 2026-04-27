// Client-side LLM driver for one Brain wake cycle.
// Sends { system prompt, event context, tool schemas } to /api/brain/stream,
// receives tool calls, converts to CanvasOps via the tool registry.

import type { AIConnection } from '@/lib/ai/providers';
import type { BrainSpec, BrainEvent, CanvasOp, RegisteredTool } from './types';
import { canvasToolSchemas, toolCallToOps, type ResolvedToolCall } from './tools/canvas';
import { log } from './log';

export interface LLMResult {
  ops: CanvasOp[];
  tokensUsed: number;
  finishReason: string;
  text: string | null;
  error?: string;
}

// Per-session token cap — hard stop so a stuck Brain can't run away with
// costs. Default of 200k is generous for most sessions; user can raise or
// disable via the BrainsPanel UI which persists to localStorage. A value of
// 0 or Infinity means "no cap, trust the user".
const DEFAULT_SESSION_TOKEN_CAP = 200_000;
const LS_KEY_CAP = 'justdoit:brains:sessionTokenCap';

let sessionTokensUsed = 0;
let sessionTokenCap = DEFAULT_SESSION_TOKEN_CAP;

// Restore cap from localStorage on module load (browser only).
// Storage convention: 0 OR negative OR non-finite means "no cap" (Infinity).
// Without this, "No cap" persists as 0, restore would set cap=0, and the
// gate `used >= cap` would reject every call instantly.
if (typeof window !== 'undefined') {
  try {
    const raw = window.localStorage.getItem(LS_KEY_CAP);
    if (raw !== null) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        sessionTokenCap = Number.POSITIVE_INFINITY;
      } else {
        sessionTokenCap = parsed;
      }
    }
  } catch { /* ignore */ }
}

export function getSessionTokenUsage(): number {
  return sessionTokensUsed;
}

export function resetSessionTokenUsage(): void {
  sessionTokensUsed = 0;
}

export function getSessionTokenCap(): number {
  return sessionTokenCap;
}

export function setSessionTokenCap(value: number): void {
  sessionTokenCap = Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_KEY_CAP, String(sessionTokenCap === Number.POSITIVE_INFINITY ? 0 : sessionTokenCap));
    } catch { /* ignore */ }
  }
}

export async function callBrainLLM(params: {
  spec: BrainSpec;
  event: BrainEvent;
  connection: AIConnection;
  recentContext?: string;
  registeredTools?: RegisteredTool[];
}): Promise<LLMResult> {
  const { spec, event, connection, recentContext, registeredTools = [] } = params;

  // Belt-and-braces: if cap is somehow non-positive (corrupted localStorage,
  // stale state from before the No-cap fix) treat as unlimited.
  const effectiveCap = Number.isFinite(sessionTokenCap) && sessionTokenCap > 0 ? sessionTokenCap : Number.POSITIVE_INFINITY;
  if (sessionTokensUsed >= effectiveCap) {
    log({ level: 'warn', kind: 'llm_error', brainId: spec.id, message: `session token cap ${effectiveCap} reached` });
    return {
      ops: [], tokensUsed: 0, finishReason: 'budget_cap', text: null,
      error: `Session token cap ${effectiveCap} reached; skipping LLM call.`,
    };
  }

  const userPrompt = buildUserPrompt(event, recentContext, registeredTools);

  log({
    level: 'info', kind: 'llm_request', brainId: spec.id,
    message: `→ ${connection.transport} ${connection.activeModel}`,
    data: {
      transport: connection.transport,
      model: connection.activeModel,
      eventType: event.type,
      promptLen: userPrompt.length,
      registeredTools: registeredTools.length,
    },
  });

  try {
    const res = await fetch('/api/brain/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transport: connection.transport,
        baseUrl: connection.baseUrl,
        apiKey: connection.apiKey,
        model: connection.activeModel,
        systemPrompt: spec.systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: canvasToolSchemas,
        maxTokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      const errMsg = errBody.error ?? `HTTP ${res.status}`;
      log({ level: 'error', kind: 'llm_error', brainId: spec.id, message: `HTTP ${res.status}: ${errMsg}`, data: { status: res.status, body: errBody } });
      return {
        ops: [], tokensUsed: 0, finishReason: 'http_error', text: null,
        error: errMsg,
      };
    }

    const data = await res.json() as {
      toolCalls: ResolvedToolCall[];
      text: string | null;
      finishReason: string;
      usage: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | null;
    };

    // Resolve toolId references against the registered-tools list before
    // handing to the executor. This turns "place an instance of database-
    // cylinder" into a concrete SVG + sensible default dimensions.
    const toolsById = new Map(registeredTools.map(t => [t.id, t]));
    const toolsByName = new Map(registeredTools.map(t => [t.name.toLowerCase(), t]));
    const ops: CanvasOp[] = [];
    for (const call of data.toolCalls ?? []) {
      if (call.name === 'place_shape' && !call.args.svg && !call.args.iconId) {
        const ref = call.args.toolId ? String(call.args.toolId) : '';
        const tool = toolsById.get(ref) ?? toolsByName.get(ref.toLowerCase());
        if (tool) {
          call.args.svg = tool.svgContent;
          if (!call.args.w) call.args.w = tool.defaultW;
          if (!call.args.h) call.args.h = tool.defaultH;
          call.args.toolId = tool.id;
        }
      }
      const newOps = await toolCallToOps(spec.id, call);
      log({
        level: 'info', kind: 'tool_call', brainId: spec.id,
        message: `${call.name} → ${newOps.length} op${newOps.length === 1 ? '' : 's'}`,
        data: { name: call.name, args: call.args, opsProduced: newOps.length },
      });
      ops.push(...newOps);
    }

    const tokensUsed = data.usage?.total_tokens ?? 0;
    sessionTokensUsed += tokensUsed;

    log({
      level: 'info', kind: 'llm_response', brainId: spec.id,
      message: `← ${data.toolCalls?.length ?? 0} calls, ${tokensUsed} tokens, finish=${data.finishReason}`,
      data: {
        toolCalls: data.toolCalls?.length ?? 0,
        tokensUsed,
        finishReason: data.finishReason,
        textPreview: data.text ? data.text.slice(0, 120) : null,
      },
    });

    return {
      ops,
      tokensUsed,
      finishReason: data.finishReason,
      text: data.text,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ level: 'error', kind: 'llm_error', brainId: spec.id, message: `exception: ${msg}` });
    return {
      ops: [], tokensUsed: 0, finishReason: 'exception', text: null,
      error: msg,
    };
  }
}

function buildUserPrompt(event: BrainEvent, recentContext?: string, registeredTools: RegisteredTool[] = []): string {
  const parts: string[] = [];
  parts.push(`Event received: ${event.type}`);
  if (event.authorId) parts.push(`Author: ${event.authorId}`);
  if (event.payload && Object.keys(event.payload).length) {
    parts.push(`Payload: ${JSON.stringify(event.payload)}`);
  }
  if (recentContext) parts.push(`Recent context:\n${recentContext}`);

  if (registeredTools.length > 0) {
    const lines = registeredTools.slice(0, 20).map(t =>
      `- ${t.emoji} ${t.name} (id: ${t.id}, ${t.defaultW}×${t.defaultH}): ${t.description}`,
    );
    parts.push(
      `Already-registered custom tools on this canvas (prefer these over inventing new shapes):\n${lines.join('\n')}`,
    );
  }

  parts.push(
    'Decide what to do. You may call say, move_to, place_rect, place_shape, and register_tool. ' +
    'Prefer place_shape with an existing toolId from the registered tools above when one fits. ' +
    'If no registered tool fits, try an iconId from iconify (e.g. "lucide:database"). ' +
    'Only author raw SVG as a last resort, and then also register_tool it for future reuse. ' +
    'Keep responses short. If the event does not require action, return no tool calls.',
  );
  return parts.join('\n\n');
}
