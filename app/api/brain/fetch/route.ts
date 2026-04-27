// Web fetch proxy for Brains. Resolves an arbitrary URL and returns the text
// content, truncated so it fits in a Brain's next LLM context. v1 is simple
// and permissive — allowlist + HTML→markdown conversion can come later.

import { NextRequest, NextResponse } from 'next/server';

const MAX_CHARS = 10_000;
const TIMEOUT_MS = 10_000;

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url');
  if (!urlParam) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    return NextResponse.json({ error: 'only http(s) urls allowed' }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'justdoit-brains' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
    }
    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();
    const truncated = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '\n[...truncated]' : text;
    return NextResponse.json({
      url: target.toString(),
      contentType,
      length: text.length,
      text: truncated,
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: `fetch failed: ${msg}` }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
