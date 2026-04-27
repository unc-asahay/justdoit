/**
 * Context Builder — build agent context from prior decisions.
 */

import { getPalace } from './palace';
import { extractEntities, summarizeEntities } from './entity-extractor';
import type { AgentContext, PriorDecision, ExtractedEntity } from './types';

export function buildAgentContext(
  projectSlug: string,
  agentId: string,
  currentPrompt: string,
): AgentContext {
  const palace = getPalace(projectSlug);

  // 1. Get prior decisions from this agent's wing
  const ownResults = palace.search({
    query: currentPrompt,
    wings: [agentId],
    limit: 5,
  });

  // 2. Get cross-wing decisions (from other agents) that are relevant
  const crossResults = palace.search({
    query: currentPrompt,
    limit: 5,
    minScore: 0.3,
  });

  // Combine & deduplicate
  const seenIds = new Set<string>();
  const priorDecisions: PriorDecision[] = [];

  for (const result of [...ownResults, ...crossResults]) {
    if (seenIds.has(result.entry.id)) continue;
    seenIds.add(result.entry.id);

    priorDecisions.push({
      content: result.entry.content,
      wingId: result.wingId,
      roomName: result.roomName,
      score: result.score,
      timestamp: result.entry.timestamp,
    });
  }

  // Sort by score
  priorDecisions.sort((a, b) => b.score - a.score);

  // 3. Collect all entities across the palace
  const allEntities: ExtractedEntity[] = [];
  for (const wingId of palace.getWingIds()) {
    for (const roomName of palace.getRoomNames(wingId)) {
      const room = palace.getRoom(wingId, roomName);
      for (const entry of room.entries) {
        allEntities.push(...entry.entities);
      }
    }
  }

  const entitySummary = summarizeEntities(allEntities);

  return {
    agentId,
    projectSlug,
    priorDecisions: priorDecisions.slice(0, 10),
    entitySummary,
  };
}

export function formatContextPrompt(context: AgentContext): string {
  if (
    context.priorDecisions.length === 0 &&
    context.entitySummary === 'No entities extracted yet.'
  ) {
    return '';
  }

  const parts: string[] = [
    '## Prior Context (from MemPalace)',
    '',
  ];

  if (context.priorDecisions.length > 0) {
    parts.push('### Previous Decisions');
    for (const d of context.priorDecisions) {
      const wing = d.wingId.replace('-agent', '');
      const score = Math.round(d.score * 100);
      const truncated = d.content.length > 200
        ? d.content.slice(0, 200) + '...'
        : d.content;
      parts.push(`- [${wing}/${d.roomName}] (${score}% match) ${truncated}`);
    }
    parts.push('');
  }

  if (context.entitySummary !== 'No entities extracted yet.') {
    parts.push('### Known Entities');
    parts.push(context.entitySummary);
    parts.push('');
  }

  parts.push('### Instructions');
  parts.push('- DO NOT contradict prior decisions unless explicitly asked to reconsider.');
  parts.push('- Reference prior decisions when relevant.');
  parts.push('- State new decisions clearly so they can be stored.');

  return parts.join('\n');
}

export function storeAgentResponse(
  projectSlug: string,
  agentId: string,
  agentName: string,
  response: string,
): void {
  const palace = getPalace(projectSlug);
  const entities = extractEntities(response);

  palace.storeAuto(agentId, response, {
    agentId,
    agentName,
    entities,
    metadata: { type: 'agent-response' },
  });
}
