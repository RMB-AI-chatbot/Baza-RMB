/* Tiny SVG charts for the admin portal (no external libraries, works offline). */
window.Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n)));

  function niceMax(v) {
    if (v <= 5) return 5;
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }

  /**
   * Area/line chart.
   * series: [{name, color, values:[...], dashed?, fill?}], labels: [...] (same length as values)
   */
  function area(el, labels, series, opts = {}) {
    const W = el.clientWidth || 700, H = opts.height || 280, L = 44, R = 12, T = 14, B = 34;
    const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
    const n = Math.max(labels.length, 1);
    const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
    const y = (v) => T + (H - T - B) * (1 - v / max);
    let s = `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${opts.label || "chart"}">`;
    s += `<defs>${series.map((se, k) => `<linearGradient id="g${k}${el.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${se.color}" stop-opacity=".28"/><stop offset="1" stop-color="${se.color}" stop-opacity="0"/></linearGradient>`).join("")}</defs>`;
    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4, yy = y(v);
      s += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#f1f4f8"/>`;
      s += `<text x="${L - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#707880" font-family="Liberation Mono,ui-monospace,Consolas,monospace">${fmt(v)}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 7));
    labels.forEach((lb, i) => {
      if (i % step === 0 || i === n - 1) {
        s += `<text x="${x(i)}" y="${H - 10}" text-anchor="${i === n - 1 && n > 1 ? "end" : i === 0 && n > 1 ? "start" : "middle"}" font-size="11" fill="#707880" font-family="Liberation Mono,ui-monospace,Consolas,monospace">${lb}</text>`;
      }
    });
    series.forEach((se, k) => {
      const pts = se.values.map((v, i) => [x(i), y(v)]);
      if (!pts.length) return;
      // smooth curve (Catmull-Rom -> cubic Bezier), like the Figma charts
      let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, t = 0.18;
        const c1 = [p1[0] + (p2[0] - p0[0]) * t, Math.min(y(0), p1[1] + (p2[1] - p0[1]) * t)];
        const c2 = [p2[0] - (p3[0] - p1[0]) * t, Math.min(y(0), p2[1] - (p3[1] - p1[1]) * t)];
        line += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      if (se.fill !== false) {
        s += `<path class="area" d="${line}L${pts[pts.length - 1][0]},${y(0)}L${pts[0][0]},${y(0)}Z" fill="url(#g${k}${el.id})"/>`;
      }
      s += `<path class="${se.dashed ? "" : "draw"}" d="${line}" fill="none" stroke="${se.color}" stroke-width="2.5" ${se.dashed ? 'stroke-dasharray="5 5"' : ""} stroke-linejoin="round" stroke-linecap="round"/>`;
      if (pts.length <= 31) {
        pts.forEach((p, i) => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#fff" stroke="${se.color}" stroke-width="2" opacity="0" style="animation:fadeIn .3s ${0.6 + i * 0.03}s forwards"><title>${labels[i]}: ${se.values[i]} ${se.name}</title></circle>`; });
      }
    });
    el.innerHTML = s + "</svg>";
  }

  /** Donut chart. items: [{label, value, color}] */
  function donut(el, items, centerValue, centerLabel) {
    const size = 200, r = 72, c = 2 * Math.PI * r, total = items.reduce((a, b) => a + b.value, 0) || 1;
    let off = 0, s = `<svg xmlns="${NS}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${centerLabel}">`;
    s += `<circle cx="100" cy="100" r="${r}" fill="none" stroke="#f1f4f8" stroke-width="24"/>`;
    items.forEach((it) => {
      const len = (it.value / total) * c;
      s += `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${it.color}" stroke-width="24" stroke-dasharray="${Math.max(len - 2, 0)} ${c}"
        stroke-dashoffset="${-off}" transform="rotate(-90 100 100)"><title>${it.label}: ${it.value}</title></circle>`;
      off += len;
    });
    s += `<text x="100" y="98" text-anchor="middle" font-size="26" font-weight="700" fill="#181c1f" font-family="Inter,sans-serif">${centerValue}</text>
          <text x="100" y="120" text-anchor="middle" font-size="11" font-weight="600" fill="#535d65" letter-spacing="1" font-family="Inter,sans-serif">${centerLabel}</text></svg>`;
    el.innerHTML = s;
  }

  return {area, donut, fmt};
})();
