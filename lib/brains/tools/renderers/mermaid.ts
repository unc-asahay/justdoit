// Render mermaid markup to inline SVG inner markup so a Brain can drop it on
// the canvas as a customShape node. Mermaid is lazy-imported so the ~700KB
// bundle only loads when a Brain actually wants a flowchart/sequence/etc.

let _mermaidPromise: Promise<typeof import('mermaid')> | null = null;
let _initialized = false;

async function loadMermaid() {
  if (!_mermaidPromise) {
    _mermaidPromise = import('mermaid');
  }
  const mod = await _mermaidPromise;
  const mermaid = mod.default;
  if (!_initialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'default',
      // Smaller default fonts so it reads at canvas zoom.
      themeVariables: { fontSize: '13px' },
    });
    _initialized = true;
  }
  return mermaid;
}

export interface MermaidRenderResult {
  svgInner: string;   // markup to drop inside an outer <svg viewBox>
  width: number;      // intrinsic width pulled from the rendered SVG
  height: number;     // intrinsic height pulled from the rendered SVG
}

// Pulls width/height (or viewBox) out of a mermaid-rendered <svg ...>...</svg>
// and returns the inner markup with the outer wrapper stripped, so it slots
// into our customShape pipeline (which expects inner markup, not a full SVG).
export async function renderMermaid(code: string): Promise<MermaidRenderResult> {
  if (typeof window === 'undefined') {
    throw new Error('renderMermaid requires a browser environment');
  }
  const mermaid = await loadMermaid();

  const id = `mermaid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const { svg } = await mermaid.render(id, code.trim());

  // Parse to read intrinsic dimensions, then return the inner markup.
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const svgEl = doc.documentElement;

  let width = parseFloat(svgEl.getAttribute('width') || '0');
  let height = parseFloat(svgEl.getAttribute('height') || '0');
  const viewBox = svgEl.getAttribute('viewBox');
  if ((!width || !height) && viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4) {
      width = parts[2];
      height = parts[3];
    }
  }
  if (!width) width = 400;
  if (!height) height = 300;

  // Strip the outer <svg> tag, keep its children. We re-introduce the
  // viewBox via a wrapper inside customShape's renderer.
  // BrainsCanvasLayer renders customShape contents via `dangerouslySetInnerHTML`
  // inside a <g> at (x, y) with no scaling for non-icon shapes — coords below
  // need to live in 0..width / 0..height space, which mermaid already does.
  const inner = svgEl.innerHTML;

  return { svgInner: inner, width, height };
}
