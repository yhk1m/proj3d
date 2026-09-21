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
  autoplay: false,
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
/** [ {stage:'flat'}, {stage:'wrap'}, {stage:'project'}, {stage:'unroll'}, {stage:'adjust', step:0}, … ] */
export function timeline() {
  const tl = [{ stage: 'flat', step: 0 }, { stage: 'wrap', step: 0 }, { stage: 'project', step: 0 }, { stage: 'unroll', step: 0 }];
  for (let k = 0; k < stepCount(); k++) tl.push({ stage: 'adjust', step: k });
  return tl;
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
  if (state.stage !== 'flat' && state.t < 1) { state.t = 1; state.playing = 0; notify(); return; }
  if (i + 1 >= tl.length) { state.playing = 0; notify(); return; }
  const n = tl[i + 1];
  goTo(n.stage, n.step, 0, play);
}

/** 이전 전이로. 현재 전이가 진행됐으면 먼저 처음으로 되돌린다. */
export function prev() {
  const tl = timeline();
  const i = timelineIndex();
  if (state.stage !== 'flat' && state.t > 0) { state.t = 0; state.playing = 0; notify(); return; }
  if (i <= 0) return;
  const p = tl[i - 1];
  goTo(p.stage, p.step, p.stage === 'flat' ? 0 : 1, false);
}

export function setT(t) {
  state.t = Math.max(0, Math.min(1, t));
  state.playing = 0;
  notify();
}

export function play(direction = 1) {
  if (state.stage === 'flat') { next(true); return; }
  if (direction > 0 && state.t >= 1) { next(true); return; }
  if (direction < 0 && state.t <= 0) return;
  state.playing = direction;
  notify();
}

export function pause() { state.playing = 0; notify(); }
export function togglePlay() { if (state.playing) pause(); else play(1); }

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
    flatView: (state.stage === 'unroll' && state.t >= 1) || state.stage === 'adjust',
    projectionActive: state.stage !== 'flat' && !(state.stage === 'wrap'),
  };
  frameCache = { key, value };
  return value;
}

/** 단계 자막(한글) */
export function caption() {
  const e = entry(), root = rootEntry(e);
  switch (state.stage) {
    case 'flat': return `펼쳐진 종이가 지구본 옆에 놓여 있다. (${root.nameKo}의 ${surfaceLabel(root)} 종이)`;
    case 'wrap': return `종이가 말리면서 지구본에 씌워진다. 종이는 늘어나지 않는다(가전면).`;
    case 'project': return lightCaption(root);
    case 'unroll': return `지도가 그려진 종이를 다시 펼친다. ${root.captionKo}`;
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

function lightCaption(root) {
  if (root.light && root.light.type === 'axisOrthogonal') return '지축에서 수평으로 나가는 빛이 해안선과 경위선을 종이에 새긴다.';
  const d = state.params.d;
  if (root.surface.type === 'plane') {
    if (d === Infinity) return '무한히 먼 곳에서 오는 평행광이 해안선과 경위선을 평면에 새긴다.';
    if (d >= 0.999) return '접점의 대척점에서 나온 빛이 해안선과 경위선을 평면에 새긴다.';
    if (d <= 0.001) return '지구 중심의 빛이 해안선과 경위선을 평면에 새긴다.';
    return `축 위 d = ${d.toFixed(2)} 지점의 빛이 해안선과 경위선을 평면에 새긴다.`;
  }
  return '지구 내핵의 빛이 해안선과 경위선을 종이에 새긴다.';
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
  for (const k of ['phi0', 'phi1', 'phi2']) { const n = parseNum(q.get(k)); if (n != null) params[k] = n * D; }
  const dv = parseNum(q.get('d')); if (dv != null) params.d = dv;
  const stage = STAGES.includes(q.get('stage')) ? q.get('stage') : 'flat';
  const step = parseInt(q.get('step') || '0', 10) || 0;
  const t = parseNum(q.get('t')) ?? 0;
  selectProjection(projection, { params, stage, step: Math.max(0, step), t: Math.max(0, Math.min(1, t)), compare: q.get('compare') });
  if (q.get('aspect') && ['normal', 'transverse', 'oblique'].includes(q.get('aspect'))) state.aspect = q.get('aspect');
  if (state.stage === 'adjust' && state.step >= stepCount()) { state.stage = 'unroll'; state.t = 1; }
  state.tissot = q.get('tissot') === '1';
  state.projector = q.get('projector') === '1';
  notify();
}
