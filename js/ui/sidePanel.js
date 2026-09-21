// © 2026 김용현
// ui/sidePanel.js — 자막, KaTeX 수식, 간격 함수 그래프, 로빈슨 표, 빈켈 blend 패널 (PLAN 8.6)
import katex from 'katex';
import { PROJECTIONS, FAMILY_LABELS, PROPERTY_LABELS } from '../projections/registry.js';
import { ROBINSON_TABLE } from '../projections/robinsonTable.js';
import { winkelEquirectComponent, stepProjection, endOfStep } from '../projections/derivations.js';
import { aitoff } from '../projections/adjusted.js';
import { getState, subscribe, frame, caption, entry, rootEntry, derivation, STAGE_LABELS } from '../state.js';

const D = Math.PI / 180;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderTex(container, tex) {
  container.innerHTML = '';
  if (!tex) { container.style.display = 'none'; return; }
  container.style.display = '';
  try { katex.render(tex, container, { throwOnError: false, displayMode: true }); }
  catch (e) { container.textContent = tex; }
}

// ---------------------------------------------------------------------------
// spacingGraph: 가로 φ(또는 c), 세로 y(φ)(또는 r(c)). 출발·목표·현재 곡선.
// ---------------------------------------------------------------------------
function drawSpacingGraph(canvas, fr, s) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const d = derivation();
  const k = fr.stepInfo ? fr.stepInfo.index : 0;
  const start = endOfStep(d, k - 1, s.params);
  const end = endOfStep(d, k, s.params);
  const cur = fr;
  const azimuthal = fr.root.surface && fr.root.surface.type === 'plane';
  // 표본
  const xs = [];
  let xLabel, yLabel;
  if (azimuthal) { xLabel = 'c (접점 각거리)'; yLabel = 'r(c)'; for (let c = 0; c <= 180; c += 2) xs.push(c); }
  else { xLabel = 'φ'; yLabel = 'y(φ)'; for (let p = -90; p <= 90; p += 2) xs.push(p); }
  const evalY = (f, x) => {
    const q = azimuthal ? f(x * D, 0) : f(0, x * D);
    const v = azimuthal ? Math.hypot(q[0], q[1]) : q[1];
    return Number.isFinite(v) ? v : NaN;
  };
  const curves = [
    { f: start.f, color: 'rgba(169,182,204,0.7)', width: 1.5, label: '출발' },
    { f: end.f, color: 'rgba(126,224,168,0.9)', width: 1.5, label: '목표' },
    { f: cur.f, color: '#ffd166', width: 2.5, label: '현재' },
  ];
  let ymin = Infinity, ymax = -Infinity;
  for (const c of curves) for (const x of xs) { const v = evalY(c.f, x); if (Number.isFinite(v)) { ymin = Math.min(ymin, v); ymax = Math.max(ymax, v); } }
  if (!Number.isFinite(ymin)) return;
  const clampMax = azimuthal ? 4 : 3.2;
  ymin = Math.max(ymin, -clampMax); ymax = Math.min(ymax, clampMax);
  if (ymax - ymin < 1e-6) { ymax += 1; ymin -= 1; }
  const pad = { l: 38, r: 10, t: 12, b: 26 };
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const px = (x) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const py = (y) => H - pad.b - ((y - ymin) / (ymax - ymin)) * (H - pad.t - pad.b);
  // 축
  ctx.strokeStyle = 'rgba(169,182,204,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, H - pad.b); ctx.lineTo(W - pad.r, H - pad.b); ctx.stroke();
  if (ymin < 0 && ymax > 0) { ctx.beginPath(); ctx.moveTo(pad.l, py(0)); ctx.lineTo(W - pad.r, py(0)); ctx.stroke(); }
  ctx.fillStyle = 'rgba(169,182,204,0.9)'; ctx.font = '11px Pretendard, sans-serif';
  ctx.fillText(xLabel, W - pad.r - 70, H - 8);
  ctx.fillText(yLabel, 4, pad.t + 4);
  const ticks = azimuthal ? [0, 60, 120, 180] : [-90, -45, 0, 45, 90];
  for (const tx of ticks) { ctx.fillText(`${tx}°`, px(tx) - 8, H - pad.b + 14); }
  ctx.fillText(ymax.toFixed(1), 4, py(ymax) + 4);
  ctx.fillText(ymin.toFixed(1), 4, py(ymin) + 4);
  // 곡선
  for (const c of curves) {
    ctx.strokeStyle = c.color; ctx.lineWidth = c.width;
    ctx.beginPath();
    let pen = false;
    for (const x of xs) {
      const v = evalY(c.f, x);
      if (!Number.isFinite(v) || v < -clampMax || v > clampMax) { pen = false; continue; }
      if (!pen) { ctx.moveTo(px(x), py(v)); pen = true; } else ctx.lineTo(px(x), py(v));
    }
    ctx.stroke();
  }
  // 범례
  let lx = pad.l + 6;
  for (const c of curves) {
    ctx.fillStyle = c.color; ctx.fillRect(lx, pad.t, 14, 3);
    ctx.fillStyle = 'rgba(232,237,245,0.9)'; ctx.fillText(c.label, lx + 18, pad.t + 5);
    lx += 62;
  }
}

// ---------------------------------------------------------------------------
// blend: 빈켈 트리펠용. 두 지도 축소판과 평균 가중치.
// ---------------------------------------------------------------------------
function drawMini(canvas, f, color) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const sc = (W - 12) / (2 * Math.PI);
  const px = (x) => W / 2 + x * sc, py = (y) => H / 2 - y * sc;
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) {
    ctx.beginPath();
    for (let lat = -90; lat <= 90; lat += 3) { const q = f(lon * D, lat * D); if (lat === -90) ctx.moveTo(px(q[0]), py(q[1])); else ctx.lineTo(px(q[0]), py(q[1])); }
    ctx.stroke();
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 3) { const q = f(lon * D, lat * D); if (lon === -180) ctx.moveTo(px(q[0]), py(q[1])); else ctx.lineTo(px(q[0]), py(q[1])); }
    ctx.stroke();
  }
}

