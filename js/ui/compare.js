// © 2026 김용현
// ui/compare.js — 비교 모드 (PLAN 8.7). 다른 도법의 외곽선·해안선을 반투명하게 겹치고(적도 길이 정규화),
// 그린란드:아프리카 지도상 면적비를 폴리곤 면적으로 계산한다.
import * as THREE from 'three';
import { PROJECTIONS, domainOf } from '../projections/registry.js';
import { countryRings, projectedArea, AFRICA_FILTER, GREENLAND_FILTER } from '../geometry/clip.js';
import { makeRotation, IDENTITY_ROTATION } from '../geometry/rotate.js';
import { LineLayer } from '../scene/mapLayer.js';
import { getState } from '../state.js';

const D = Math.PI / 180;

/** 도메인 경계 폴리라인(프레임 좌표) */
function domainOutline(domain) {
  const lines = [];
  if (domain.kind === 'cap' && domain.maxAngularDist != null) {
    const c = domain.maxAngularDist - 1e-6, pts = [];
    for (let i = 0; i <= 180; i++) {
      const az = -Math.PI + (2 * Math.PI * i) / 180;
      const x = Math.sin(c) * Math.sin(az), y = Math.sin(c) * Math.cos(az), z = Math.cos(c);
      pts.push(Math.atan2(x, z), Math.asin(Math.max(-1, Math.min(1, y))));
    }
    lines.push(Float64Array.from(pts));
    return lines;
  }
  const { phiMin, phiMax } = domain;
  const top = [], bottom = [], left = [], right = [];
  for (let i = 0; i <= 180; i++) { const l = -Math.PI + (2 * Math.PI * i) / 180; top.push(l, phiMax); bottom.push(l, phiMin); }
  for (let j = 0; j <= 90; j++) { const p = phiMin + ((phiMax - phiMin) * j) / 90; left.push(-Math.PI, p); right.push(Math.PI, p); }
  return [top, bottom, left, right].map((a) => Float64Array.from(a));
}

/** 적도 가로 폭 */
function equatorWidth(f, domain) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i <= 72; i++) {
    const l = -Math.PI + (2 * Math.PI * i) / 72;
    if (domain.maxAngularDist != null && Math.abs(l) > domain.maxAngularDist) continue;
    const q = f(l, 0);
    if (!Number.isFinite(q[0])) continue;
    min = Math.min(min, q[0]); max = Math.max(max, q[0]);
  }
  return max > min ? max - min : 1;
}

export class CompareOverlay {
  constructor() {
    this.group = new THREE.Group();
    this.coast = new LineLayer({ color: 0xe8553f, lineOpacity: 0.55, lift: 0.008 });
    this.outline = new LineLayer({ color: 0xe8553f, lineOpacity: 0.8, lift: 0.008 });
    this.group.add(this.coast.object, this.outline.object);
    this.id = null;
    this.rotationKey = null;
    this.coastLines = [];
    this.frameCoast = [];
  }

  /** 지리좌표 해안선 원본 */
  setCoastSource(lines) { this.coastLines = lines; }

  /** 회전이 바뀌면 다시 분할 */
  setRotation(rotation, splitLines) {
    this.frameCoast = splitLines(this.coastLines, rotation);
    this.coast.setLines(this.frameCoast);
    this.id = null;
  }

  /** fr: state.frame(), ctx: 현재 파이프라인 컨텍스트 */
  update(fr, ctx) {
    const s = getState();
    const id = s.compare && PROJECTIONS[s.compare] ? s.compare : null;
    const show = !!id && fr.flatView;
    this.group.visible = show;
    if (!show) return;
    const other = PROJECTIONS[id];
    const params = { ...other.params, ...s.params };
    const of = (l, p) => other.forward(l, p, params);
    const od = domainOf(other, params);
    if (this.id !== id) { this.outline.setLines(domainOutline(od)); this.id = id; }
    // 적도 길이 정규화 + 중심 맞춤
    const k = equatorWidth(ctx.f, ctx.domain) / equatorWidth(of, od);
    const c0 = ctx.f(0, 0), c1 = of(0, 0);
    const f = (l, p) => { const q = of(l, p); return [c0[0] + (q[0] - c1[0]) * k, c0[1] + (q[1] - c1[1]) * k]; };
    const octx = { ...ctx, f, domain: od, s: 1, bendT: 0 };
    this.coast.update(octx);
    this.outline.update(octx);
  }
}

/** 면적비 패널 */
export class AreaRatio {
  constructor(countriesTopo) {
    this.greenland = countryRings(countriesTopo, GREENLAND_FILTER);
    this.africa = countryRings(countriesTopo, AFRICA_FILTER);
    this.cache = new Map();
  }

  ratioFor(id, params = {}) {
    const key = id + JSON.stringify(params, (k, v) => (v === Infinity ? 'inf' : v));
    if (this.cache.has(key)) return this.cache.get(key);
    const e = PROJECTIONS[id];
    const pr = { ...e.params, ...params };
    const f = (l, p) => e.forward(l, p, pr);
    const rot = IDENTITY_ROTATION;
    const r = projectedArea(this.africa, f, rot) / projectedArea(this.greenland, f, rot);
    this.cache.set(key, r);
    return r;
  }

  /** 현재 도법(f, rotation)의 면적비 */
  ratioCurrent(f, rotation) {
    const a = projectedArea(this.africa, f, rotation), g = projectedArea(this.greenland, f, rotation);
    return g > 0 ? a / g : NaN;
  }

  render(el, current) {
    const presets = [['mercator', '메르카토르'], ['robinson', '로빈슨'], ['equalEarth', 'Equal Earth']];
    el.innerHTML = '';
    const h = document.createElement('div'); h.className = 'sp-area-title'; h.textContent = '그린란드 : 아프리카 지도상 면적비';
    el.appendChild(h);
    const list = document.createElement('div'); list.className = 'sp-area-list';
    const row = (name, val, on) => {
      const r = document.createElement('div'); r.className = 'sp-area-row' + (on ? ' on' : '');
      const n = document.createElement('span'); n.textContent = name;
      const v = document.createElement('span'); v.className = 'sp-area-val'; v.textContent = Number.isFinite(val) ? `1 : ${val.toFixed(1)}` : '—';
      r.append(n, v);
      return r;
    };
    list.appendChild(row('실제 (구면)', 13.7, false));
    for (const [id, name] of presets) list.appendChild(row(name, this.ratioFor(id), current && current.id === id));
    if (current && !presets.some(([id]) => id === current.id)) list.appendChild(row(current.name + ' (현재)', current.ratio, true));
    el.appendChild(list);
    const note = document.createElement('div'); note.className = 'sp-area-note';
    note.textContent = '메르카토르에서는 그린란드가 아프리카만큼 커 보이지만, 실제로는 아프리카가 약 14배 넓다.';
    el.appendChild(note);
  }
}
