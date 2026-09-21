// © 2026 김용현
// ui/sidePanel.js — 자막, KaTeX 수식, 간격 함수 그래프, 로빈슨 표, 빈켈 blend 패널 (PLAN 8.6)
import katex from 'katex';
import { PROJECTIONS, FAMILY_LABELS, PROPERTY_LABELS } from '../projections/registry.js';
import { ROBINSON_TABLE } from '../projections/robinsonTable.js';
import { winkelEquirectComponent, stepProjection, endOfStep } from '../projections/derivations.js';
import { aitoff, mollweide, goodeHomolosine, GOODE_LOBES_DEG, HOMOLOSINE_PHI } from '../projections/adjusted.js';
import { ENTRY_NOTES, STEP_NOTES, SYMBOLS } from './formulaNotes.js';
import { getState, subscribe, frame, caption, entry, rootEntry, derivation, STAGE_LABELS, lightDescription } from '../state.js';

const LIGHT_ICONS = {
  point: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2.5" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="7.8" y2="7.8"/><line x1="16.2" y1="16.2" x2="18.7" y2="18.7"/><line x1="5.3" y1="18.7" x2="7.8" y2="16.2"/><line x1="16.2" y1="7.8" x2="18.7" y2="5.3"/></svg>',
  line: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="2.5" x2="12" y2="21.5" stroke-width="2.6"/><line x1="14.5" y1="6" x2="20" y2="6"/><line x1="14.5" y1="12" x2="21" y2="12"/><line x1="14.5" y1="18" x2="20" y2="18"/><line x1="9.5" y1="6" x2="4" y2="6"/><line x1="9.5" y1="12" x2="3" y2="12"/><line x1="9.5" y1="18" x2="4" y2="18"/></svg>',
  parallel: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="18" y2="6"/><line x1="3" y1="12" x2="18" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/><polyline points="15 3 18 6 15 9"/><polyline points="15 9 18 12 15 15"/><polyline points="15 15 18 18 15 21"/></svg>',
};

const D = Math.PI / 180;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** 수식이 패널 폭보다 길면 글자 크기를 줄여 가로 스크롤이 생기지 않게 한다 */
function fitTex(container) {
  const inner = container.querySelector('.katex-display > .katex') || container.querySelector('.katex');
  if (!inner) return;
  inner.style.fontSize = '';
  const avail = container.clientWidth - 24;
  const need = inner.scrollWidth;
  if (avail > 0 && need > avail) inner.style.fontSize = `${Math.max(0.5, avail / need) * 1.21}em`;
}

let lastTexContainer = null;
function renderTex(container, tex) {
  container.innerHTML = '';
  if (!tex) { container.style.display = 'none'; return; }
  container.style.display = '';
  try { katex.render(tex, container, { throwOnError: false, displayMode: true }); }
  catch (e) { container.textContent = tex; }
  fitTex(container);
  lastTexContainer = container;
  // KaTeX 웹폰트가 늦게 오면 폭이 달라지므로 다시 맞춘다
  requestAnimationFrame(() => fitTex(container));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitTex(container));
}
window.addEventListener('resize', () => { if (lastTexContainer) fitTex(lastTexContainer); });

