// Per-Brain LLM endpoint. One call per Brain wake, returns the model's tool
// calls as JSON so the client can apply them via canvas-ops.
// Non-streaming for v1 — Brain responses are short (a few tool calls); the
// streaming TTFB savings aren't worth the tool-call parsing complexity.

import { NextRequest, NextResponse } from 'next/server';

interface BrainStreamRequest {
  transport: 'openai_chat' | 'anthropic_messages' | string;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  tools?: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  maxTokens?: number;
  temperature?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BrainStreamRequest;
    const {
      transport, baseUrl, apiKey, model, systemPrompt, messages,
      tools, maxTokens = 512, temperature = 0.7,
    } = body;

    if (!baseUrl || !model) {
      return NextResponse.json({ error: 'Missing baseUrl or model' }, { status: 400 });
    }

    if (transport === 'anthropic_messages') {
      // TODO: Anthropic tool-use path. For v1 only OpenAI-compatible providers.
      return NextResponse.json(
        { error: 'Anthropic transport not yet supported for Brains — use an OpenAI-compatible endpoint.' },
        { status: 501 },
      );
    }

    const cleanBase = baseUrl.replace(/\/+$/, '');
    const allMessages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt });
    allMessages.push(...messages.filter(m => m.role !== 'system'));

    const upstream = await fetch(`${cleanBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey ?? ''}`,
      },
      body: JSON.stringify({
        model,
        messages: allMessages,
        ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      return NextResponse.json(
        { error: `Provider ${upstream.status}: ${err.slice(0, 500)}` },
        { status: upstream.status },
      );
    }

    const data = await upstream.json();
    const choice = data?.choices?.[0];
    const rawToolCalls: Array<{ id?: string; function?: { name?: string; arguments?: string } }> =
      choice?.message?.tool_calls ?? [];

    const toolCalls = rawToolCalls.map((tc) => {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch { /* leave empty */ }
      return { id: tc.id ?? '', name: tc.function?.name ?? '', args };
    });

    return NextResponse.json({
      toolCalls,
      text: choice?.message?.content ?? null,
      finishReason: choice?.finish_reason ?? 'unknown',
      usage: data?.usage ?? null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    // Distinguish "we couldn't reach the upstream at all" (likely Bifrost
    // proxy not running, or wrong baseUrl) from other failures. The default
    // dev workflow runs Bifrost in a second process — `npm run dev:full`
    // starts both. A bare `npm run dev` leaves Bifrost off and every Brain
    // call fails here.
    const isConnRefused =
      /fetch failed|ECONNREFUSED|ENOTFOUND|connect ECONNREFUSED|Failed to fetch/i.test(msg);
    const friendly = isConnRefused
      ? `AI provider unreachable. Check that the Bifrost proxy is running (\`npm run bifrost\`) or that your baseUrl in Settings → AI is correct.`
      : `Proxy failure: ${msg}`;
    return NextResponse.json(
      { error: friendly, raw: msg, hint: isConnRefused ? 'bifrost-not-running' : undefined },
      { status: 503 },
    );
  }
}
