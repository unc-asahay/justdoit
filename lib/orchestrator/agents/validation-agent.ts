import { BaseAgent } from './base-agent';

export class ValidationAgent extends BaseAgent {
  protected buildSystemPrompt(userPrompt: string): string {
    return `${this.systemPrompt}

RESPONSE FORMAT:
Validate the proposed architecture and highlight risks.

Focus on these COMPONENT TYPES for the canvas diagram:
- Security checkpoints and vulnerabilities
- Performance bottlenecks
- Single points of failure
- Testing and monitoring infrastructure
- Compliance gates

After your explanation, include the required canvas-json block.

Current user request: "${userPrompt}"`;
  }
}
