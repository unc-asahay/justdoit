import { BaseAgent } from './base-agent';

export class DesignAgent extends BaseAgent {
  protected buildSystemPrompt(userPrompt: string): string {
    return `${this.systemPrompt}

Focus on:
- Color palette and typography choices
- Layout structure (grid, flex, spacing)
- Component hierarchy and UI layers
- Responsive breakpoints
- Accessibility considerations
- Micro-interactions and animations

Think in terms of UI COMPONENTS and DESIGN LAYERS that can be visualized as canvas nodes.
Current user request: "${userPrompt}"`;
  }
  // Uses base class parseStructuredOutput — reads the canvas-json block automatically
}
