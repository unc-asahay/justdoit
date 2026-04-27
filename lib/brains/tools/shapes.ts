// Diagram shape primitives — the visual vocabulary used by place_node.
//
// Each generator returns SVG inner markup designed to render inside a
// customShape's outer <g translate(x, y)>. Coordinates live in the local
// 0..w × 0..h space so the shape resizes cleanly.
//
// Style is deliberately flat and consistent (tech-doc / Excalidraw / Lucid
// vibes, not illustration-style clipart). All shapes share the same stroke
// weight, font, and label treatment so a canvas full of them reads as one
// diagram instead of a stock-icon collage.

export type NodeKind =
  // Domain primitives (semantic — Brain prefers these for architecture work)
  | 'service' | 'database' | 'cache' | 'queue' | 'api' | 'external' | 'actor' | 'file' | 'decision' | 'note'
  // Basic shapes (user-facing toolbar — also available to Brain)
  | 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'triangle' | 'diamond' | 'hexagon' | 'star' | 'parallelogram'
  // Flowchart shapes
  | 'process' | 'terminator' | 'document' | 'data' | 'manual-input'
  // Sticky note (FigJam staple)
  | 'sticky';

interface ShapeArgs {
  w: number;
  h: number;
  label?: string;
  fill?: string;
  stroke?: string;
}

const C = {
  stroke: '#1e293b',     // slate-800
  strokeMuted: '#64748b',// slate-500
  fill: '#ffffff',
  fillMuted: '#f8fafc',  // slate-50
  fillNote: '#fef9c3',   // yellow-100
  fillExt: '#eff6ff',    // blue-50
  text: '#0f172a',       // slate-900
  textMuted: '#475569',  // slate-600
};

const STROKE_W = 1.6;
const RADIUS = 8;
const FONT = `font-size="13" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto" fill="${C.text}"`;

function escapeXml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
}

// Centred multi-line label. Splits long strings on ~16-char boundaries so
// medium-length names wrap instead of overflowing.
function centerLabel(w: number, h: number, label: string, kindHint?: string): string {
  const safe = escapeXml(label);
  const lines = wrapLabel(safe, 18);
  const lineH = 16;
  const totalH = lines.length * lineH;
  const startY = h / 2 - totalH / 2 + lineH * 0.75;
  const tspans = lines.map((line, i) =>
    `<tspan x="${w / 2}" dy="${i === 0 ? 0 : lineH}">${line}</tspan>`,
  ).join('');
  const hint = kindHint
    ? `<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="${C.textMuted}" font-family="ui-sans-serif, system-ui">${kindHint}</text>`
    : '';
  return `<text x="${w / 2}" y="${startY}" text-anchor="middle" ${FONT} font-weight="500">${tspans}</text>${hint}`;
}

function wrapLabel(label: string, maxChars: number): string[] {
  if (label.length <= maxChars) return [label];
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3); // max 3 lines
}

// ─── Individual shape generators ────────────────────────────────────────

function service({ w, h, label, fill, stroke }: ShapeArgs): string {
  return [
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${RADIUS}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label) : '',
  ].join('');
}

function database({ w, h, label, fill, stroke }: ShapeArgs): string {
  const ry = Math.max(8, Math.min(16, h * 0.12));
  const f = fill ?? C.fillMuted;
  const s = stroke ?? C.stroke;
  return [
    // body
    `<path d="M 0 ${ry} L 0 ${h - ry} A ${w / 2} ${ry} 0 0 0 ${w} ${h - ry} L ${w} ${ry}" fill="${f}" stroke="${s}" stroke-width="${STROKE_W}"/>`,
    // top ellipse
    `<ellipse cx="${w / 2}" cy="${ry}" rx="${w / 2}" ry="${ry}" fill="${f}" stroke="${s}" stroke-width="${STROKE_W}"/>`,
    // back curve hint
    `<path d="M 0 ${ry} A ${w / 2} ${ry} 0 0 0 ${w} ${ry}" fill="none" stroke="${s}" stroke-width="${STROKE_W}" opacity="0.4"/>`,
    label ? centerLabel(w, h, label, 'database') : '',
  ].join('');
}

function cache({ w, h, label, fill, stroke }: ShapeArgs): string {
  const f = fill ?? C.fillMuted;
  const s = stroke ?? C.stroke;
  // Lightning glyph in the top-right corner
  const lx = w - 18;
  return [
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${RADIUS}" fill="${f}" stroke="${s}" stroke-width="${STROKE_W}"/>`,
    `<path d="M ${lx} 6 L ${lx + 4} 14 L ${lx + 1} 14 L ${lx + 5} 22 L ${lx - 1} 14 L ${lx + 2} 14 Z" fill="${C.textMuted}"/>`,
    label ? centerLabel(w, h, label, 'cache') : '',
  ].join('');
}

