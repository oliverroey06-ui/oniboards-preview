/* ============================================================
   OniSteel Studios Board — SVG Chart Engine
   Crisp, dependency-free charts: donut, bars, line/area,
   sparkline, burndown, progress ring, heatmap.
   All return SVG markup strings; theme-aware via currentColor.
   ============================================================ */
import { escapeHtml } from "./ui.js";

const PALETTE = ["#4D6B91", "#C12A2A", "#8A6BD1", "#3FB98A", "#E6A23C", "#4D8F91", "#D16B9E", "#6B8BD1", "#B06B6B", "#8AB06B"];
export function chartColor(i) { return PALETTE[i % PALETTE.length]; }

/* ---------- Donut / Pie ---------- */
export function donut(segments, { size = 160, thickness = 22, gap = 2, centerTop = "", centerSub = "" } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((seg) => {
    const frac = seg.value / total;
    const len = frac * circ;
    const dash = `${Math.max(0, len - gap)} ${circ - Math.max(0, len - gap)}`;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${thickness}" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"><title>${escapeHtml(seg.label)}: ${seg.value}</title></circle>`;
    offset += len;
    return el;
  }).join("");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="chart-donut">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="${thickness}"/>
    ${arcs}
    ${centerTop ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-top">${escapeHtml(centerTop)}</text>` : ""}
    ${centerSub ? `<text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-sub">${escapeHtml(centerSub)}</text>` : ""}
  </svg>`;
}

/* ---------- Vertical bars ---------- */
export function bars(data, { width = 320, height = 140, color = "#4D6B91", labels = true, gradient = true } = {}) {
  const max = Math.max(1, ...data.map(d => d.value));
  const n = data.length;
  const pad = 24, gap = 8;
  const bw = (width - pad) / n - gap;
  const gid = "bg" + Math.random().toString(36).slice(2, 7);
  const barsSvg = data.map((d, i) => {
    const h = (d.value / max) * (height - 34);
    const x = pad / 2 + i * (bw + gap);
    const y = height - 22 - h;
    return `<g>
      <rect x="${x}" y="${y}" width="${bw}" height="${Math.max(1, h)}" rx="4" fill="url(#${gid})"><title>${escapeHtml(d.label)}: ${d.value}</title></rect>
      ${labels ? `<text x="${x + bw / 2}" y="${height - 7}" text-anchor="middle" class="chart-axis">${escapeHtml(d.short || d.label)}</text>` : ""}
      ${d.value ? `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" class="chart-val">${d.value}</text>` : ""}
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet" class="chart-bars">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}66"/></linearGradient></defs>
    ${barsSvg}
  </svg>`;
}

/* ---------- Line / Area ---------- */
export function line(series, { width = 340, height = 150, color = "#8FAFD6", area = true, labels = [], showDots = false } = {}) {
  const max = Math.max(1, ...series);
  const min = Math.min(0, ...series);
  const n = series.length;
  const pad = 8;
  const stepX = (width - pad * 2) / Math.max(1, n - 1);
  const scaleY = (v) => height - 24 - ((v - min) / (max - min || 1)) * (height - 40);
  const pts = series.map((v, i) => [pad + i * stepX, scaleY(v)]);
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const areaPath = `${path} L ${pts[n - 1][0]} ${height - 22} L ${pts[0][0]} ${height - 22} Z`;
  const gid = "lg" + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" class="chart-line">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}55"/><stop offset="1" stop-color="${color}00"/></linearGradient></defs>
    ${[0.25,0.5,0.75].map(f=>`<line x1="${pad}" x2="${width-pad}" y1="${24+f*(height-46)}" y2="${24+f*(height-46)}" stroke="rgba(255,255,255,.05)"/>`).join("")}
    ${area ? `<path d="${areaPath}" fill="url(#${gid})"/>` : ""}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${showDots ? pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${color}"/>`).join("") : ""}
    ${labels.length ? pts.map((p, i) => labels[i] ? `<text x="${p[0]}" y="${height - 6}" text-anchor="middle" class="chart-axis">${escapeHtml(labels[i])}</text>` : "").join("") : ""}
  </svg>`;
}

/* ---------- Multi-line (burndown: ideal vs actual) ---------- */
export function burndown(actual, ideal, { width = 480, height = 200, labels = [] } = {}) {
  const all = [...actual, ...ideal];
  const max = Math.max(1, ...all);
  const n = Math.max(actual.length, ideal.length);
  const pad = 30;
  const stepX = (width - pad - 10) / Math.max(1, n - 1);
  const scaleY = (v) => height - 26 - (v / max) * (height - 44);
  const mkPath = (arr) => arr.map((v, i) => (i === 0 ? "M" : "L") + (pad + i * stepX).toFixed(1) + " " + scaleY(v).toFixed(1)).join(" ");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet" class="chart-burndown">
    ${[0,0.25,0.5,0.75,1].map(f=>`<line x1="${pad}" x2="${width-10}" y1="${26+f*(height-52)}" y2="${26+f*(height-52)}" stroke="rgba(255,255,255,.05)"/><text x="${pad-6}" y="${30+f*(height-52)}" text-anchor="end" class="chart-axis">${Math.round(max*(1-f))}</text>`).join("")}
    <path d="${mkPath(ideal)}" fill="none" stroke="#6B7280" stroke-width="2" stroke-dasharray="5 5"/>
    <path d="${mkPath(actual)}" fill="none" stroke="#4D6B91" stroke-width="2.5" stroke-linejoin="round"/>
    ${actual.map((v, i) => `<circle cx="${pad + i * stepX}" cy="${scaleY(v)}" r="3" fill="#8FAFD6"/>`).join("")}
    ${labels.map((l, i) => l ? `<text x="${pad + i * stepX}" y="${height - 6}" text-anchor="middle" class="chart-axis">${escapeHtml(l)}</text>` : "").join("")}
  </svg>`;
}

