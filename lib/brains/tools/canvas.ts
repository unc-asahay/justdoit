// Canvas tools for Brains. Each tool has two parts:
//   1. An OpenAI-format function schema exposed to the LLM.
//   2. A runtime translator from tool-call args → CanvasOp.
//
// place_shape and register_tool let Brains extend the app's visual vocabulary —
// this is the core of the "self-extending tools" vision: if a Brain needs a
// cylinder, cloud, or hexagon that the stock toolbar doesn't offer, it writes
// the raw SVG (or fetches from an icon library) and draws directly. No
// central enum clips what it can express.

import type { CanvasOp, BrainNode, BrainSpec, Zone, Point, BrainTask, TaskPriority } from '../types';
import { createBubble, createRect, createCustomShape, createArrow, moveCursor, nodeId, registerTool, createTask, updateTask } from '../canvas-ops';
import { isNodeKind, renderNodeShape, defaultSizeFor, NODE_KINDS, type NodeKind } from './shapes';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum } from 'd3-force';

const PEER_PALETTE = ['#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16'];

// Build a spec for a Brain spawned by another Brain at runtime. Inherits the
// parent's model defaults but takes a custom role line so the child has a
// distinct personality. The new Brain shows up on the canvas the moment
// applyOps writes its BrainNode to b_brains — registry's observer hydrates it.
function buildPeerSpec(args: {
  parentBrainId: string;
  name: string;
  emoji: string;
  role: string;
}): BrainSpec {
  const id = `brain_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: args.name,
    emoji: args.emoji,
    color: PEER_PALETTE[Math.floor(Math.random() * PEER_PALETTE.length)],
    modelProvider: 'minimax',
    modelId: 'MiniMax-M2.7-highspeed',
    systemPrompt:
      `You are ${args.name}, a peer Brain on a virtual office canvas spawned by ${args.parentBrainId}.\n\n` +
      `YOUR ROLE: ${args.role}\n\n` +
      `TOOLS (use the right one):\n` +
      `- place_node({id, kind, x, y, label, connectsFrom?, connectsTo?}): PRIMARY tool. Always pass an \`id\` slug; reference it from later place_node calls via connectsFrom (each entry is {id} or {id, label}). Arrows auto-draw, no separate draw_arrow needed.\n` +
      `  Kinds: service, database, cache, queue, api, external, actor, file, decision, note + basic shapes (rectangle/ellipse/triangle/diamond/hexagon/star/parallelogram) + flow shapes (process/terminator/document/data/manual-input) + sticky.\n` +
      `- say(content): one-sentence chat bubble above your cursor.\n` +
      `- move_to(x, y): walk your cursor before placing.\n` +
      `- draw_arrow: only when connecting nodes you didn't place this turn.\n` +
      `- mermaid_diagram: only for sequence/ER/state/class/gantt — NOT mindmaps or flowcharts.\n` +
      `- chart: quantitative data only.\n` +
      `- register_tool: save a reusable shape for other Brains.\n` +
      `- message_brain({targetBrainId, content}): coordinate with peers. Look at "Other Brains on this canvas" in your context for ids.\n\n` +
      `WHEN TO ACT: you see every canvas event. Decide whether the event/state warrants action based on your role and what you actually see. Silence is valid. If nothing is yours to do, return zero tool calls.\n\n` +
      `SPATIAL DISCIPLINE:\n` +
      `- Anchor work inside your zone (shown in Recent context). Don't draw inside a peer's zone unless they message you.\n` +
      `- Read the Occupancy grid; never place on "##" cells. Use the listed Free regions coordinates.\n` +
      `- 60px minimum clearance from every existing node's bounds.\n\n` +
      `OUTPUT QUALITY: real readable labels in sentence-case. Smallest diagram that answers fully. Label arrows that carry meaning. Group spatially.\n\n` +
      `EVENTS:\n` +
      `- heartbeat_tick: patrol — ONE small thing or silence. Never redraw. Never duplicate existing ids.\n` +
      `- user_edit: optional move_to (x, y) + one-line comment.\n` +
      `- peer_message ({content, from}): do the work AND message_brain back with a short ack.`,
    allowedTools: ['say', 'move_to', 'place_node', 'place_rect', 'place_shape', 'draw_arrow', 'mermaid_diagram', 'chart', 'register_tool', 'message_brain', 'create_task', 'update_task'],
    heartbeatIntervalMs: 240_000,
    budget: { tokensPerHour: 20_000, tokensUsedThisHour: 0, hourResetAt: Date.now() + 3_600_000 },
    permissions: {
      canSpawnBrains: false,
      canEditOtherBrainsNodes: false,
      canRequestZoneResize: false,
      canAskUser: false,
    },
    // Dynamically-spawned peer — capabilities derived from the supplied role
    // string at spawn time. The Lead's spawn_brain prompt should pass tags
    // explicitly once we wire that path; for now seed with a generic tag so
    // the orchestrator can match free-form tasks to it.
    capabilities: ['general-diagram', 'peer-brain'],
  };
}

// Brain-scoped node ids let a Brain author stable handles like "frontend"
// and wire them up with draw_arrow in the same tool-call batch.
//
// Pass-through cases (no scoping):
//   - already prefixed with the Brain's id (`lead-brain:db`)
//   - matches a canonical node id pattern (`shape_xxx_yyy`, `rect_xxx_yyy`,
//     `arrow_xxx_yyy`, `brain_xxx_yyy`) — these come from summarizeZone() and
//     refer to nodes already on the canvas, possibly placed by other Brains
//
// Otherwise scope it as `<brainId>:<slug>` so two Brains can both use "db"
// without colliding when introducing new nodes.
const CANONICAL_ID_RE = /^(rect|shape|arrow|brain|bubble|sticky|n)_[a-z0-9]+_[a-z0-9]+$/i;

