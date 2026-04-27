/**
 * AI Stream Helper — client-side interface for the /api/ai/stream proxy.
 *
 * Always reads the active AIConnection from localStorage and uses its
 * transport, baseUrl, apiKey, and activeModel. The `model` param is
 * used only as a fallback if no connection is configured.
 */

export interface ThinkingConfig {
  enabled: boolean;
  effort?: 'low' | 'medium' | 'high';
  budgetTokens?: number;
}

export interface StreamOptions {
  model: string;
  connectionId?: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  thinking?: ThinkingConfig;
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Load the active connection from localStorage (client-side only)
// ---------------------------------------------------------------------------

function getActiveConnection(overrideId?: string): { transport: string; baseUrl: string; apiKey: string; activeModel: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('justdoit:ai-settings');
    if (!raw) return null;
    const settings = JSON.parse(raw);
    
    // 1. Try agent-specific connection override
    // 2. Try explicit active connection
    // 3. Fallback to first available
    const targetId = overrideId || settings.activeConnectionId;
    let conn = targetId
      ? settings.connections?.find((c: any) => c.id === targetId)
      : settings.connections?.[0];
      
    // If the override ID was provided but that connection was deleted, fallback to the global active connection
    if (!conn && overrideId && settings.activeConnectionId) {
      conn = settings.connections?.find((c: any) => c.id === settings.activeConnectionId);
    }

    if (!conn) return null;
    
    return {
      transport: conn.transport,
      baseUrl: conn.baseUrl,
      apiKey: conn.apiKey,
      activeModel: conn.activeModel,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main streaming function
// ---------------------------------------------------------------------------

export async function streamChat(options: StreamOptions): Promise<void> {
  const conn = getActiveConnection(options.connectionId);

  if (!conn) {
    options.onError(new Error(
      'No active API connection. Please go to Settings and add an API connection first.'
    ));
    return;
  }

  // Separate system messages from conversation messages
  const systemMessage = options.messages.find(m => m.role === 'system');
  const chatMessages = options.messages.filter(m => m.role !== 'system');

  try {
    const response = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Always use the active connection's model, not the legacy agent default
        model: conn.activeModel,
        messages: chatMessages,
        maxTokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        systemPrompt: systemMessage?.content,
        // Native connection config forwarded to the proxy
        transport: conn.transport,
        baseUrl: conn.baseUrl,
        apiKey: conn.apiKey,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      let errMsg = `API error ${response.status}`;
      try {
        const parsed = await response.json();
        errMsg = parsed.error ?? errMsg;
      } catch {
        errMsg = await response.text() || errMsg;
      }
      options.onError(new Error(errMsg));
      return;
    }

    if (!response.body) {
      options.onError(new Error('No response body received from API'));
      return;
    }

    // Parse the Vercel AI SDK data stream format: lines like  0:"chunk text"
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Vercel AI SDK text chunk format: 0:"Hello"
          if (trimmed.startsWith('0:')) {
            try {
              const chunk = JSON.parse(trimmed.slice(2));
              if (typeof chunk === 'string') {
                fullText += chunk;
                options.onChunk(chunk);
              }
            } catch { /* ignore malformed */ }
          }
          // Vercel AI SDK error format: 3:"Error message"
          else if (trimmed.startsWith('3:')) {
            try {
              const errMsg = JSON.parse(trimmed.slice(2));
              options.onError(new Error(typeof errMsg === 'string' ? errMsg : 'Stream error'));
              return;
            } catch { /* ignore */ }
          }
          // Raw SSE data: "data: ..."  (fallback for non-SDK backends)
          else if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const chunk = parsed?.choices?.[0]?.delta?.content;
              if (typeof chunk === 'string') {
                fullText += chunk;
                options.onChunk(chunk);
              }
            } catch { /* ignore */ }
          }
        }
      }

      options.onDone(fullText);

    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        options.onDone(fullText);
        return;
      }
      options.onError(err instanceof Error ? err : new Error('Stream read error'));
    }

  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      options.onDone('');
      return;
    }
    options.onError(err instanceof Error ? err : new Error('Stream request failed'));
  }
}