/* ---------- Sparkline ---------- */
export function sparkline(values, { width = 100, height = 30, color = "#8FAFD6" } = {}) {
  if (!values.length) values = [0, 0];
  const max = Math.max(1, ...values), min = Math.min(...values);
  const stepX = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * stepX, height - 3 - ((v - min) / (max - min || 1)) * (height - 6)]);
  const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="sparkline"><path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ---------- Horizontal progress bars (leaderboard) ---------- */
export function hbars(data, { color } = {}) {
  const max = Math.max(1, ...data.map(d => d.value));
  return `<div class="hbars">${data.map((d, i) => `
    <div class="hbar-row">
      <div class="hbar-label truncate">${d.avatar || ""}<span>${escapeHtml(d.label)}</span></div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${(d.value / max) * 100}%;background:${d.color || color || chartColor(i)}"></div></div>
      <div class="hbar-val">${escapeHtml(String(d.display ?? d.value))}</div>
    </div>`).join("")}</div>`;
}

/* ---------- Activity heatmap (last N weeks) ---------- */
export function heatmap(counts, { weeks = 12 } = {}) {
  // counts: map of ymd -> number
  const cells = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(today); start.setDate(start.getDate() - weeks * 7 + 1);
  start.setDate(start.getDate() - start.getDay());
  const max = Math.max(1, ...Object.values(counts));
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
      const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
      const v = counts[key] || 0;
      const lvl = v === 0 ? 0 : Math.ceil((v / max) * 4);
      col.push(`<div class="hm-cell lvl-${lvl}" title="${key}: ${v}"></div>`);
    }
    cells.push(`<div class="hm-col">${col.join("")}</div>`);
  }
  return `<div class="heatmap">${cells.join("")}</div>`;
}

/* ---------- Gauge / progress ring (returns SVG) ---------- */
export function gauge(pct, { size = 120, color = "#4D6B91", label = "" } = {}) {
  const r = size / 2 - 10, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  const off = circ * (1 - pct / 100);
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="chart-gauge">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="9"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="gauge-val">${Math.round(pct)}%</text>
    ${label ? `<text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-sub">${escapeHtml(label)}</text>` : ""}
  </svg>`;
}

export function legend(items) {
  return `<div class="chart-legend">${items.map(i => `<span class="cl-item"><span class="cl-dot" style="background:${i.color}"></span>${escapeHtml(i.label)}${i.value != null ? ` <b>${i.value}</b>` : ""}</span>`).join("")}</div>`;
}
