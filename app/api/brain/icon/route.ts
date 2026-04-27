// Icon proxy — resolves an Iconify ID (e.g. "lucide:database") to raw SVG.
// Iconify's public API covers 100+ icon sets, BUT quality varies hugely.
// Brains were producing visual mush by reaching for low-quality sets, so we
// gate on a curated allowlist of consistently-good sets here. Anything
// outside the allowlist gets rejected with a 400 — caller is expected to
// fall back to place_node primitives.

import { NextRequest, NextResponse } from 'next/server';

const ICONIFY_BASE = 'https://api.iconify.design';

// Curated icon-set allowlist. Each set has been vetted for stroke-weight
// consistency, proportion sanity, and breadth of coverage. Adding a set
// requires sampling a few dozen icons and confirming they hold up at the
// 24-32px scale Brains typically render at.
const ALLOWED_ICON_PREFIXES: ReadonlySet<string> = new Set([
  'tabler',          // 4000+ outline icons, very consistent stroke
  'lucide',          // Feather successor, clean and ubiquitous
  'phosphor',        // multiple weights, modern proportions
  'heroicons',       // Tailwind's set, paired outline + solid
  'mdi',             // Material Design Icons — broad coverage
  'simple-icons',    // brand marks ONLY (Postgres, Kafka, etc.) — not for generic shapes
  'carbon',          // IBM's set, clear at small sizes
  'material-symbols', // Google's modern set with variable weights
]);

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id || !/^[a-z0-9-]+:[a-z0-9_-]+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid or missing id (format: "prefix:name")' }, { status: 400 });
  }

  const [prefix, name] = id.split(':');

  if (!ALLOWED_ICON_PREFIXES.has(prefix)) {
    return NextResponse.json({
      error: `icon set "${prefix}" is not in the curated allowlist. Allowed: ${Array.from(ALLOWED_ICON_PREFIXES).join(', ')}. Prefer place_node for generic shapes (service, database, queue, cache, api, decision, note).`,
      allowedPrefixes: Array.from(ALLOWED_ICON_PREFIXES),
    }, { status: 400 });
  }

  const url = `${ICONIFY_BASE}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;

  try {
    const upstream = await fetch(url, { headers: { 'User-Agent': 'justdoit-brains' } });
    if (!upstream.ok) {
      return NextResponse.json({ error: `icon not found (${upstream.status})` }, { status: 404 });
    }
    const svgText = await upstream.text();

    // Strip the outer <svg ...> wrapper so callers can embed the inner
    // contents inside their own <svg viewBox>. Keep a fallback for callers
    // that want the full element.
    const innerMatch = svgText.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    const inner = innerMatch ? innerMatch[1].trim() : svgText;

    return NextResponse.json({ id, svg: inner, full: svgText }, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: `iconify fetch failed: ${msg}` }, { status: 502 });
  }
}
