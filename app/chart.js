(function () {
  'use strict';
  const modes = [
    ['candle', 'Candle'], ['bar', 'Bar'], ['colored-bar', 'Colored Bar'], ['line', 'Line'],
    ['vertex', 'Vertex Line'], ['step', 'Step'], ['mountain', 'Mountain'], ['baseline', 'Baseline'],
    ['hollow', 'Hollow Candle'], ['volume', 'Volume Candle'], ['hlc', 'Colored HLC Bar'], ['scatter', 'Scatterplot']
  ];

  function groupBars(bars, interval) {
    const duration = interval * 60000;
    const groups = [];
    for (const bar of bars) {
      const time = Math.floor(bar.time / duration) * duration;
      const current = groups.at(-1);
      if (current?.time === time) {
        current.high = Math.max(current.high, bar.high);
        current.low = Math.min(current.low, bar.low);
        current.close = bar.close;
        current.volume += bar.volume;
        current.samples++;
      } else {
        groups.push({ ...bar, time, samples: 1 });
      }
    }
    return groups;
  }

  function series(mode, bars, { x, y, stride, bottom, plot, volumeMax }) {
    const line = (x1, y1, x2, y2, color) =>
      `<line class="${color}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    const dot = (i, bar, radius) => `<circle cx="${x(i)}" cy="${y(bar.close)}" r="${radius}"/>`;
    const path = bars.map((bar, i) => {
      if (!i) return `M${x(i)} ${y(bar.close)}`;
      if (mode === 'step') return `H${x(i)}V${y(bar.close)}`;
      return `L${x(i)} ${y(bar.close)}`;
    }).join('');
    if (mode === 'scatter') return `<g class="price-points">${bars.map((bar, i) => dot(i, bar, 2.6)).join('')}</g>`;
    if (bars.length === 1 && ['line', 'vertex', 'step', 'mountain', 'baseline'].includes(mode)) {
      return `<g class="price-points">${dot(0, bars[0], 2.6)}</g>`;
    }
    if (mode === 'mountain' || mode === 'baseline') {
      const end = x(bars.length - 1), start = x(0);
      if (mode === 'mountain') {
        return `<path class="mountain-fill" d="${path}V${bottom}H${start}Z"/><path class="price-stroke" d="${path}"/>`;
      }
      const base = y(bars[0].close);
      const area = `${path}V${base}H${start}Z`;
      const above = `M0 0H${plot}V${base}H0Z`, below = `M0 ${base}H${plot}V${bottom}H0Z`;
      return `<defs><clipPath id="above-baseline"><path d="${above}"/></clipPath><clipPath id="below-baseline"><path d="${below}"/></clipPath></defs>`
        + `<g clip-path="url(#above-baseline)" class="baseline-up"><path class="baseline-fill" d="${area}"/><path class="baseline-trace" d="${path}"/></g>`
        + `<g clip-path="url(#below-baseline)" class="baseline-down"><path class="baseline-fill" d="${area}"/><path class="baseline-trace" d="${path}"/></g>`
        + line(start, base, end, base, 'baseline-reference');
    }
    if (['line', 'vertex', 'step'].includes(mode)) {
      return `<path class="price-stroke" d="${path}"/>`
        + (mode === 'vertex' ? `<g class="price-points">${bars.map((bar, i) => dot(i, bar, 2.35)).join('')}</g>` : '');
    }
    return bars.map((bar, i) => {
      const cx = x(i), open = y(bar.open), close = y(bar.close);
      const previous = bars[i - 1]?.close ?? bar.open;
      const color = mode === 'bar' ? 'neutral-bar'
        : bar.close >= (mode === 'hollow' || mode === 'hlc' ? previous : bar.open) ? 'gain' : 'loss';
      const wick = line(cx, y(bar.high), cx, y(bar.low), color);
      const half = Math.max(1, Math.min(7, stride * 0.34));
      if (mode === 'bar' || mode === 'colored-bar' || mode === 'hlc') {
        return wick + (mode !== 'hlc' ? line(cx - half, open, cx, open, color) : '')
          + line(cx, close, cx + half, close, color);
      }
      const width = Math.max(1, stride * (mode === 'volume' ? 0.22 + 0.65 * bar.volume / volumeMax : 0.65));
      return wick + `<rect class="${color}${mode === 'hollow' && bar.close >= bar.open ? ' hollow-body' : ''}" x="${cx - width / 2}" y="${Math.min(open, close)}" width="${width}" height="${Math.max(1, Math.abs(open - close))}"/>`;
    }).join('');
  }

  const api = { modes, groupBars, series };
  if (typeof module !== 'undefined') module.exports = api;
  else window.InvestChart = api;
})();
