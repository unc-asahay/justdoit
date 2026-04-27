'use client';

import { useState, useCallback, useRef } from 'react';
import { streamChat } from '@/lib/ai/stream';
import type { ChatMessage, ModelId } from '@/lib/ai/types';

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  send: (content: string, model: ModelId, systemPrompt?: string) => void;
  abort: () => void;
  clear: () => void;
  clearError: () => void;
}

export function useChat(projectId: string): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  const send = useCallback((content: string, model: ModelId, systemPrompt?: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      model,
      isStreaming: true,
    };

    streamingMessageIdRef.current = assistantMsg.id;

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    setError(null);

    // Build API messages array (includes history + system prompt)
    const apiMessages = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
      { role: 'user' as const, content },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    streamChat({
      model,
      messages: apiMessages,
      signal: controller.signal,
      maxTokens: 4096,
      onChunk: (chunk) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingMessageIdRef.current
              ? { ...m, content: m.content + chunk }
              : m
          )
        );
      },
      onDone: (fullText) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === streamingMessageIdRef.current
              ? { ...m, content: fullText, isStreaming: false }
              : m
          )
        );
        setIsStreaming(false);
        streamingMessageIdRef.current = null;
      },
      onError: (err) => {
        setError(err.message);
        setIsStreaming(false);
        setMessages(prev =>
          prev.filter(m => m.id !== streamingMessageIdRef.current)
        );
        streamingMessageIdRef.current = null;
      },
    });
  }, [messages]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages(prev =>
      prev.map(m =>
        m.id === streamingMessageIdRef.current
          ? { ...m, isStreaming: false }
          : m
      )
    );
    streamingMessageIdRef.current = null;
  }, []);

  const clear = useCallback(() => {
    abort();
    setMessages([]);
    setError(null);
  }, [abort]);

  const clearError = useCallback(() => setError(null), []);

  return { messages, isStreaming, error, send, abort, clear, clearError };
}
