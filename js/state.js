// © 2026 김용현
// state.js — 상태 머신 + URL 동기화 (PLAN 7장).
//
//   FLAT ──wrap──▶ WRAPPED ──project──▶ PROJECTED ──unroll──▶ UNROLLED ──adjust[k]──▶ ADJUSTED(k)
//
// state.stage 는 '지금 재생 중(또는 끝난) 전이'의 이름이고 t ∈ [0,1] 은 그 전이의 진행도다.
//   flat : 시작 상태(t 무의미)      wrap : 0~0.25 강체 이동, 0.25~1 굽힘 t
//   project : 빛 진행도 s = t      unroll : 굽힘 1 − t      adjust : step 의 모핑 진행도 t
// scene/ui 는 frame() 이 돌려주는 파생값만 읽는다. 위치 계산은 geometry/pipeline.js 로만 한다.
import { PROJECTIONS, domainOf } from './projections/registry.js';
import { DERIVATIONS, stepProjection } from './projections/derivations.js';
import { makeRotation, aspectSpec } from './geometry/rotate.js';

const D = Math.PI / 180;
export const STAGES = ['flat', 'wrap', 'project', 'unroll', 'adjust'];
export const STAGE_LABELS = { flat: '펼친 종이', wrap: '씌우기', project: '빛 투영', unroll: '펼치기', adjust: '수학적 조정' };
export const WRAP_MOVE_FRACTION = 0.25;
const DURATIONS = { wrap: 2.4, project: 3.0, unroll: 2.4, adjust: 3.0 };
const HOLD_AFTER = 1.0;

const state = {
  projection: 'mercator',
  aspect: 'normal',
  params: {},
  stage: 'flat',
  step: 0,
  t: 0,
  tissot: false,
  compare: null,      // 겹쳐 볼 도법 id | null
  playing: 0,         // 0 | 1 | -1 (재생 방향)
  autoplay: true,     // 기본값: 한 단계가 끝나면 다음 단계를 이어서 재생
  projector: false,
  lowPower: false,
};

const listeners = new Set();
let urlTimer = null;
let holdTimer = 0;