function queue({ w, h, label, fill, stroke }: ShapeArgs): string {
  const f = fill ?? C.fill;
  const s = stroke ?? C.stroke;
  return [
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${RADIUS}" fill="${f}" stroke="${s}" stroke-width="${STROKE_W}"/>`,
    // three queue dividers
    `<line x1="${w * 0.2}" y1="8" x2="${w * 0.2}" y2="${h - 8}" stroke="${s}" stroke-width="${STROKE_W * 0.7}" opacity="0.5"/>`,
    `<line x1="${w * 0.4}" y1="8" x2="${w * 0.4}" y2="${h - 8}" stroke="${s}" stroke-width="${STROKE_W * 0.7}" opacity="0.5"/>`,
    `<line x1="${w * 0.6}" y1="8" x2="${w * 0.6}" y2="${h - 8}" stroke="${s}" stroke-width="${STROKE_W * 0.7}" opacity="0.5"/>`,
    label ? centerLabel(w, h, label, 'queue') : '',
  ].join('');
}

function api({ w, h, label, fill, stroke }: ShapeArgs): string {
  const inset = h * 0.32;
  const points = [
    `${inset},0`,
    `${w - inset},0`,
    `${w},${h / 2}`,
    `${w - inset},${h}`,
    `${inset},${h}`,
    `0,${h / 2}`,
  ].join(' ');
  return [
    `<polygon points="${points}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label, 'api') : '',
  ].join('');
}

function externalShape({ w, h, label, fill, stroke }: ShapeArgs): string {
  const f = fill ?? C.fillExt;
  const s = stroke ?? C.stroke;
  // Cloud path scaled to (w, h)
  // Build it as relative arcs based on the box.
  const cy = h * 0.55;
  const path = `
    M ${w * 0.15} ${cy}
    A ${w * 0.18} ${h * 0.32} 0 0 1 ${w * 0.35} ${h * 0.18}
    A ${w * 0.18} ${h * 0.28} 0 0 1 ${w * 0.65} ${h * 0.18}
    A ${w * 0.18} ${h * 0.32} 0 0 1 ${w * 0.85} ${cy}
    A ${w * 0.15} ${h * 0.3} 0 0 1 ${w * 0.7} ${h - 4}
    L ${w * 0.3} ${h - 4}
    A ${w * 0.15} ${h * 0.3} 0 0 1 ${w * 0.15} ${cy}
    Z
  `;
  return [
    `<path d="${path}" fill="${f}" stroke="${s}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label, 'external') : '',
  ].join('');
}

function actor({ w, h, label, fill, stroke }: ShapeArgs): string {
  const f = fill ?? C.fill;
  const s = stroke ?? C.stroke;
  const cx = w / 2;
  const headR = Math.min(h * 0.18, 14);
  const headCy = headR + 4;
  const shoulderTop = headCy + headR + 2;
  return [
    `<circle cx="${cx}" cy="${headCy}" r="${headR}" fill="${f}" stroke="${s}" stroke-width="${STROKE_W}"/>`,
    `<path d="M ${cx - w * 0.32} ${h - 8} Q ${cx - w * 0.32} ${shoulderTop} ${cx} ${shoulderTop} Q ${cx + w * 0.32} ${shoulderTop} ${cx + w * 0.32} ${h - 8}" fill="${f}" stroke="${s}" stroke-width="${STROKE_W}"/>`,
    label ? `<text x="${w / 2}" y="${h + 14}" text-anchor="middle" ${FONT} font-weight="500">${escapeXml(label)}</text>` : '',
  ].join('');
}

function file({ w, h, label, fill, stroke }: ShapeArgs): string {
  const f = fill ?? C.fill;
  const s = stroke ?? C.stroke;
  const fold = 14;
  return [
    `<path d="M 0 0 L ${w - fold} 0 L ${w} ${fold} L ${w} ${h} L 0 ${h} Z" fill="${f}" stroke="${s}" stroke-width="${STROKE_W}"/>`,
    `<path d="M ${w - fold} 0 L ${w - fold} ${fold} L ${w} ${fold}" fill="none" stroke="${s}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label, 'file') : '',
  ].join('');
}

function decision({ w, h, label, fill, stroke }: ShapeArgs): string {
  const points = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
  return [
    `<polygon points="${points}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label) : '',
  ].join('');
}

function note({ w, h, label, fill, stroke }: ShapeArgs): string {
  const f = fill ?? C.fillNote;
  const s = stroke ?? '#ca8a04';
  return [
    `<rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="${f}" stroke="${s}" stroke-width="${STROKE_W * 0.7}"/>`,
    label ? centerLabel(w, h, label) : '',
  ].join('');
}

// ─── Basic shape generators (user-facing) ───────────────────────────────

function rectangle({ w, h, label, fill, stroke }: ShapeArgs): string {
  return [
    `<rect x="0" y="0" width="${w}" height="${h}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label) : '',
  ].join('');
}

function ellipse({ w, h, label, fill, stroke }: ShapeArgs): string {
  return [
    `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 1}" ry="${h / 2 - 1}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label) : '',
  ].join('');
}

