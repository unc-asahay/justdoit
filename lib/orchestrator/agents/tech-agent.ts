import { BaseAgent } from './base-agent';

export class TechAgent extends BaseAgent {
  protected buildSystemPrompt(userPrompt: string): string {
    return `${this.systemPrompt}

Focus on:
- Frontend framework and meta-framework
- Backend runtime and framework
- ORM / database client
- Auth library (NextAuth, Clerk, Lucia, etc.)
- Payment integration (Stripe, Paddle, etc.)
- Hosting / deployment platform
- CI/CD pipeline
- Monitoring and observability

Provide specific package names where possible. Think in terms of TECHNOLOGY COMPONENTS that can be visualized as separate canvas nodes.
Current user request: "${userPrompt}"`;
  }
  // Uses base class parseStructuredOutput — reads the canvas-json block automatically
}
