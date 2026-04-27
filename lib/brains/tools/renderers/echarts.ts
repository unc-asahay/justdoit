// Render an Apache ECharts option object to inline SVG so a Brain can drop a
// chart (bar, line, pie, sankey, etc.) onto the canvas as a customShape node.
// ECharts' SVG renderer needs a real DOM element to mount into, so we use a
// throwaway off-screen <div>, init the chart, snapshot the SVG, then dispose.

import type { EChartsType } from 'echarts/core';

let _echartsPromise: Promise<typeof import('echarts')> | null = null;

async function loadECharts() {
  if (!_echartsPromise) _echartsPromise = import('echarts');
  return _echartsPromise;
}

export interface ChartRenderResult {
  svgInner: string;
  width: number;
  height: number;
}

export async function renderChart(
  option: Record<string, unknown>,
  desiredWidth: number = 480,
  desiredHeight: number = 320,
): Promise<ChartRenderResult> {
  if (typeof window === 'undefined') {
    throw new Error('renderChart requires a browser environment');
  }
  const echarts = await loadECharts();

  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = `${desiredWidth}px`;
  host.style.height = `${desiredHeight}px`;
  document.body.appendChild(host);

  let chart: EChartsType | null = null;
  try {
    chart = echarts.init(host, undefined, { renderer: 'svg', width: desiredWidth, height: desiredHeight });
    chart.setOption(option);

    // ECharts SVG output lives in host.innerHTML — a single <svg> wrapper.
    const svgEl = host.querySelector('svg');
    if (!svgEl) throw new Error('echarts did not produce an SVG');

    let width = parseFloat(svgEl.getAttribute('width') || '0') || desiredWidth;
    let height = parseFloat(svgEl.getAttribute('height') || '0') || desiredHeight;
    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4) {
        width = parts[2];
        height = parts[3];
      }
    }

    return { svgInner: svgEl.innerHTML, width, height };
  } finally {
    if (chart) chart.dispose();
    host.remove();
  }
}
