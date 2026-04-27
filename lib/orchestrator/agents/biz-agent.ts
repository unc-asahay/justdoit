import { BaseAgent } from './base-agent';

export class BizAgent extends BaseAgent {
  protected buildSystemPrompt(userPrompt: string): string {
    return `${this.systemPrompt}

RESPONSE FORMAT:
Analyse the business requirements and propose solutions.

Focus on these COMPONENT TYPES for the canvas diagram:
- Business processes and workflows
- Revenue models and pricing tiers
- User journeys and stakeholder interactions
- Compliance and regulatory requirements
- Analytics and reporting dashboards

After your explanation, include the required canvas-json block.

Current user request: "${userPrompt}"`;
  }
}
