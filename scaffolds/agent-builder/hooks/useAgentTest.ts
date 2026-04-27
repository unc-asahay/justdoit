'use client';

import { useState, useCallback } from 'react';
import type { CustomAgent } from '@/lib/agents';

export interface AgentTestResult {
  response: string;
  tokensUsed: number;
  latencyMs: number;
  canvasActionCount: number;
  model: string;
  timestamp: Date;
}

interface UseAgentTestReturn {
  testResult: AgentTestResult | null;
  isLoading: boolean;
  error: string | null;
  runTest: (agent: CustomAgent, prompt: string) => Promise<void>;
  clearResult: () => void;
}

export function useAgentTest(_projectId: string): UseAgentTestReturn {
  const [testResult, setTestResult] = useState<AgentTestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTest = useCallback(async (agent: CustomAgent, prompt: string) => {
    setIsLoading(true);
    setError(null);
    setTestResult(null);

    const startTime = Date.now();

    try {
      // In the full integration, this calls step-04's streamChat():
      // await streamChat({
      //   model: agent.defaultModel,
      //   messages: [
      //     { role: 'system', content: agent.systemPrompt },
      //     { role: 'user', content: prompt },
      //   ],
      //   onChunk: chunk => { fullResponse += chunk; },
      //   onDone: text => { fullResponse = text; },
      //   onError: err => { throw err; },
      // });

      // Simulate a response for testing the UI
      await new Promise(resolve => setTimeout(resolve, 1500));

      const latencyMs = Date.now() - startTime;

      const simulatedResponse = [
        `[${agent.name}] Analyzing your request...\n\n`,
        `Based on my analysis as a ${agent.persona || agent.name}:\n\n`,
        `1. I've reviewed the prompt: "${prompt.slice(0, 50)}..."\n`,
        `2. Using model: ${agent.defaultModel}\n`,
        `3. Zone: ${agent.zone.type} (priority ${agent.zone.priority})\n\n`,
        `This is a test response. In production, this would be the real AI model output.`,
      ].join('');

      // Count canvas actions in response
      const actionKeywords = /\b(create|draw|add|place|insert)\s+(shape|rectangle|circle|text|arrow|node|box)/gi;
      const matches = simulatedResponse.match(actionKeywords);
      const canvasActionCount = matches ? matches.length : 0;

      setTestResult({
        response: simulatedResponse,
        tokensUsed: Math.floor(prompt.length / 4) + Math.floor(simulatedResponse.length / 4),
        latencyMs,
        canvasActionCount,
        model: agent.defaultModel,
        timestamp: new Date(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setTestResult(null);
    setError(null);
  }, []);

  return { testResult, isLoading, error, runTest, clearResult };
}
