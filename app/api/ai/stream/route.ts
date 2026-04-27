import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      transport,
      baseUrl,
      apiKey,
      model,
      messages = [],
      maxTokens = 4096,
      temperature = 0.7,
      systemPrompt,
    } = body;

    if (!baseUrl || !model) {
      return NextResponse.json(
        { error: 'Missing baseUrl or model. Please configure an API connection in Settings.' },
        { status: 400 }
      );
    }

    const cleanBase = baseUrl.replace(/\/+$/, '');

    // ── Anthropic Messages API ─────────────────────────────────────────────
    if (transport === 'anthropic_messages') {
      const anthropicMessages = messages.filter(
        (m: any) => m.role === 'user' || m.role === 'assistant'
      );

      const upstream = await fetch(`${cleanBase}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey || '',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'messages-2023-12-15',
        },
        body: JSON.stringify({
          model,
          messages: anthropicMessages,
          ...(systemPrompt ? { system: systemPrompt } : {}),
          max_tokens: maxTokens,
          stream: true,
        }),
      });

      if (!upstream.ok) {
        const err = await upstream.text();
        return NextResponse.json(
          { error: `Provider error ${upstream.status}: ${err}` },
          { status: upstream.status }
        );
      }

      // Anthropic SSE → transform to Vercel AI SDK 0:"chunk" format
      const stream = transformAnthropicStream(upstream.body!);
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'X-Vercel-AI-Data-Stream': 'v1',
        },
      });
    }

    // ── OpenAI-compatible Chat Completions API (default) ──────────────────
    const allMessages = [];
    if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt });
    allMessages.push(...messages.filter((m: any) => m.role !== 'system'));

    const upstream = await fetch(`${cleanBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || ''}`,
      },
      body: JSON.stringify({
        model,
        messages: allMessages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      return NextResponse.json(
        { error: `Provider error ${upstream.status}: ${err}` },
        { status: upstream.status }
      );
    }

    // OpenAI SSE → transform to Vercel AI SDK 0:"chunk" format
    const stream = transformOpenAIStream(upstream.body!);
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Vercel-AI-Data-Stream': 'v1',
      },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    return NextResponse.json(
      { error: `Failed to connect to gateway: ${message}` },
      { status: 503 }
    );
  }
}

// ── Stream Transformers ────────────────────────────────────────────────────

/**
 * Transforms an OpenAI-compatible SSE stream into the Vercel AI SDK
 * data stream format (0:"chunk") for parsing by stream.ts.
 */
function transformOpenAIStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const chunk = parsed?.choices?.[0]?.delta?.content;
              if (typeof chunk === 'string' && chunk.length > 0) {
                // Emit in Vercel AI SDK format: 0:"chunk"
                controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
              }
            } catch { /* ignore malformed lines */ }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Transforms an Anthropic SSE stream into the Vercel AI SDK
 * data stream format (0:"chunk") for parsing by stream.ts.
 */
function transformAnthropicStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);

            try {
              const parsed = JSON.parse(data);
              // Anthropic streaming events: content_block_delta with text_delta
              if (
                parsed?.type === 'content_block_delta' &&
                parsed?.delta?.type === 'text_delta'
              ) {
                const chunk = parsed.delta.text;
                if (typeof chunk === 'string' && chunk.length > 0) {
                  controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
                }
              }
            } catch { /* ignore malformed lines */ }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