function triangle({ w, h, label, fill, stroke }: ShapeArgs): string {
  return [
    `<polygon points="${w / 2},2 ${w - 2},${h - 2} 2,${h - 2}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h * 0.65, label) : '',
  ].join('');
}

function star({ w, h, label, fill, stroke }: ShapeArgs): string {
  const cx = w / 2, cy = h / 2;
  const ro = Math.min(w, h) / 2 - 2;
  const ri = ro * 0.45;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return [
    `<polygon points="${pts.join(' ')}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label) : '',
  ].join('');
}

function parallelogram({ w, h, label, fill, stroke }: ShapeArgs): string {
  const skew = h * 0.3;
  return [
    `<polygon points="${skew},0 ${w},0 ${w - skew},${h} 0,${h}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label) : '',
  ].join('');
}

function terminator({ w, h, label, fill, stroke }: ShapeArgs): string {
  // Pill — rounded rect with full-height radius on each side.
  const r = h / 2;
  return [
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label) : '',
  ].join('');
}

function documentShape({ w, h, label, fill, stroke }: ShapeArgs): string {
  // Rect with wavy bottom — classic flowchart "document".
  const wave = h * 0.18;
  const path = `M 0 0 L ${w} 0 L ${w} ${h - wave} Q ${w * 0.75} ${h - wave * 1.6} ${w * 0.5} ${h - wave * 0.6} Q ${w * 0.25} ${h} 0 ${h - wave * 0.6} Z`;
  return [
    `<path d="${path}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h * 0.85, label) : '',
  ].join('');
}

function manualInput({ w, h, label, fill, stroke }: ShapeArgs): string {
  // Top edge slopes down from left — "card with bent corner".
  const slope = h * 0.25;
  return [
    `<polygon points="0,${slope} ${w},0 ${w},${h} 0,${h}" fill="${fill ?? C.fill}" stroke="${stroke ?? C.stroke}" stroke-width="${STROKE_W}"/>`,
    label ? centerLabel(w, h, label) : '',
  ].join('');
}

// ─── Public API ──────────────────────────────────────────────────────────

export const NODE_KINDS: NodeKind[] = [
  'service', 'database', 'cache', 'queue', 'api',
  'external', 'actor', 'file', 'decision', 'note',
  'rectangle', 'rounded-rectangle', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star', 'parallelogram',
  'process', 'terminator', 'document', 'data', 'manual-input',
  'sticky',
];

export function defaultSizeFor(kind: NodeKind): { w: number; h: number } {
  switch (kind) {
    case 'database': return { w: 130, h: 90 };
    case 'actor':    return { w: 90, h: 90 };
    case 'decision':
    case 'diamond':  return { w: 130, h: 100 };
    case 'note':
    case 'sticky':   return { w: 160, h: 120 };
    case 'api':
    case 'hexagon':  return { w: 150, h: 80 };
    case 'external': return { w: 160, h: 90 };
    case 'ellipse':  return { w: 140, h: 90 };
    case 'triangle': return { w: 120, h: 110 };
    case 'star':     return { w: 110, h: 110 };
    case 'terminator': return { w: 160, h: 60 };
    case 'document': return { w: 160, h: 100 };
    case 'parallelogram':
    case 'data':     return { w: 160, h: 80 };
    case 'manual-input': return { w: 160, h: 80 };
    default:         return { w: 160, h: 80 };
  }
}

export function renderNodeShape(kind: NodeKind, args: ShapeArgs): string {
  switch (kind) {
    // Domain primitives
    case 'service':  return service(args);
    case 'database': return database(args);
    case 'cache':    return cache(args);
    case 'queue':    return queue(args);
    case 'api':      return api(args);
    case 'external': return externalShape(args);
    case 'actor':    return actor(args);
    case 'file':     return file(args);
    case 'decision': return decision(args);
    case 'note':     return note(args);
    // Basic shapes
    case 'rectangle':         return rectangle(args);
    case 'rounded-rectangle': return service(args); // same renderer
    case 'ellipse':           return ellipse(args);
    case 'triangle':          return triangle(args);
    case 'diamond':           return decision(args); // same shape
    case 'hexagon':           return api(args);      // same shape
    case 'star':              return star(args);
    case 'parallelogram':     return parallelogram(args);
    // Flowchart
    case 'process':           return service(args);  // rounded rect like "service"
    case 'terminator':        return terminator(args);
    case 'document':          return documentShape(args);
    case 'data':              return parallelogram(args);
    case 'manual-input':      return manualInput(args);
    // Sticky
    case 'sticky':            return note(args);
  }
}

export function isNodeKind(s: unknown): s is NodeKind {
  return typeof s === 'string' && (NODE_KINDS as string[]).includes(s);
}