// Parse the connectsFrom/connectsTo argument shape — accepts either an array
// of strings (`["frontend", "auth"]`) or an array of objects with optional
// labels and a bidirectional flag (`[{id: "ws", label: "events", bidirectional: true}, ...]`).
function parseConnectionList(raw: unknown): Array<{ id: string; label?: string; bidirectional?: boolean }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; label?: string; bidirectional?: boolean }> = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) {
      out.push({ id: entry.trim() });
    } else if (entry && typeof entry === 'object' && 'id' in entry) {
      const e = entry as { id?: unknown; label?: unknown; bidirectional?: unknown };
      const id = typeof e.id === 'string' ? e.id.trim() : '';
      if (!id) continue;
      const label = typeof e.label === 'string' ? e.label.slice(0, 40) : undefined;
      const bidirectional = e.bidirectional === true ? true : undefined;
      out.push({ id, label, bidirectional });
    }
  }
  return out;
}

function scopedNodeId(brainId: string, raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const prefix = `${brainId}:`;
  if (s.startsWith(prefix)) return s;
  if (CANONICAL_ID_RE.test(s)) return s;
  return `${prefix}${s}`;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ResolvedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

// ─── Tool definitions exposed to the LLM ──────────────────────────────────

export const canvasToolSchemas: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'say',
      description:
        'Show a short speech bubble above your cursor for a few seconds. Use this to narrate what you are about to do, comment on the canvas, or respond to the user. Keep to one short sentence.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'One short sentence, max 140 chars.' },
          durationMs: { type: 'number', description: 'How long the bubble stays visible, default 4000ms.' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_to',
      description:
        'Move your cursor to a specific (x, y) coordinate on the canvas. Use this to travel to where you are about to do work.',
      parameters: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_rect',
      description:
        'Place a plain rectangle at (x, y) with width w and height h. Use this only for generic labeled boxes (services, components). For anything distinctive — database cylinders, cloud shapes, hexagons, browser frames, icons — use place_shape instead.\n\nPass an `id` (short stable slug like "frontend" or "api") if you intend to draw_arrow to/from this node later in the same response. Ids are scoped to you automatically.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Short stable handle you can reference from draw_arrow, e.g. "frontend". Scoped to this Brain automatically.' },
          x: { type: 'number' }, y: { type: 'number' },
          w: { type: 'number', description: 'Width, typically 120-200.' },
          h: { type: 'number', description: 'Height, typically 60-100.' },
          label: { type: 'string' },
          fill: { type: 'string', description: 'CSS color.' },
          stroke: { type: 'string', description: 'CSS color.' },
        },
        required: ['x', 'y', 'w', 'h'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_shape',
      description:
        'Place a custom shape at (x, y). Use SPARINGLY — for almost every standard diagram element (service, database, cache, queue, api, decision, note, actor, file, external) you should be calling place_node instead, which uses our tuned-and-consistent built-in primitives. Reach for place_shape only when you need iconography place_node does not cover — specific brand marks (Postgres logo, Kafka logo) or genuinely unusual shapes.\n\n' +
        'Three mutually-exclusive modes, in order of preference:\n' +
        '1. toolId — if the canvas already has a registered tool that fits (see "Already-registered tools" in your context), pass its toolId to instantiate it. Prefer this over re-authoring the same shape.\n' +
        '2. iconId — a standard icon from Iconify. ONLY these prefixes are allowed (others 400 from the proxy):\n' +
        '   - tabler: (e.g. "tabler:shield") — 4000+ outline icons, very consistent\n' +
        '   - lucide: (e.g. "lucide:database") — Feather successor, clean lines\n' +
        '   - phosphor: (e.g. "phosphor:cloud") — modern proportions\n' +
        '   - heroicons: (e.g. "heroicons:server") — Tailwind\'s set\n' +
        '   - mdi: (e.g. "mdi:rocket-launch") — Material Design Icons\n' +
        '   - simple-icons: (e.g. "simple-icons:postgresql") — BRAND MARKS ONLY (Postgres, Kafka, AWS, etc), not generic shapes\n' +
        '   - carbon: (e.g. "carbon:cloud-app") — IBM\'s set\n' +
        '   - material-symbols: (e.g. "material-symbols:database") — Google\'s modern set\n' +
        '   Iconify has 100+ sets but the rest are uneven quality and rejected at the proxy.\n' +
        '3. svg — inline SVG inner content you author yourself. Last resort. If you invent a shape you expect to reuse, also call register_tool so other Brains can find it next time.\n\n' +
        'Pass an `id` (short stable slug like "database" or "api") if you intend to draw_arrow to/from this shape later in the same response.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Short stable handle you can reference from draw_arrow, e.g. "database". Scoped to this Brain automatically.' },
          x: { type: 'number' }, y: { type: 'number' },
          w: { type: 'number' }, h: { type: 'number' },
          label: { type: 'string', description: 'Short label rendered below the shape.' },
          toolId: { type: 'string', description: 'ID of an already-registered tool (see context).' },
          iconId: { type: 'string', description: 'Iconify ID like "lucide:database".' },
          svg: {
            type: 'string',
            description: 'Inline SVG inner content (no outer <svg> wrapper), coordinates in 0..w × 0..h space. Example: "<ellipse cx=\\"50\\" cy=\\"10\\" rx=\\"40\\" ry=\\"6\\" fill=\\"white\\" stroke=\\"black\\"/>"',
          },
        },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_node',
      description:
        'Place a clean diagram primitive on the canvas AND its connections in one call. PREFERRED for all architecture/system-design work. Pass `connectsFrom` and/or `connectsTo` to declare which other nodes this one talks to — arrows are auto-drawn so you do NOT need to call draw_arrow separately. Always pass an `id` slug.\n\nKinds:\n' +
        '- service: rounded rect — any compute/module/app/microservice\n' +
        '- database: cylinder — any persistent store (Postgres, Mongo, S3)\n' +
        '- cache: rounded rect with bolt corner — Redis, Memcached, in-memory\n' +
        '- queue: rect with dividers — Kafka, SQS, RabbitMQ, pub/sub topic\n' +
        '- api: hexagon — gateway, public endpoint, lambda\n' +
        '- external: cloud — third-party service or system outside our control\n' +
        '- actor: person — user/persona/role\n' +
        '- file: doc shape — artifact, config, report\n' +
        '- decision: diamond — branching/routing logic\n' +
        '- note: yellow sticky — annotation/callout',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Short stable handle, e.g. "frontend". Used by other place_node calls to reference this node.' },
          kind: { type: 'string', enum: NODE_KINDS as unknown as string[], description: 'Which diagram primitive to draw.' },
          x: { type: 'number' },
          y: { type: 'number' },
          w: { type: 'number', description: 'Optional width override; sensible defaults per kind.' },
          h: { type: 'number', description: 'Optional height override.' },
          label: { type: 'string', description: 'Label rendered inside the shape (or under it for actors).' },
          fill: { type: 'string', description: 'CSS color override (rare — defaults are tuned).' },
          stroke: { type: 'string', description: 'CSS color override (rare).' },
          connectsFrom: {
            type: 'array',
            description: 'IDs of nodes that send data/requests INTO this one. Each entry produces an arrow → this node. Pass short slug strings, or {id, label} objects, or {id, label, bidirectional: true} to put arrowheads on BOTH ends (use sparingly — only for genuine two-way data flow like websockets, syncs, or saga peers).',
            items: {
              oneOf: [
                { type: 'string' },
                { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, bidirectional: { type: 'boolean' } }, required: ['id'] },
              ],
            },
          },
          connectsTo: {
            type: 'array',
            description: 'IDs of nodes that this one sends data/requests OUT to. Each entry produces an arrow → that node. Pass short slug strings, or {id, label} objects, or {id, label, bidirectional: true} for two-way arrows.',
            items: {
              oneOf: [
                { type: 'string' },
                { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, bidirectional: { type: 'boolean' } }, required: ['id'] },
              ],
            },
          },
        },
        required: ['id', 'kind', 'x', 'y', 'label'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draw_arrow',
      description:
        'Connect two nodes with an arrow. Use this to show flows, dependencies, request paths, or data movement between shapes. Call AFTER the place_rect / place_shape calls for the endpoints, referencing the `id` you assigned to each. The renderer auto-anchors the arrow on the nearest cardinal connection point.\n\n' +
        'Direction control:\n' +
        '- DEFAULT: a single arrowhead on the `to` end (one-way: from → to). Use for request flows, calls, dependencies — anything where data/control moves predominantly in one direction.\n' +
        '- bidirectional: TRUE puts arrowheads on BOTH ends. Use ONLY when both nodes truly exchange data back and forth as peers — e.g. a sync API where the client and server stream events to each other, two services in a publish/subscribe relationship, two microservices in a saga, or a websocket connection. Do NOT use bidirectional just to mean "they talk" — most "talks to" relationships are still request/response and a single arrowhead reads more clearly.',
      parameters: {
        type: 'object',
        properties: {
          fromId: { type: 'string', description: 'Handle of the source node (matches the `id` you passed to place_rect/place_shape).' },
          toId: { type: 'string', description: 'Handle of the target node.' },
          label: { type: 'string', description: 'Optional mid-arrow label, e.g. "HTTP", "reads", "syncs".' },
          style: { type: 'string', enum: ['solid', 'dashed', 'dotted'], description: 'Line style, defaults to solid.' },
          bidirectional: { type: 'boolean', description: 'When true, arrowheads on both ends — use only for genuine two-way data flow.' },
        },
        required: ['fromId', 'toId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mermaid_diagram',
      description:
        'Render a Mermaid diagram as ONE static shape on the canvas. Renders the entire diagram instantly — NOT sequentially — so only use this for diagram TYPES whose textual notation is the deliverable: sequenceDiagram, erDiagram, stateDiagram, classDiagram, gantt, journey, gitGraph. \n\n' +
        'DO NOT use mermaid_diagram for: mindmaps, flowcharts, architecture diagrams, taxonomies, lists of related items, org trees. For those use multiple place_node calls with connectsFrom — the user explicitly wants those built up sequentially, one node at a time.\n\n' +
        'The `code` parameter is the raw mermaid markup. Examples:\n' +
        '  sequenceDiagram\n    User->>API: POST /login\n    API->>DB: SELECT user\n    DB-->>API: row\n    API-->>User: token\n\n' +
        '  erDiagram\n    USER ||--o{ ORDER : places\n    ORDER ||--|{ LINE_ITEM : contains',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Top-left x of the rendered diagram on the canvas.' },
          y: { type: 'number', description: 'Top-left y.' },
          code: { type: 'string', description: 'Mermaid markup. Do NOT wrap in ```mermaid fences. Just the raw code.' },
          label: { type: 'string', description: 'Optional caption shown below the diagram.' },
          maxWidth: { type: 'number', description: 'Optional cap on rendered width in canvas units (default 600).' },
        },
        required: ['x', 'y', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'chart',
      description:
        'Render an Apache ECharts chart (bar, line, pie, scatter, sankey, treemap, funnel, gauge, radar, etc.) and place it on the canvas as a single shape. Use this for quantitative visualizations — anything where you have data points to plot, distributions to show, or proportions to compare.\n\nThe `option` parameter is a standard ECharts option object. Examples:\n  Pie:       { series: [{ type: "pie", data: [{value: 30, name: "A"}, {value: 70, name: "B"}] }] }\n  Bar:       { xAxis: {type:"category", data:["Mon","Tue","Wed"]}, yAxis:{type:"value"}, series:[{type:"bar", data:[10,20,15]}] }\n  Sankey:    { series: [{ type: "sankey", data: [{name:"a"},{name:"b"}], links: [{source:"a", target:"b", value:5}] }] }',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          option: { type: 'object', description: 'A complete ECharts option object. Include title.text if you want a chart title.' },
          width: { type: 'number', description: 'Render width, default 480.' },
          height: { type: 'number', description: 'Render height, default 320.' },
          label: { type: 'string', description: 'Optional caption shown below the chart.' },
        },
        required: ['x', 'y', 'option'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_network',
      description:
        'Place a force-directed network of nodes + edges, automatically laid out by a physics simulation. The system computes coordinates for every node so they don\'t overlap and edge crossings are minimised — you do NOT pass per-node x/y. Use this when:\n' +
        '- You have a non-hierarchical mesh (microservices that all talk to each other, peer-to-peer systems)\n' +
        '- The connectivity graph is dense (>4 nodes with most pairs connected)\n' +
        '- You want a knowledge graph, dependency graph, or topology view where direction is less important than reachability\n\n' +
        'When NOT to use it:\n' +
        '- Linear request flows (user → frontend → backend → db) — use sequential place_node, the layout has clear direction\n' +
        '- Hierarchies (org charts, ASTs, file trees) — use sequential place_node positioned manually, hierarchy reads better top-to-bottom\n' +
        '- Mindmaps with a clear root — use sequential place_node in a radial pattern\n\n' +
        'The whole network renders as native canvas nodes (kind=service by default) connected by arrows — same primitives as place_node, just laid out for you. Each node and arrow is independently editable afterward.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Top-left x of the bounding box for the network.' },
          y: { type: 'number', description: 'Top-left y.' },
          w: { type: 'number', description: 'Width of the layout area, e.g. 1200. Bigger = looser layout.' },
          h: { type: 'number', description: 'Height of the layout area, e.g. 800.' },
          nodes: {
            type: 'array',
            description: 'The nodes in the network. id is required; label is what the user sees; kind picks the diagram primitive (defaults to "service").',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Stable slug, scoped to this Brain. Reference it from the edges array.' },
                label: { type: 'string' },
                kind: { type: 'string', description: 'place_node kind: service, database, cache, queue, api, external, actor, file, decision, note. Defaults to "service".' },
              },
              required: ['id', 'label'],
            },
          },
          edges: {
            type: 'array',
            description: 'Edges connecting node ids. Each entry produces an arrow.',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                label: { type: 'string', description: 'Optional mid-arrow label, e.g. "syncs", "publishes".' },
                bidirectional: { type: 'boolean', description: 'Arrowheads on both ends — only for genuine two-way data flow.' },
              },
              required: ['from', 'to'],
            },
          },
          linkDistance: { type: 'number', description: 'Target distance between connected nodes, default 180. Larger = sparser.' },
        },
        required: ['x', 'y', 'w', 'h', 'nodes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'message_brain',
      description:
        'Send a direct message to a peer Brain on the canvas. Use this to hand off domain-specific work (Architect → Data Brain: "design the schema for users + orders"), to ask a peer to review your work, or to coordinate parallel effort. The target receives the message as a peer_message event, wakes, and responds via tool calls.\n\nWhen you reach for this: the user asked something that overlaps another Brain\'s domain. Hand the relevant slice off rather than working alone.',
      parameters: {
        type: 'object',
        properties: {
          targetBrainId: { type: 'string', description: 'The exact id of the peer Brain. Look at "Other Brains nearby" in your context — pass one of their ids (e.g. "lead-brain", "brain_arch_xxx").' },
          content: { type: 'string', description: 'What you want the peer to do or know. One short paragraph.' },
        },
        required: ['targetBrainId', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spawn_brain',
      description:
        'Bring a peer Brain online so it can take over a slice of the work in parallel. Use this when the user\'s ask spans clearly separable concerns (auth + payments + analytics) or when one autonomous teammate is not enough. The new Brain hydrates immediately, gets its own zone on the canvas, and starts responding to heartbeats. Do not over-spawn — three peers is plenty for most projects. The peer cannot itself spawn more Brains.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name like "Auth Brain" or "Payments Brain".' },
          emoji: { type: 'string', description: 'Single emoji used as its avatar, e.g. "🛡️" or "💳".' },
          role: { type: 'string', description: 'One- or two-sentence role description. Becomes part of the peer\'s system prompt.' },
          zoneX: { type: 'number', description: 'Top-left x of its zone on the canvas (default 200).' },
          zoneY: { type: 'number', description: 'Top-left y of its zone (default 600).' },
          zoneW: { type: 'number', description: 'Zone width (default 500).' },
          zoneH: { type: 'number', description: 'Zone height (default 320).' },
        },
        required: ['name', 'emoji', 'role'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_tool',
      description:
        'Register a reusable shape as a new tool that appears in the toolbar and can be reused by other Brains. Call this after you\'ve invented a shape you think will be needed more than once — e.g. a cylinder template for all databases in this project. Other Brains will see the tool description and know when to place instances of it.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short stable name like "database-cylinder" or "aws-lambda".' },
          emoji: { type: 'string', description: 'Single emoji used as the toolbar glyph.' },
          description: { type: 'string', description: 'One-line hint so other Brains know when to use it.' },
          svg: { type: 'string', description: 'Template SVG inner content, designed to fit a 100×60 viewBox.' },
          defaultW: { type: 'number', description: 'Default width for instances, typically 100-160.' },
          defaultH: { type: 'number', description: 'Default height for instances, typically 60-100.' },
        },
        required: ['name', 'emoji', 'description', 'svg'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        'Create a task in the orchestrator. Tasks are how the canvas decomposes a user prompt into discrete chunks of work that specific Brains pick up. Use create_task when you (the Lead Brain, or any Brain that recognises a separable subproblem) want to record "this work needs doing" without doing it yourself right now.\n\n' +
        'Capability matching: pass `requiredCapabilities` as an array of stable kebab-case tags (e.g. ["data-model", "schema-design"]). Any live Brain whose own capabilities contain ALL of those tags becomes a candidate to claim it. Pass an empty array if any Brain should be able to pick it up.\n\n' +
        'Direct assignment: pass `assigneeBrainId` to bind the task to a specific Brain (use the ids visible in "Other Brains on this canvas"). The assignee will be notified via task_assigned and wake to handle it.\n\n' +
        'Dependencies: pass `dependsOn` as an array of task ids that must finish first. The assignee will not be woken until all dependencies are done — use this to sequence work (e.g. "Architect designs system" must finish before "Tech-Architect picks deploy stack").',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short imperative title, e.g. "Design auth schema". Max 120 chars.' },
          description: { type: 'string', description: 'Optional 1-3 sentence brief — what to produce, what good looks like.' },
          requiredCapabilities: {
            type: 'array',
            description: 'Capability tags any candidate Brain must have. Examples: "system-architecture", "data-model", "ci-cd", "user-flow", "critique". Empty array = any Brain.',
            items: { type: 'string' },
          },
          assigneeBrainId: {
            type: 'string',
            description: 'Optional Brain id to assign directly. Skip if the orchestrator should match by capabilities instead.',
          },
          dependsOn: {
            type: 'array',
            description: 'Optional task ids that must reach status "done" before this one becomes pullable.',
            items: { type: 'string' },
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
            description: 'Defaults to "normal". Use "high" or "urgent" sparingly.',
          },
          id: {
            type: 'string',
            description: 'Optional stable slug for the task id. Useful when other create_task calls in this same response need to reference it via dependsOn (e.g. id: "design-auth", then dependsOn: ["design-auth"] in a later call).',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description:
        'Update an existing task. Used for: claiming an unassigned task (set assigneeBrainId to your own id and status to "doing"), reporting progress (status: "doing"), marking complete (status: "done"), reporting a blocker (status: "blocked", blockedReason: "..."), or attaching the canvas nodes you produced (outputNodeIds: [...]).\n\n' +
        'Status transitions:\n' +
        '- "todo" → "doing": you started work. Required when you claim.\n' +
        '- "doing" → "done": you finished. Pass outputNodeIds with the canvas node ids you produced so the Kanban view can fly to them.\n' +
        '- any → "blocked": you hit a real external blocker (missing info, conflicting requirement). Set blockedReason explicitly.\n' +
        '- "blocked" → "doing": blocker resolved.\n\n' +
        'Do NOT update tasks owned by other Brains except to coordinate via dependencies.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The id of the task to update. Look at "Ready tasks for me" or "Tasks on this canvas" in your context.' },
          status: { type: 'string', enum: ['todo', 'doing', 'blocked', 'done', 'cancelled'] },
          assigneeBrainId: { type: 'string', description: 'Set to your own id when claiming an unassigned task.' },
          blockedReason: { type: 'string', description: 'Required when status is "blocked".' },
          outputNodeIds: {
            type: 'array',
            description: 'Canvas node ids produced for this task. Useful when status is "done" so the Kanban tab can locate the work.',
            items: { type: 'string' },
          },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        },
        required: ['taskId'],
      },
    },
  },
];

