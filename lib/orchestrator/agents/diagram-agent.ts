/**
 * Diagram Agent — editorial-quality diagram generation.
 * Uses the diagram-design prompt library to produce self-contained HTML+SVG diagrams.
 * Instead of JSON canvas decisions, this agent outputs raw HTML that gets rendered
 * as a rich visual node on the canvas via <foreignObject> + iframe.
 */

import { BaseAgent } from './base-agent';
import { detectDiagramType } from '../prompt-analyzer';
import type { AgentResult, AgentStatus, StructuredDecision } from '../types';
import { streamChat } from '@/lib/ai/stream';
import type { ModelId } from '@/lib/ai/types';

// ── Static prompt content loaded at build time ────────────────────────────────
// These are imported as raw strings via a helper. In Next.js client components
// we inline them directly since fs is unavailable on the client.

import SKILL_PROMPT from '@/lib/ai/diagram-prompts/skill.md';
import STYLE_GUIDE from '@/lib/ai/diagram-prompts/style-guide.md';

// Type-specific references — imported statically
import TYPE_ARCHITECTURE from '@/lib/ai/diagram-prompts/types/type-architecture.md';
import TYPE_FLOWCHART from '@/lib/ai/diagram-prompts/types/type-flowchart.md';
import TYPE_SEQUENCE from '@/lib/ai/diagram-prompts/types/type-sequence.md';
import TYPE_STATE from '@/lib/ai/diagram-prompts/types/type-state.md';
import TYPE_ER from '@/lib/ai/diagram-prompts/types/type-er.md';
import TYPE_TIMELINE from '@/lib/ai/diagram-prompts/types/type-timeline.md';
import TYPE_SWIMLANE from '@/lib/ai/diagram-prompts/types/type-swimlane.md';
import TYPE_QUADRANT from '@/lib/ai/diagram-prompts/types/type-quadrant.md';
import TYPE_NESTED from '@/lib/ai/diagram-prompts/types/type-nested.md';
import TYPE_TREE from '@/lib/ai/diagram-prompts/types/type-tree.md';
import TYPE_LAYERS from '@/lib/ai/diagram-prompts/types/type-layers.md';
import TYPE_VENN from '@/lib/ai/diagram-prompts/types/type-venn.md';
import TYPE_PYRAMID from '@/lib/ai/diagram-prompts/types/type-pyramid.md';

const TYPE_MAP: Record<string, string> = {
  architecture: TYPE_ARCHITECTURE,
  flowchart: TYPE_FLOWCHART,
  sequence: TYPE_SEQUENCE,
  state: TYPE_STATE,
  er: TYPE_ER,
  timeline: TYPE_TIMELINE,
  swimlane: TYPE_SWIMLANE,
  quadrant: TYPE_QUADRANT,
  nested: TYPE_NESTED,
  tree: TYPE_TREE,
  layers: TYPE_LAYERS,
  venn: TYPE_VENN,
  pyramid: TYPE_PYRAMID,
};

const DIAGRAM_OUTPUT_INSTRUCTION = `

---
CRITICAL OUTPUT FORMAT:
You MUST output the diagram as a **single, self-contained HTML document** with inline CSS and inline SVG.
Wrap the entire output in a \`\`\`html code fence.

Rules:
- The HTML must be completely self-contained — no external scripts, no external images.
- Load Google Fonts via <link> tag (Instrument Serif, Geist, Geist Mono) as specified in the style guide.
- Use inline <style> for all CSS.
- Use <svg> for all diagram elements — boxes, arrows, text, connectors.
- Follow the design system exactly: 1px hairlines, no shadows, max border-radius 10px, all coords divisible by 4.
- Use the semantic color tokens from the style guide (paper, ink, accent, muted, etc.).
- The diagram should be exactly 800px wide and auto-height.
- Do NOT use Mermaid.js. Do NOT use canvas element. Do NOT use JavaScript.
- Do NOT output any JSON decision blocks. Only output the HTML.
- Keep text explanation minimal (1-2 sentences max before the HTML block).
`;

export class DiagramAgent extends BaseAgent {
  protected buildSystemPrompt(userPrompt: string): string {
    const diagramType = detectDiagramType(userPrompt);
    const typeRef = TYPE_MAP[diagramType] || TYPE_MAP['architecture'];

    console.log(`[DiagramAgent] Detected type: ${diagramType}`);

    return `${this.systemPrompt}

--- DIAGRAM DESIGN SYSTEM ---

${SKILL_PROMPT}

--- STYLE GUIDE ---

${STYLE_GUIDE}

--- DIAGRAM TYPE: ${diagramType.toUpperCase()} ---

${typeRef}

${DIAGRAM_OUTPUT_INSTRUCTION}

Current user request: "${userPrompt}"`;
  }

  /**
   * Override execute to skip the CANVAS_OUTPUT_INSTRUCTION from BaseAgent
   * and use our own diagram-specific output format.
   */
  async execute(
    userPrompt: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    callbacks: {
      onChunk: (chunk: string) => void;
      onStatusChange: (status: AgentStatus) => void;
      onDecision?: (decision: StructuredDecision) => void;
    },
    signal?: AbortSignal,
  ): Promise<AgentResult> {
    const startedAt = Date.now();
    this.status = 'thinking';
    callbacks.onStatusChange('thinking');

    // Build system prompt WITHOUT the base class CANVAS_OUTPUT_INSTRUCTION
    const systemPrompt = this.buildSystemPrompt(userPrompt);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory,
      { role: 'user' as const, content: userPrompt },
    ];

    let fullResponse = '';

    try {
      this.status = 'streaming';
      callbacks.onStatusChange('streaming');

      let streamError: Error | null = null;

      await streamChat({
        model: this.model,
        connectionId: this.connectionId,
        messages,
        signal,
        maxTokens: 16384, // Diagrams need more tokens for full HTML+SVG
        onChunk: (chunk) => {
          fullResponse += chunk;
          callbacks.onChunk(chunk);
        },
        onDone: (text) => {
          fullResponse = text;
        },
        onError: (err) => {
          streamError = err;
        },
      });

      if (streamError) {
        throw streamError;
      }

      this.status = 'done';
      callbacks.onStatusChange('done');

      // Extract HTML block and emit as a diagram decision
      const htmlContent = this.extractHtmlBlock(fullResponse);
      const structuredOutput: StructuredDecision[] = [];

      if (htmlContent && callbacks.onDecision) {
        const decision: StructuredDecision = {
          id: crypto.randomUUID(),
          category: 'diagram',
          decision: htmlContent,
          reasoning: 'Editorial diagram generated from prompt',
          confidence: 'high',
          agentId: this.id,
        };
        structuredOutput.push(decision);
        callbacks.onDecision(decision);
      }

      return {
        agentId: this.id,
        agentName: this.name,
        status: 'done',
        response: fullResponse,
        structuredOutput,
        model: this.model,
        startedAt,
        completedAt: Date.now(),
      };
    } catch (error) {
      this.status = 'error';
      callbacks.onStatusChange('error');

      return {
        agentId: this.id,
        agentName: this.name,
        status: 'error',
        response: fullResponse,
        model: this.model,
        startedAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extract the HTML content from the agent's response.
   * Looks for ```html ... ``` code fences.
   */
  private extractHtmlBlock(response: string): string | null {
    const match = response.match(/```html\s*([\s\S]*?)```/);
    if (match && match[1]) {
      return match[1].trim();
    }
    // Fallback: look for a complete HTML document
    const docMatch = response.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
    if (docMatch) {
      return docMatch[1].trim();
    }
    return null;
  }
}