export function getState() { return state; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function notify() {
  for (const fn of listeners) fn(state);
  if (urlTimer) clearTimeout(urlTimer);
  urlTimer = setTimeout(writeUrl, 300);
}

export function setState(patch) { Object.assign(state, patch); notify(); }

// ---- 항목 조회 ------------------------------------------------------------
export function entry() { return PROJECTIONS[state.projection]; }
export function derivation(e = entry()) { return e.derivation ? DERIVATIONS[e.derivation] : null; }
export function rootEntry(e = entry()) { const d = derivation(e); return d ? PROJECTIONS[d.root] : e; }
export function surfaceType() { return rootEntry().surface.type; }
export function stepCount() { const d = derivation(); return d ? d.steps.length : 0; }
export function canAdjust() { return stepCount() > 0; }

let rotCache = { key: null, rot: null };
export function rotation() {
  const key = state.aspect + '|' + surfaceType();
  if (rotCache.key !== key) rotCache = { key, rot: makeRotation(aspectSpec(state.aspect, surfaceType())) };
  return rotCache.rot;
}

export function defaultParams(id) {
  const e = PROJECTIONS[id];
  const root = rootEntry(e);
  return { ...root.params, ...e.params };
}

export function selectProjection(id, opts = {}) {
  if (!PROJECTIONS[id]) return;
  const e = PROJECTIONS[id];
  state.projection = id;
  state.aspect = opts.keepAspect ? state.aspect : (e.defaultAspect || 'normal');
  state.params = { ...defaultParams(id), ...(opts.params || {}) };
  state.stage = opts.stage || 'flat';
  state.step = opts.step || 0;
  state.t = opts.t ?? 0;
  state.compare = opts.compare ?? null;
  state.playing = 0;
  notify();
}

export function setParam(name, value) {
  state.params = { ...state.params, [name]: value };
  notify();
}

export function setAspect(aspect) {
  state.aspect = aspect;
  notify();
}

// ---- 타임라인 ------------------------------------------------------------
/** [ {stage:'flat'}, {stage:'wrap'}, {stage:'project'}, {stage:'unroll'}, {stage:'adjust', step:0}, … ]
 *  평면 종이는 이미 펼쳐져 있으므로 unroll 이 없다. */
export function timeline() {
  const tl = [{ stage: 'flat', step: 0 }, { stage: 'wrap', step: 0 }, { stage: 'project', step: 0 }];
  if (surfaceType() !== 'plane') tl.push({ stage: 'unroll', step: 0 });
  for (let k = 0; k < stepCount(); k++) tl.push({ stage: 'adjust', step: k });
  return tl;
}

/** 단계 이름표. 평면은 '씌우기' 대신 '붙이기' */
export function stageLabel(stage) {
  if (stage === 'wrap' && surfaceType() === 'plane') return '붙이기';
  return STAGE_LABELS[stage];
}

export function timelineIndex() {
  return timeline().findIndex((x) => x.stage === state.stage && (x.stage !== 'adjust' || x.step === state.step));
}

export function goTo(stage, step = 0, t = 0, play = false) {
  state.stage = stage;
  state.step = step;
  state.t = stage === 'flat' ? 0 : t;
  state.playing = play && stage !== 'flat' ? 1 : 0;
  holdTimer = 0;
  applyStepSideEffects();
  notify();
}

function applyStepSideEffects() {
  if (state.stage !== 'adjust') { return; }
  const d = derivation();
  const st = d && d.steps[state.step];
  if (!st) return;
  if (st.tissot) state.tissot = true;
  if (st.compare) state.compare = st.compare;
}

/** 다음 전이로. 현재 전이가 덜 끝났으면 먼저 끝낸다. */
export function next(play = true) {
  const tl = timeline();
  const i = timelineIndex();
  if (state.stage !== 'flat' && state.t < 1) { state.t = 1; state.playing = 0; holdTimer = 0; notify(); return; }
  if (i + 1 >= tl.length) { state.playing = 0; notify(); return; }
  const n = tl[i + 1];
  goTo(n.stage, n.step, 0, play);
}

/** 이전 전이로. 현재 전이가 진행됐으면 먼저 처음으로 되돌린다. */
export function prev() {
  const tl = timeline();
  const i = timelineIndex();
  if (state.stage !== 'flat' && state.t > 0) { state.t = 0; state.playing = 0; holdTimer = 0; notify(); return; }
  if (i <= 0) return;
  const p = tl[i - 1];
  goTo(p.stage, p.step, p.stage === 'flat' ? 0 : 1, false);
}

export function setT(t) {
  state.t = Math.max(0, Math.min(1, t));
  state.playing = 0;
  holdTimer = 0;
  notify();
}

export function play(direction = 1) {
  if (state.stage === 'flat') { next(true); return; }
  if (direction > 0 && state.t >= 1) { next(true); return; }
  if (direction < 0 && state.t <= 0) return;
  state.playing = direction;
  notify();
}

/** 진행 중인가 — 재생 중이거나, 자동 재생이 다음 단계를 기다리는 중(HOLD_AFTER). 리모컨의 일시정지 아이콘 기준. */
export function isRunning() { return !!state.playing || holdTimer > 0; }
/** 그 자리에서 멈춤. 자동 재생 대기도 취소한다(대기 중 누르면 다음 단계로 점프하던 문제). */
export function pause() { holdTimer = 0; state.playing = 0; notify(); }
export function togglePlay() { if (isRunning()) pause(); else play(1); }

/** 렌더 루프에서 호출. dt 초. */
export function tick(dt) {
  if (holdTimer > 0) {
    holdTimer -= dt;
    if (holdTimer <= 0) { holdTimer = 0; next(true); }
    return;
  }
  if (!state.playing) return;
  const dur = DURATIONS[state.stage] || 2.5;
  state.t += (dt / dur) * state.playing;
  if (state.t >= 1) {
    state.t = 1;
    state.playing = 0;
    const i = timelineIndex();
    if (state.autoplay && i + 1 < timeline().length) holdTimer = HOLD_AFTER;
  } else if (state.t <= 0) {
    state.t = 0;
    state.playing = 0;
  }
  notify();
}

// ---- 파생값 ---------------------------------------------------------------
let frameCache = { key: null, value: null };

/**
 * scene/ui 가 읽는 파생값.
 *  moveP : FLAT → 접선 위치 강체 이동 진행도
 *  bendT : 굽힘 t        s : 빛 진행도
 *  f, domain : 현재 유효 투영(프레임 좌표)   stepInfo : 조정 단계 정보 | null
 *  flatView : 펼친 뒤(정면 시점) 인가
 */
export function frame() {
  const e = entry();
  const d = derivation(e);
  const root = rootEntry(e);
  const key = [state.projection, state.aspect, state.stage, state.step, state.t.toFixed(5), Object.entries(state.params).map(([k, v]) => k + '=' + v).join(',')].join('|');
  if (frameCache.key === key) return frameCache.value;

  let moveP = 1, bendT = 0, s = 1;
  switch (state.stage) {
    case 'flat': moveP = 0; bendT = 0; s = 0; break;
    case 'wrap':
      moveP = Math.min(1, state.t / WRAP_MOVE_FRACTION);
      bendT = Math.max(0, (state.t - WRAP_MOVE_FRACTION) / (1 - WRAP_MOVE_FRACTION));
      s = 0; break;
    case 'project': bendT = 1; s = state.t; break;
    case 'unroll': bendT = 1 - state.t; s = 1; break;
    case 'adjust': bendT = 0; s = 1; break;
  }

  let proj;
  let stepInfo = null;
  if (state.stage === 'adjust' && d) {
    const k = Math.min(state.step, d.steps.length - 1);
    proj = stepProjection(d, k, state.t, state.params);
    stepInfo = { index: k, count: d.steps.length, ...d.steps[k] };
  } else {
    const params = state.params;
    proj = { f: (lam, phi) => root.forward(lam, phi, params), domain: domainOf(root, params) };
  }

  const value = {
    entry: e, root, derivation: d, rotation: rotation(),
    surface: root.surface, light: root.light, params: state.params,
    stage: state.stage, t: state.t, moveP, bendT, s,
    f: proj.f, domain: proj.domain, stepInfo,
    flatView: (state.stage === 'unroll' && state.t >= 1) || state.stage === 'adjust' ||
      (root.surface.type === 'plane' && state.stage === 'project' && state.t >= 1),
    projectionActive: state.stage !== 'flat' && !(state.stage === 'wrap'),
  };
  frameCache = { key, value };
  return value;
}

/** 단계 자막(한글, 명사형) */
export function caption() {
  const e = entry(), root = rootEntry(e);
  const plane = root.surface.type === 'plane';
  switch (state.stage) {
    case 'flat': return `펼쳐진 종이가 지구본 옆에 놓인 상태 — ${root.nameKo}의 ${surfaceLabel(root)} 종이`;
    case 'wrap': return plane
      ? '원판 종이를 접점에 붙이는 중. 평면은 굽힐 필요가 없는 가전면'
      : '종이가 말리면서 지구본에 씌워지는 중. 종이는 늘어나지 않음 — 펼 수 있는 면(가전면)만 이렇게 씌울 수 있음';
    case 'project': return lightCaption(root) + (plane && state.t >= 0.85 ? ' 투영 끝, 종이는 이미 펼쳐진 상태' : '');
    case 'unroll': return `지도가 그려진 종이를 다시 펼치는 중. ${root.captionKo}`;
    case 'adjust': {
      const st = frame().stepInfo;
      return st ? st.captionKo : e.captionKo;
    }
  }
  return '';
}

function surfaceLabel(root) {
  return { cylinder: '원통', cone: '원뿔(부채꼴)', plane: '평면(원판)' }[root.surface.type];
}

/**
 * 광원 설명(측면 패널). kind: 'point' | 'line' | 'parallel'
 * 선광원(지축 전체)은 점광원과 달리 실제 전구로는 만들 수 없는 수학적 광원이라 따로 설명한다.
 */
export function lightDescription() {
  const root = rootEntry();
  const light = root.light;
  if (!light) return null;
  if (light.type === 'axisOrthogonal') {
    return {
      kind: 'line',
      titleKo: '선광원 — 지축 전체가 광원',
      textKo: '광원이 한 점이 아니라 지축(회전축) 전체. 축 위의 각 점에서 축에 수직인 방향(수평)으로만 빛이 나감. 위도 φ인 지점은 자기 높이 sin φ 에 있는 축 점의 빛을 받아 같은 높이로 원통에 찍힘 → y = sin φ. 위선 띠의 넓이가 그대로 보존되는 이유(아르키메데스). 전구 하나로는 만들 수 없는 수학적 광원.',
    };
  }
  const d = state.params.d;
  if (root.surface.type === 'plane') {
    if (d === Infinity) return { kind: 'parallel', titleKo: '평행광 — 무한히 먼 광원', textKo: '태양빛처럼 무한히 먼 곳에서 오는 평행한 빛. 각 점을 접평면에 수직으로 떨어뜨린 그림자가 지도. 반구만 보임.' };
    if (d >= 0.999) return { kind: 'point', titleKo: '점광원 — 접점의 대척점', textKo: '접점 반대편 지구 표면의 한 점에서 빛이 나옴. 지구 속을 지나 접평면에 닿는 광선. 원주각 정리로 각이 절반이 되어 정각(평사).' };
    if (d <= 0.001) return { kind: 'point', titleKo: '점광원 — 지구 중심', textKo: '지구 중심 한 점에서 모든 방향으로 빛이 나감. 광원·구면의 점·종이의 점이 한 직선 위(공선). 대권이 직선으로 찍힘(심사).' };
    return { kind: 'point', titleKo: `점광원 — 축 위 d = ${d.toFixed(2)}`, textKo: '접점 반대쪽 축 위의 한 점에서 나오는 빛. d = 0 이면 심사, 1 이면 평사, 무한대면 정사.' };
  }
  return { kind: 'point', titleKo: '점광원 — 지구 중심(내핵)', textKo: '지구 중심 한 점에서 모든 방향으로 빛이 나감. 광원·구면의 점·종이의 점이 한 직선 위(공선). 위도가 높을수록 광선이 종이와 비스듬히 만나 멀리 찍힘 → 위선 간격이 tan 으로 벌어짐.' };
}

function lightCaption(root) {
  if (root.light && root.light.type === 'axisOrthogonal') return '지축에서 수평으로 나가는 빛 → 해안선과 경위선이 종이에 새겨짐.';
  const d = state.params.d;
  if (root.surface.type === 'plane') {
    if (d === Infinity) return '무한히 먼 곳의 평행광 → 해안선과 경위선이 평면에 새겨짐.';
    if (d >= 0.999) return '접점의 대척점에서 나온 빛 → 해안선과 경위선이 평면에 새겨짐.';
    if (d <= 0.001) return '지구 중심의 빛 → 해안선과 경위선이 평면에 새겨짐.';
    return `축 위 d = ${d.toFixed(2)} 지점의 빛 → 해안선과 경위선이 평면에 새겨짐.`;
  }
  return '지구 내핵의 빛 → 해안선과 경위선이 종이에 새겨짐.';
}

// ---- URL 동기화 -----------------------------------------------------------
function fmtNum(v) {
  if (v === Infinity) return 'inf';
  return String(Math.round(v * 1000) / 1000);
}

export function toQuery() {
  const q = new URLSearchParams();
  q.set('p', state.projection);
  if (state.stage !== 'flat') q.set('stage', state.stage);
  if (state.stage === 'adjust') q.set('step', String(state.step));
  if (state.stage !== 'flat') q.set('t', state.t.toFixed(2));
  if (state.aspect !== 'normal') q.set('aspect', state.aspect);
  const def = defaultParams(state.projection);
  for (const k of ['phi0', 'phi1', 'phi2']) {
    if (state.params[k] != null && Math.abs((state.params[k] || 0) - (def[k] || 0)) > 1e-9) q.set(k, fmtNum(state.params[k] / D));
  }
  if (state.params.d != null && state.params.d !== def.d) q.set('d', fmtNum(state.params.d));
  if (state.tissot) q.set('tissot', '1');
  if (state.compare) q.set('compare', state.compare);
  if (state.projector) q.set('projector', '1');
  if (typeof location !== 'undefined') {
    if (/[?&]dev=1/.test(location.search)) q.set('dev', '1');
    if (/[?&]instant=1/.test(location.search)) q.set('instant', '1');
  }
  return q.toString();
}

function writeUrl() {
  if (typeof history === 'undefined') return;
  const qs = toQuery();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

function parseNum(v) {
  if (v == null) return null;
  if (v === 'inf') return Infinity;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function loadFromQuery(search) {
  const q = new URLSearchParams(search || '');
  const id = q.get('p');
  const projection = id && PROJECTIONS[id] ? id : 'mercator';
  const params = {};
  const locked = new Set([...(PROJECTIONS[projection].lockParams || [])]);
  for (const k of ['phi0', 'phi1', 'phi2']) { const n = parseNum(q.get(k)); if (n != null && !locked.has(k)) params[k] = n * D; }
  const dv = parseNum(q.get('d')); if (dv != null) params.d = dv;
  const stage = STAGES.includes(q.get('stage')) ? q.get('stage') : 'flat';
  const step = parseInt(q.get('step') || '0', 10) || 0;
  const t = parseNum(q.get('t')) ?? 0;
  selectProjection(projection, { params, stage, step: Math.max(0, step), t: Math.max(0, Math.min(1, t)), compare: q.get('compare') });
  if (q.get('aspect') && ['normal', 'transverse', 'oblique'].includes(q.get('aspect'))) state.aspect = q.get('aspect');
  if (state.stage === 'adjust' && state.step >= stepCount()) { state.stage = surfaceType() === 'plane' ? 'project' : 'unroll'; state.t = 1; }
  if (state.stage === 'unroll' && surfaceType() === 'plane') { state.stage = 'project'; state.t = 1; }
  state.tissot = q.get('tissot') === '1';
  state.projector = q.get('projector') === '1';
  notify();
}
