import { BaseAgent } from './base-agent';

export class ArchAgent extends BaseAgent {
  protected buildSystemPrompt(userPrompt: string): string {
    return `${this.systemPrompt}

RESPONSE FORMAT:
Analyse the request and explain your architecture decisions clearly.

CRITICAL INSTRUCTION: You MUST break down your architecture into granular nodes and edges.
DO NOT use the monolithic "create_diagram" action. You are STRICTLY FORBIDDEN from using "create_diagram".
Instead, output an array of "create_node" and "create_edge" actions in your canvas-json block.

Focus on these COMPONENT TYPES for the nodes:
- type: 'service' (backend APIs, microservices, workers)
- type: 'database' (SQL, NoSQL, cache, object storage)
- type: 'ui' (web app, mobile, dashboard)
- type: 'external' (payment, auth, email, CDN)
- type: 'api' (API gateways, load balancers, message queues)

Ensure every node has a unique string id, and include create_edge actions linking the sourceId to targetId.

After your explanation, include the required canvas-json block with your granular nodes and edges.

Current user request: "${userPrompt}"`;
  }
  // Uses base class parseStructuredOutput — reads the canvas-json block automatically
}