export function mountSidePanel(container) {
  const root = el('div', 'side-panel');
  const head = el('div', 'sp-head');
  const title = el('h2', 'sp-title');
  const chips = el('div', 'sp-chips');
  head.append(title, chips);
  const stageTitle = el('div', 'sp-stage');
  const cap = el('p', 'sp-caption');
  const badge = el('div', 'sp-badge');
  const tex = el('div', 'sp-tex');
  const panel = el('div', 'sp-panel');
  const readout = el('div', 'sp-readout');
  root.append(head, stageTitle, cap, badge, tex, panel, readout);
  container.appendChild(root);

  // 패널 요소들
  const graph = el('canvas', 'sp-graph'); graph.width = 300; graph.height = 180;
  const tableWrap = el('div', 'sp-table');
  const tbl = el('table');
  tbl.innerHTML = '<thead><tr><th>φ</th><th>X</th><th>Y</th></tr></thead>';
  const tb = el('tbody');
  for (const [deg, X, Y] of ROBINSON_TABLE) {
    const tr = el('tr'); tr.dataset.phi = deg;
    tr.innerHTML = `<td>${deg}°</td><td>${X.toFixed(4)}</td><td>${Y.toFixed(4)}</td>`;
    tb.appendChild(tr);
  }
  tbl.appendChild(tb);
  tableWrap.append(el('div', 'sp-table-note', 'X = 위선 길이 비, Y = 적도로부터 거리 비 (5° 간격, 사이는 보간)'), tbl);
  const blend = el('div', 'sp-blend');
  const miniA = el('canvas'); miniA.width = 140; miniA.height = 80;
  const miniB = el('canvas'); miniB.width = 140; miniB.height = 80;
  const blendW = el('div', 'sp-blend-w');
  const bA = el('div', 'sp-mini'); bA.append(miniA, el('span', null, '아이토프'));
  const bB = el('div', 'sp-mini'); bB.append(miniB, el('span', null, '등장방형 (φ₁ ≈ 50°28′)'));
  blend.append(bA, bB, blendW);
  drawMini(miniA, aitoff, '#ffd166');
  drawMini(miniB, winkelEquirectComponent, '#7ee0a8');
  const areaRatio = el('div', 'sp-area');

  let currentPanel = null;
  function showPanel(name, node) {
    if (currentPanel === name) return;
    currentPanel = name;
    panel.innerHTML = '';
    if (node) panel.appendChild(node);
  }

  const api = {
    /** compare.js 가 면적비 패널 내용을 채운다 */
    areaRatioEl: areaRatio,
    /** 티소 지표 hover 값 */
    setReadout(html) { readout.innerHTML = html || ''; readout.style.display = html ? '' : 'none'; },
    /** 로빈슨 표 행 강조 (deg | null) */
    highlightRow(deg) {
      for (const tr of tb.children) tr.classList.toggle('hl', deg != null && parseInt(tr.dataset.phi, 10) === deg);
    },
    onAreaRatioNeeded: null,
  };

  let lastKey = null;
  function render(s) {
    const fr = frame();
    const e = fr.entry, r = fr.root;
    title.textContent = e.nameKo;
    chips.innerHTML = '';
    chips.append(el('span', 'chip-i', FAMILY_LABELS[e.family]), el('span', 'chip-i', PROPERTY_LABELS[e.property]), el('span', 'chip-i', e.light ? '빛 투영' : `조정 ← ${r.nameKo}`));
    if (fr.stepInfo) stageTitle.textContent = `${STAGE_LABELS.adjust} — ${fr.stepInfo.titleKo}`;
    else stageTitle.textContent = STAGE_LABELS[s.stage] + (s.stage !== 'flat' && s.stage !== 'adjust' ? ` — ${r.nameKo}` : '');
    cap.textContent = caption();
    const badgeText = fr.stepInfo && fr.stepInfo.badgeKo;
    badge.textContent = badgeText || '';
    badge.style.display = badgeText ? '' : 'none';

    const texKey = fr.stepInfo ? `step:${e.id}:${fr.stepInfo.index}` : `entry:${s.stage === 'flat' || s.stage === 'wrap' || s.stage === 'project' || s.stage === 'unroll' ? r.id : e.id}`;
    if (texKey !== lastKey) {
      lastKey = texKey;
      renderTex(tex, fr.stepInfo ? fr.stepInfo.formulaTex : (s.stage === 'adjust' ? e.formulaTex : r.formulaTex));
    }

    const p = fr.stepInfo ? fr.stepInfo.panel : 'none';
    if (p === 'spacingGraph') { showPanel('spacingGraph', graph); drawSpacingGraph(graph, fr, s); }
    else if (p === 'robinsonTable') showPanel('robinsonTable', tableWrap);
    else if (p === 'blend') {
      showPanel('blend', blend);
      const w = fr.stepInfo.morph ? s.t / 2 : 0.5;
      blendW.textContent = `가중치 — 아이토프 ${(1 - w).toFixed(2)} : 등장방형 ${w.toFixed(2)}`;
    }
    else if (p === 'areaRatio') { showPanel('areaRatio', areaRatio); if (api.onAreaRatioNeeded) api.onAreaRatioNeeded(); }
    else showPanel('none', null);
  }
  subscribe(render);
  render(getState());
  return api;
}