// ---------------------------------------------------------------------------
// lobes: 구드용. 위: 시뉴소이드·몰바이데의 위선 길이 비(40°44′ 에서 교차). 아래: 로브 배치와 중앙경선.
// ---------------------------------------------------------------------------
function drawLobes(canvas, fr) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const step = fr.stepInfo ? fr.stepInfo.index : 0;
  ctx.font = '11px Pretendard, sans-serif';

  // ---- 위: 위선 길이 비 그래프 ----
  const gH = 118, pad = { l: 36, r: 10, t: 16, b: 20 };
  const px = (deg) => pad.l + (deg / 90) * (W - pad.l - pad.r);
  const py = (v) => pad.t + (1 - v) * (gH - pad.t - pad.b);
  ctx.strokeStyle = 'rgba(169,182,204,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, gH - pad.b); ctx.lineTo(W - pad.r, gH - pad.b); ctx.stroke();
  ctx.fillStyle = 'rgba(169,182,204,0.9)';
  for (const d of [0, 30, 60, 90]) ctx.fillText(`${d}°`, px(d) - 7, gH - pad.b + 13);
  ctx.fillText('1', pad.l - 12, py(1) + 4); ctx.fillText('0', pad.l - 12, py(0) + 4);
  ctx.fillText('위선 길이 비 (적도 = 1)', pad.l + 4, pad.t - 4);
  const curves = [
    { name: '시뉴소이드', color: '#ffd166', f: (deg) => Math.cos(deg * D) },
    { name: '몰바이데', color: '#e8553f', f: (deg) => mollweide(Math.PI, deg * D)[0] / Math.PI },
  ];
  for (const c of curves) {
    ctx.strokeStyle = c.color; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let d = 0; d <= 90; d += 1) { const v = c.f(d); if (d === 0) ctx.moveTo(px(d), py(v)); else ctx.lineTo(px(d), py(v)); }
    ctx.stroke();
  }
  const seamDeg = HOMOLOSINE_PHI / D;
  ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(232,237,245,0.8)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px(seamDeg), pad.t); ctx.lineTo(px(seamDeg), gH - pad.b); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e8edf5'; ctx.fillText("40°44′", px(seamDeg) + 4, gH - pad.b - 4);
  // 범례
  ctx.fillStyle = '#ffd166'; ctx.fillRect(W - pad.r - 128, pad.t + 2, 12, 3);
  ctx.fillStyle = '#e8edf5'; ctx.fillText('시뉴소이드', W - pad.r - 112, pad.t + 7);
  ctx.fillStyle = '#e8553f'; ctx.fillRect(W - pad.r - 58, pad.t + 2, 12, 3);
  ctx.fillStyle = '#e8edf5'; ctx.fillText('몰바이데', W - pad.r - 42, pad.t + 7);

  // ---- 아래: 로브 배치도 ----
  const top = gH + 10, mapH = H - top - 4;
  const sx = (W - 16) / (2 * Math.PI), sy = mapH / 3.0;
  const mx = (x) => W / 2 + x * sx, my = (y) => top + mapH / 2 - y * sy;
  const eps = 1e-6;
  const drawLobe = (lobe, sign) => {
    const [a, b] = lobe.range;
    const pts = [];
    for (let d = 0; d <= 90; d += 3) pts.push(goodeHomolosine((a + eps) * D, sign * d * D));
    for (let d = 90; d >= 0; d -= 3) pts.push(goodeHomolosine((b - eps) * D, sign * d * D));
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(mx(p[0]), my(p[1])) : ctx.moveTo(mx(p[0]), my(p[1]))));
    ctx.closePath();
    ctx.fillStyle = step >= 2 ? 'rgba(244,238,220,0.18)' : 'rgba(244,238,220,0.08)';
    ctx.fill();
    ctx.strokeStyle = step >= 2 ? 'rgba(244,238,220,0.9)' : 'rgba(244,238,220,0.35)';
    ctx.lineWidth = 1; ctx.stroke();
    // 중앙경선
    ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(126,224,168,0.9)';
    ctx.beginPath();
    for (let d = 0; d <= 90; d += 3) { const p = goodeHomolosine(lobe.center * D, sign * d * D); if (d === 0) ctx.moveTo(mx(p[0]), my(p[1])); else ctx.lineTo(mx(p[0]), my(p[1])); }
    ctx.stroke(); ctx.setLineDash([]);
    // 40°44′ 이음매
    if (step >= 1) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(232,237,245,0.7)';
      ctx.beginPath();
      for (let d = a + 1; d <= b - 1; d += 3) { const p = goodeHomolosine(d * D, sign * HOMOLOSINE_PHI); if (d === a + 1) ctx.moveTo(mx(p[0]), my(p[1])); else ctx.lineTo(mx(p[0]), my(p[1])); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (step >= 2) {
      ctx.fillStyle = '#7ee0a8';
      const c = lobe.center;
      ctx.fillText(`${Math.abs(c)}°${c < 0 ? 'W' : 'E'}`, mx(c * D) - 12, my(sign * 0.55) + 4);
    }
  };
  GOODE_LOBES_DEG.north.forEach((l) => drawLobe(l, 1));
  GOODE_LOBES_DEG.south.forEach((l) => drawLobe(l, -1));
  ctx.fillStyle = 'rgba(169,182,204,0.9)';
  ctx.fillText(step >= 2 ? '로브 6개와 중앙경선(점선) — 절개는 바다에서만' : step === 1 ? '점선 = 40°44′ 이음매' : '아래: 완성된 구드 도법의 로브 배치', 8, top + 12);
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
  const lightBox = el('div', 'sp-light');
  const lightIcon = el('div', 'sp-light-icon');
  const lightBody = el('div', 'sp-light-body');
  const lightTitle = el('div', 'sp-light-title');
  const lightText = el('div', 'sp-light-text');
  lightBody.append(lightTitle, lightText);
  lightBox.append(lightIcon, lightBody);
  const badge = el('div', 'sp-badge');
  const texWrap = el('div', 'sp-texwrap');
  const tex = el('div', 'sp-tex');
  tex.title = '클릭하면 수식 설명';
  const texToggle = el('button', 'sp-tex-toggle', '이 수식은? 설명 보기');
  texToggle.type = 'button';
  const texNote = el('div', 'sp-texnote');
  texWrap.append(tex, texToggle, texNote);
  let noteOpen = false, currentNote = '';
  const renderNote = () => {
    const has = !!currentNote;
    texToggle.style.display = has && tex.style.display !== 'none' ? '' : 'none';
    texNote.style.display = has && noteOpen ? '' : 'none';
    texToggle.textContent = noteOpen ? '설명 접기' : '이 수식은? 설명 보기';
    texToggle.classList.toggle('on', noteOpen);
    if (has && noteOpen) texNote.innerHTML = `<div class="sp-texnote-sym">${SYMBOLS}</div>${currentNote}`;
  };
  const toggleNote = () => { noteOpen = !noteOpen; renderNote(); };
  tex.addEventListener('click', toggleNote);
  texToggle.addEventListener('click', toggleNote);
  const panel = el('div', 'sp-panel');
  const readout = el('div', 'sp-readout');
  const copy = el('div', 'sp-copy');
  copy.append('(c) 2026 양정고등학교 지리교사 김용현T | ');
  const link = el('a', null, 'https://bgnl.kr');
  link.href = 'https://bgnl.kr'; link.target = '_blank'; link.rel = 'noopener';
  copy.appendChild(link);
  root.append(head, stageTitle, cap, lightBox, badge, texWrap, panel, readout, copy);
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
  const lobes = el('canvas', 'sp-graph sp-lobes'); lobes.width = 300; lobes.height = 300;

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
    // 광원 설명: 빛 투영과 관련된 단계(조정 전)에만
    const ld = s.stage !== 'adjust' ? lightDescription() : null;
    if (ld) {
      lightBox.style.display = '';
      lightBox.classList.toggle('on', s.stage === 'project');
      lightIcon.innerHTML = LIGHT_ICONS[ld.kind] || LIGHT_ICONS.point;
      lightTitle.textContent = ld.titleKo;
      lightText.textContent = ld.textKo;
    } else {
      lightBox.style.display = 'none';
    }
    const badgeText = fr.stepInfo && fr.stepInfo.badgeKo;
    badge.textContent = badgeText || '';
    badge.style.display = badgeText ? '' : 'none';

    const texKey = fr.stepInfo ? `step:${e.id}:${fr.stepInfo.index}` : `entry:${s.stage === 'flat' || s.stage === 'wrap' || s.stage === 'project' || s.stage === 'unroll' ? r.id : e.id}`;
    if (texKey !== lastKey) {
      lastKey = texKey;
      renderTex(tex, fr.stepInfo ? fr.stepInfo.formulaTex : (s.stage === 'adjust' ? e.formulaTex : r.formulaTex));
      // 수식 설명: 단계 설명 → 단계 목표 도법 설명 → 도법 설명 순으로 찾는다
      if (fr.stepInfo) {
        const derivId = e.derivation;
        const stepNote = STEP_NOTES[derivId] && STEP_NOTES[derivId][fr.stepInfo.index];
        const target = fr.stepInfo.morph && fr.stepInfo.morph.to;
        currentNote = stepNote || (target && ENTRY_NOTES[target]) || (fr.stepInfo.formulaTex ? ENTRY_NOTES[e.id] : '') || '';
      } else {
        currentNote = ENTRY_NOTES[s.stage === 'adjust' ? e.id : r.id] || '';
      }
      renderNote();
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
    else if (p === 'lobes') { showPanel('lobes', lobes); drawLobes(lobes, fr); }
    else showPanel('none', null);
  }
  subscribe(render);
  render(getState());
  return api;
}