// ─── Tool-call → CanvasOp translator ──────────────────────────────────────
// Note: place_shape with iconId resolves asynchronously via llm.ts — the
// translator below handles only the synchronous svg case. iconId resolution
// happens before this function is called.

export async function toolCallToOps(brainId: string, call: ResolvedToolCall): Promise<CanvasOp[]> {
  switch (call.name) {
    case 'say': {
      const content = String(call.args.content ?? '').slice(0, 200);
      if (!content) return [];
      const durationMs = Number(call.args.durationMs) || 4000;
      return [createBubble({ brainId, content, durationMs })];
    }

    case 'move_to': {
      const x = Number(call.args.x);
      const y = Number(call.args.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      return [moveCursor(brainId, { x, y })];
    }

    case 'place_rect': {
      const x = Number(call.args.x);
      const y = Number(call.args.y);
      const w = Number(call.args.w);
      const h = Number(call.args.h);
      if (![x, y, w, h].every(Number.isFinite)) return [];
      return [createRect({
        x, y, w, h,
        label: call.args.label ? String(call.args.label).slice(0, 80) : undefined,
        fill: call.args.fill ? String(call.args.fill) : undefined,
        stroke: call.args.stroke ? String(call.args.stroke) : undefined,
        owner: brainId,
        id: scopedNodeId(brainId, call.args.id),
      })];
    }

    case 'place_node': {
      const kind = call.args.kind;
      if (!isNodeKind(kind)) return [];
      const x = Number(call.args.x);
      const y = Number(call.args.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      const def = defaultSizeFor(kind);
      const w = Number(call.args.w) || def.w;
      const h = Number(call.args.h) || def.h;
      const label = String(call.args.label ?? '').slice(0, 80);
      const fill = call.args.fill ? String(call.args.fill) : undefined;
      const stroke = call.args.stroke ? String(call.args.stroke) : undefined;
      const svgContent = renderNodeShape(kind, { w, h, label, fill, stroke });
      const myScopedId = scopedNodeId(brainId, call.args.id);
      const ops: CanvasOp[] = [createCustomShape({
        x, y, w, h,
        svgContent,
        // Keep the label on the node — even though the SVG paints it, the
        // arrow renderer's label-fallback resolver needs it to match
        // draw_arrow refs by slug ("auth" → node labelled "Auth Service").
        label: label || undefined,
        labelInside: true, // suppress external <text> to avoid double rendering
        kind, // remembered so the inline editor can re-render the SVG when the label changes
        owner: brainId,
        id: myScopedId,
      })];

      // Auto-emit arrows from declared connections so the model doesn't have
      // to call draw_arrow separately — Minimax tends to forget when chained.
      const fromList = parseConnectionList(call.args.connectsFrom);
      const toList = parseConnectionList(call.args.connectsTo);
      for (const c of fromList) {
        const fromId = scopedNodeId(brainId, c.id);
        if (!fromId || !myScopedId || fromId === myScopedId) continue;
        ops.push(createArrow({
          fromNodeId: fromId,
          toNodeId: myScopedId,
          label: c.label,
          owner: brainId,
          // Bidirectional → both ends carry an arrowhead. endEnd defaults to
          // 'arrow', so we only need to set endStart when bidirectional.
          endStart: c.bidirectional ? 'arrow' : undefined,
        }));
      }
      for (const c of toList) {
        const toId = scopedNodeId(brainId, c.id);
        if (!toId || !myScopedId || toId === myScopedId) continue;
        ops.push(createArrow({
          fromNodeId: myScopedId,
          toNodeId: toId,
          label: c.label,
          owner: brainId,
          endStart: c.bidirectional ? 'arrow' : undefined,
        }));
      }
      return ops;
    }

    case 'place_shape': {
      const x = Number(call.args.x);
      const y = Number(call.args.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];

      // args.svg may have been pre-populated by llm.ts resolving a toolId
      // against the registered-tools map; iconId is resolved here via the
      // Iconify proxy. Width/height default to reasonable sizes when omitted.
      let svgContent = call.args.svg ? String(call.args.svg) : '';
      let w = Number(call.args.w);
      let h = Number(call.args.h);
      const iconId = call.args.iconId ? String(call.args.iconId) : undefined;
      const toolId = call.args.toolId ? String(call.args.toolId) : undefined;

      if (!svgContent && iconId) {
        try {
          const res = await fetch(`/api/brain/icon?id=${encodeURIComponent(iconId)}`);
          if (res.ok) {
            const data = await res.json();
            svgContent = String(data.svg ?? '');
          }
        } catch {
          svgContent = '';
        }
      }

      if (!Number.isFinite(w) || w <= 0) w = 100;
      if (!Number.isFinite(h) || h <= 0) h = 60;

      if (!svgContent) {
        svgContent = `<rect width="${w}" height="${h}" fill="none" stroke="#94a3b8" stroke-dasharray="4 2"/><text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#94a3b8">(shape unresolved)</text>`;
      }

      return [createCustomShape({
        x, y, w, h,
        svgContent,
        label: call.args.label ? String(call.args.label).slice(0, 80) : undefined,
        iconId,
        toolId,
        owner: brainId,
        id: scopedNodeId(brainId, call.args.id),
      })];
    }

    case 'draw_arrow': {
      const fromId = scopedNodeId(brainId, call.args.fromId);
      const toId = scopedNodeId(brainId, call.args.toId);
      if (!fromId || !toId || fromId === toId) return [];
      const style = call.args.style === 'dashed' || call.args.style === 'dotted' ? call.args.style : 'solid';
      const bidirectional = call.args.bidirectional === true;
      return [createArrow({
        fromNodeId: fromId,
        toNodeId: toId,
        label: call.args.label ? String(call.args.label).slice(0, 40) : undefined,
        style: style as 'solid' | 'dashed' | 'dotted',
        owner: brainId,
        endStart: bidirectional ? 'arrow' : undefined,
      })];
    }

    case 'mermaid_diagram': {
      const x = Number(call.args.x);
      const y = Number(call.args.y);
      const code = String(call.args.code ?? '').trim();
      if (!Number.isFinite(x) || !Number.isFinite(y) || !code) return [];
      const maxWidth = Number(call.args.maxWidth) || 600;
      try {
        const { renderMermaid } = await import('./renderers/mermaid');
        const { svgInner, width, height } = await renderMermaid(code);
        // Scale down if mermaid produced something wider than maxWidth, keeping aspect ratio.
        const scale = width > maxWidth ? maxWidth / width : 1;
        return [createCustomShape({
          x, y,
          w: width * scale,
          h: height * scale,
          // Wrap the mermaid markup in a viewBox-bearing inner <svg> so it stays
          // sized and positioned even though customShape's renderer only places
          // a translate() and not a scale() for non-icon shapes.
          svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * scale}" height="${height * scale}" preserveAspectRatio="xMidYMid meet">${svgInner}</svg>`,
          label: call.args.label ? String(call.args.label).slice(0, 80) : undefined,
          owner: brainId,
          id: scopedNodeId(brainId, call.args.id),
        })];
      } catch (err) {
        console.warn('[tools] mermaid render failed:', err);
        return [];
      }
    }

    case 'chart': {
      const x = Number(call.args.x);
      const y = Number(call.args.y);
      const option = call.args.option as Record<string, unknown> | undefined;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !option || typeof option !== 'object') return [];
      const width = Number(call.args.width) || 480;
      const height = Number(call.args.height) || 320;
      try {
        const { renderChart } = await import('./renderers/echarts');
        const { svgInner, width: w, height: h } = await renderChart(option, width, height);
        return [createCustomShape({
          x, y, w, h,
          svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">${svgInner}</svg>`,
          label: call.args.label ? String(call.args.label).slice(0, 80) : undefined,
          owner: brainId,
          id: scopedNodeId(brainId, call.args.id),
        })];
      } catch (err) {
        console.warn('[tools] chart render failed:', err);
        return [];
      }
    }

    case 'place_network': {
      const boxX = Number(call.args.x);
      const boxY = Number(call.args.y);
      const boxW = Number(call.args.w);
      const boxH = Number(call.args.h);
      if (![boxX, boxY, boxW, boxH].every(Number.isFinite) || boxW <= 0 || boxH <= 0) return [];
      const rawNodes = Array.isArray(call.args.nodes) ? call.args.nodes : [];
      const rawEdges = Array.isArray(call.args.edges) ? call.args.edges : [];
      // Normalize input. Bail if no nodes — a network with zero nodes is meaningless.
      type InNode = { id: string; label: string; kind: NodeKind };
      const nodes: InNode[] = [];
      for (const r of rawNodes) {
        if (!r || typeof r !== 'object') continue;
        const o = r as { id?: unknown; label?: unknown; kind?: unknown };
        const id = typeof o.id === 'string' ? o.id.trim() : '';
        const label = typeof o.label === 'string' ? o.label.trim().slice(0, 60) : id;
        if (!id || !label) continue;
        const kind: NodeKind = isNodeKind(o.kind) ? (o.kind as NodeKind) : 'service';
        nodes.push({ id, label, kind });
      }
      if (nodes.length === 0) return [];

      type InEdge = { from: string; to: string; label?: string; bidirectional?: boolean };
      const edges: InEdge[] = [];
      const nodeIdSet = new Set(nodes.map((n) => n.id));
      for (const r of rawEdges) {
        if (!r || typeof r !== 'object') continue;
        const o = r as { from?: unknown; to?: unknown; label?: unknown; bidirectional?: unknown };
        const from = typeof o.from === 'string' ? o.from.trim() : '';
        const to = typeof o.to === 'string' ? o.to.trim() : '';
        if (!from || !to || from === to || !nodeIdSet.has(from) || !nodeIdSet.has(to)) continue;
        edges.push({
          from, to,
          label: typeof o.label === 'string' ? o.label.slice(0, 40) : undefined,
          bidirectional: o.bidirectional === true ? true : undefined,
        });
      }

      // Run d3-force in a synchronous loop. The simulation is decorative —
      // we don't need animation, just stable positions to embed.
      type SimNode = SimulationNodeDatum & { id: string; label: string; kind: NodeKind };
      const simNodes: SimNode[] = nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, x: 0, y: 0 }));
      const simLinks = edges.map((e) => ({ source: e.from, target: e.to }));
      const linkDistance = Number(call.args.linkDistance) || 180;
      type SimLink = { source: string | SimNode; target: string | SimNode };
      const sim = forceSimulation<SimNode>(simNodes)
        .force('link', forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(linkDistance).strength(0.6))
        .force('charge', forceManyBody<SimNode>().strength(-300))
        .force('center', forceCenter(0, 0))
        // Collide radius based on the largest expected node so labels don't overlap.
        .force('collide', forceCollide<SimNode>(90))
        .stop();
      // 300 ticks usually converges; cap is conservative.
      for (let i = 0; i < 300; i++) sim.tick();

      // Normalize the simulation's output into the requested bounding box,
      // with a margin so node bodies don't clip the box edge.
      const margin = 80;
      const xs = simNodes.map((n) => n.x ?? 0);
      const ys = simNodes.map((n) => n.y ?? 0);
      const simMinX = Math.min(...xs), simMaxX = Math.max(...xs);
      const simMinY = Math.min(...ys), simMaxY = Math.max(...ys);
      const simW = Math.max(1, simMaxX - simMinX);
      const simH = Math.max(1, simMaxY - simMinY);
      const targetW = Math.max(1, boxW - margin * 2);
      const targetH = Math.max(1, boxH - margin * 2);
      const scale = Math.min(targetW / simW, targetH / simH);
      // Center the network within the bounding box.
      const offsetX = boxX + margin + (targetW - simW * scale) / 2 - simMinX * scale;
      const offsetY = boxY + margin + (targetH - simH * scale) / 2 - simMinY * scale;

      const ops: CanvasOp[] = [];
      const placedById = new Map<string, string>(); // brain-scoped node id, by network-local id
      for (const n of simNodes) {
        const def = defaultSizeFor(n.kind);
        const w = def.w, h = def.h;
        // d3-force positions are node centers; place_node uses top-left.
        const cx = (n.x ?? 0) * scale + offsetX;
        const cy = (n.y ?? 0) * scale + offsetY;
        const nodeX = cx - w / 2;
        const nodeY = cy - h / 2;
        const svgContent = renderNodeShape(n.kind, { w, h, label: n.label });
        const myId = scopedNodeId(brainId, n.id);
        if (!myId) continue;
        placedById.set(n.id, myId);
        ops.push(createCustomShape({
          x: nodeX, y: nodeY, w, h,
          svgContent,
          label: n.label,
          labelInside: true,
          kind: n.kind,
          owner: brainId,
          id: myId,
        }));
      }
      for (const e of edges) {
        const fromId = placedById.get(e.from);
        const toId = placedById.get(e.to);
        if (!fromId || !toId) continue;
        ops.push(createArrow({
          fromNodeId: fromId,
          toNodeId: toId,
          label: e.label,
          owner: brainId,
          endStart: e.bidirectional ? 'arrow' : undefined,
        }));
      }
      return ops;
    }

    case 'message_brain': {
      const targetBrainId = String(call.args.targetBrainId ?? '').trim();
      const content = String(call.args.content ?? '').trim().slice(0, 600);
      if (!targetBrainId || !content || targetBrainId === brainId) return [];
      // Side-channel op — applyOps's switch ignores 'peer_message' (it has
      // no node side-effect), and the executor extracts and publishes it
      // through the EventBus so the target Brain wakes.
      return [{ op: 'peer_message', fromBrainId: brainId, targetBrainId, content }];
    }

    case 'spawn_brain': {
      const name = String(call.args.name ?? '').slice(0, 60);
      const emoji = String(call.args.emoji ?? '🧠').slice(0, 4);
      const role = String(call.args.role ?? '').slice(0, 600);
      if (!name || !role) return [];
      const zone: Zone = {
        x: Number(call.args.zoneX) || 200,
        y: Number(call.args.zoneY) || 600,
        w: Number(call.args.zoneW) || 500,
        h: Number(call.args.zoneH) || 320,
      };
      const spec = buildPeerSpec({ parentBrainId: brainId, name, emoji, role });
      const cursor: Point = { x: zone.x + zone.w - 40, y: zone.y + 24 };
      const now = Date.now();
      const node: BrainNode = {
        id: spec.id,
        type: 'brain',
        owner: spec.id,
        layer: 50,
        createdAt: now,
        updatedAt: now,
        name: spec.name,
        emoji: spec.emoji,
        color: spec.color,
        cursor,
        zone,
        state: 'idle',
        spec,
        spawnedBy: brainId,
      };
      return [{ op: 'create', node }];
    }

    case 'register_tool': {
      const name = String(call.args.name ?? '').slice(0, 60);
      const emoji = String(call.args.emoji ?? '🧩').slice(0, 4);
      const description = String(call.args.description ?? '').slice(0, 200);
      const svg = String(call.args.svg ?? '');
      if (!name || !svg) return [];
      return [registerTool({
        name, emoji, description,
        svgContent: svg,
        defaultW: Number(call.args.defaultW) || 100,
        defaultH: Number(call.args.defaultH) || 60,
        brainId,
      })];
    }

    case 'create_task': {
      const title = String(call.args.title ?? '').trim().slice(0, 200);
      if (!title) return [];
      const description = String(call.args.description ?? '').trim().slice(0, 1000);
      const requiredCapabilities = parseStringArray(call.args.requiredCapabilities);
      const dependsOn = parseStringArray(call.args.dependsOn);
      const assigneeBrainIdRaw = call.args.assigneeBrainId;
      const assigneeBrainId =
        typeof assigneeBrainIdRaw === 'string' && assigneeBrainIdRaw.trim()
          ? assigneeBrainIdRaw.trim()
          : null;
      const priority = isTaskPriority(call.args.priority) ? call.args.priority : 'normal';
      // Optional id slug — Brains use it to chain dependsOn within one response.
      const explicitId = typeof call.args.id === 'string' && call.args.id.trim()
        ? call.args.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
        : undefined;
      return [createTask({
        title,
        description,
        createdByBrainId: brainId,
        requiredCapabilities,
        assigneeBrainId,
        dependsOn,
        priority,
        id: explicitId ? `task_${brainId}_${explicitId}` : undefined,
      })];
    }

    case 'update_task': {
      const taskIdRaw = String(call.args.taskId ?? '').trim();
      if (!taskIdRaw) return [];
      const patch: Partial<BrainTask> = {};
      if (isTaskStatus(call.args.status)) patch.status = call.args.status;
      if (typeof call.args.assigneeBrainId === 'string') {
        const v = call.args.assigneeBrainId.trim();
        patch.assigneeBrainId = v.length ? v : null;
      }
      if (typeof call.args.blockedReason === 'string') {
        patch.blockedReason = call.args.blockedReason.trim().slice(0, 400) || null;
      }
      const outputs = parseStringArray(call.args.outputNodeIds);
      if (outputs.length > 0) patch.outputNodeIds = outputs;
      if (isTaskPriority(call.args.priority)) patch.priority = call.args.priority;
      if (Object.keys(patch).length === 0) return [];
      return [updateTask(taskIdRaw, patch)];
    }

    default:
      console.warn(`[tools] unknown tool call: ${call.name}`);
      return [];
  }
}

// Loose runtime guards for the task tool args. The LLM occasionally passes
// strings instead of arrays (or vice versa) — these helpers normalise.
function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((s) => s.length > 0);
  }
  if (typeof raw === 'string' && raw.trim()) {
    // Tolerate "a, b, c" when the model forgets array syntax.
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function isTaskStatus(v: unknown): v is BrainTask['status'] {
  return v === 'todo' || v === 'doing' || v === 'blocked' || v === 'done' || v === 'cancelled';
}

function isTaskPriority(v: unknown): v is TaskPriority {
  return v === 'low' || v === 'normal' || v === 'high' || v === 'urgent';
}

export { nodeId };
