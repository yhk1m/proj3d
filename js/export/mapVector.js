// © 2026 김용현
// export/mapVector.js — PNG 저장용 벡터 경로(순수 함수, DOM 없음).
// 현재 프레임 { f, domain, rotation } 을 종이 좌표 [x, y] 경로로 만든다. 순서는 화면 파이프라인과 같다:
//   지리 (λ, φ) ──rotation.forward──▶ 프레임 (λ′, φ′) ──잘라내기·촘촘히──▶ f ──▶ (x, y)
// 잘라내기: 날짜변경선(d3 geoClipAntimeridian 폴리곤 스트림) → 영역(사각 도메인, 구드는 로브별) → 원형 도메인(방위도법).
import { geoClipAntimeridian } from 'd3-geo';
import { feature as topoFeature } from 'topojson-client';
import { coastlines, graticuleLines, tissotCircles, splitLines, splitAtCuts } from '../geometry/clip.js';
import { inDomain } from '../geometry/pipeline.js';

const D = Math.PI / 180;
const PI = Math.PI;
const STEP = 1 * D;   // 촘촘히 간격(프레임 좌표 λ′·φ′)
const ARC = 1 * D;    // 원형 도메인 경계 원호 간격
const EPS = 1e-7;     // 구드 절개선에서 로브 안쪽으로 미는 양(어느 로브로 평가될지 확실하게)

// ---- 자료 준비 ------------------------------------------------------------

/** land TopoJSON → 폴리곤 목록. 폴리곤 = 고리 배열, 고리 = [[λ, φ], …] 라디안(닫는 점 제외) */
export function landPolygons(topo) {
  const fc = topoFeature(topo, topo.objects.land);
  const geoms = fc.type === 'FeatureCollection' ? fc.features.map((x) => x.geometry) : [fc.geometry];
  const out = [];
  for (const g of geoms) {
    if (!g) continue;
    const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of list) out.push(poly.map((ring) => ring.slice(0, -1).map(([l, p]) => [l * D, p * D])));
  }
  return out;
}

/** 한 번만 준비하면 되는 지리 자료 */
export function prepareMapData(landTopo) {
  return {
    land: landPolygons(landTopo), coast: coastlines(landTopo), graticule: graticuleLines(15),
    tissot: tissotCircles(4).map((c) => c.line),   // 화면 티소 지표와 같은 원(각반경 4°, 30° 간격)
  };
}

// ---- 평면 (λ′, φ′) 고리 도구 ------------------------------------------------

const lin = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** 고리를 STEP 이하 간격으로. 원형 경계 위 두 점 사이(이미 원호로 채움)는 건너뜀 */
function densify(pts, closed) {
  const n = pts.length, out = [];
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    out.push(a);
    if (a.onCap && b.onCap) continue;
    const k = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / STEP);
    for (let j = 1; j < k; j++) out.push(lin(a, b, j / k));
  }
  if (!closed && n) out.push(pts[n - 1]);
  return out;
}

/** 서덜랜드–호지먼 한 번: inside(점) 쪽만 남김. 경계와 만나는 점에 exit/entry 표시 */
function clipHalf(ring, inside, cross) {
  const out = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[(i + n - 1) % n], b = ring[i];
    const ia = inside(a), ib = inside(b);
    if (ib) {
      if (!ia) { const q = cross(a, b); q.entry = true; out.push(q); }
      out.push(b);
    } else if (ia) {
      const q = cross(a, b); q.exit = true; out.push(q);
    }
  }
  return out.length >= 3 ? out : [];
}

/** 사각 영역 { l0, l1, p0, p1 } 으로 자름 */
function clipToRect(ring, r) {
  const atL = (x) => (a, b) => { const q = lin(a, b, (x - a[0]) / (b[0] - a[0])); q[0] = x; return q; };
  const atP = (y) => (a, b) => { const q = lin(a, b, (y - a[1]) / (b[1] - a[1])); q[1] = y; return q; };
  let out = ring;
  out = clipHalf(out, (p) => p[0] >= r.l0, atL(r.l0));
  out = clipHalf(out, (p) => p[0] <= r.l1, atL(r.l1));
  out = clipHalf(out, (p) => p[1] >= r.p0, atP(r.p0));
  out = clipHalf(out, (p) => p[1] <= r.p1, atP(r.p1));
  return out;
}

/** 짝홀 규칙으로 점이 고리 안인지 */
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---- 원형 도메인(프레임 중심 (0, 0) 에서 각거리 c 이내) -------------------------

/** 원 위 방위각 az 의 점(compare.js domainOutline 과 같은 매개화) */
function capPoint(c, az) {
  const x = Math.sin(c) * Math.sin(az), y = Math.sin(c) * Math.cos(az), z = Math.cos(c);
  const q = [Math.atan2(x, z), Math.asin(Math.max(-1, Math.min(1, y)))];
  q.onCap = true;
  return q;
}
const capAz = (p) => Math.atan2(Math.cos(p[1]) * Math.sin(p[0]), Math.sin(p[1]));

/** 원 위를 방향 dir(+1 = capAz 증가 = (λ′, φ′) 평면 시계 방향)으로 az0 에서 az1 까지 가는 각(0 이상 2π 미만) */
function capTravel(az0, az1, dir) {
  const d = dir * (az1 - az0);
  return ((d % (2 * PI)) + 2 * PI) % (2 * PI);
}

/** 나간 점 a → 들어온 점 b 사이 원호 점(양 끝 제외). 방향 dir 로 capTravel 만큼 */
function capArc(c, a, b, dir) {
  const az0 = capAz(a);
  const dd = dir * capTravel(az0, capAz(b), dir);
  const n = Math.max(1, Math.ceil(Math.abs(dd) / ARC));
  const pts = [];
  for (let k = 1; k < n; k++) pts.push(capPoint(c, az0 + (dd * k) / n));
  return pts;
}

/** 원 전체 고리 */
function capCircle(c) {
  const n = Math.ceil((2 * PI) / ARC), pts = [];
  for (let k = 0; k < n; k++) pts.push(capPoint(c, -PI + (2 * PI * k) / n));
  return pts;
}

/** (λ′, φ′) 평면 신발끈 넓이(반시계 +) */
function signedArea(ring) {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

/**
 * 원형 도메인으로 자름 → 고리 배열. 고리가 원 전체를 감싸면 원 고리 하나.
 * 바이러–애서턴 방식: 원 안에 든 구간(들어온 점 … 나간 점)들을 만든 뒤, 나간 점에서 고리 방향으로 원을 따라가
 * 처음 만나는 들어온 점의 구간으로 잇는다. 고리 방향: capAz 증가는 (λ′, φ′) 평면(φ′ 위)에서 도메인 안쪽을 오른쪽에 둔
 * 시계 방향 → 시계 방향 고리(신발끈 음수, d3 바깥 고리)는 az 증가, 반시계는 감소. (가까운 쪽 원호나 고리 순서대로의 짝짓기는
 * 원을 긴 쪽으로 감싸는 땅 · 해안이 경계를 여러 번 넘나드는 땅에서 고리를 뒤집는다.)
 */
function clipToCap(ring, cIn) {
  // c = 90° 는 극(φ′ = ±90° 변 전체)이 경계 위에 놓여 안/밖이 반올림에 좌우됨 → 아주 조금 안쪽으로
  const c = Math.abs(cIn - PI / 2) < 1e-12 ? cIn - 1e-9 : cIn;
  const n = ring.length;
  const cr = Math.cos(c);
  const inside = (p) => Math.cos(p[1]) * Math.cos(p[0]) >= cr;
  const cross = (a, b) => {
    const ia = inside(a);
    let lo = 0, hi = 1;
    for (let k = 0; k < 48; k++) { const mid = (lo + hi) / 2; if (inside(lin(a, b, mid)) === ia) lo = mid; else hi = mid; }
    const q = lin(a, b, ia ? lo : hi);   // 항상 안쪽 끝을 택해 도메인 안에 둠
    q.onCap = true;
    return q;
  };
  const ins = ring.map(inside);
  if (ins.every(Boolean)) return [ring];
  const start = ins.findIndex((v, i) => v && !ins[(i + n - 1) % n]);
  if (start < 0) return pointInRing([0, 0], ring) ? [capCircle(c)] : [];
  // 원 안 구간: 들어온 점 … 나간 점
  const segs = [];
  let seg = null;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n, prev = (i + n - 1) % n, next = (i + 1) % n;
    if (!ins[i]) continue;
    if (!ins[prev]) seg = [cross(ring[prev], ring[i])];
    seg.push(ring[i]);
    if (!ins[next]) { seg.push(cross(ring[i], ring[next])); segs.push({ pts: seg, azIn: capAz(seg[0]), azOut: capAz(seg[seg.length - 1]) }); seg = null; }
  }
  const dir = signedArea(ring) < 0 ? 1 : -1;
  // c > 90° 이면 원이 대척점(날짜변경선 λ′ = ±180° 위)을 감싸, 평면에서는 λ′ > 0 쪽(az ∈ (0, π])과 λ′ < 0 쪽(az ∈ [−π, 0))
  // 두 호로 나뉜다. 호는 같은 쪽 안에서만, az 0·±π 를 넘지 않고 이어야 함((π, φ′)·(−π, φ′) 는 구 위 같은 점이지만 평면에선 딴 점)
  const split = c > PI / 2;
  const travel = (a, azA, b, azB) => {
    if (!split) return capTravel(azA, azB, dir);
    if ((a[0] > 0) !== (b[0] > 0)) return Infinity;
    const t = dir * (azB - azA);
    return t < -1e-12 ? Infinity : Math.max(0, t);
  };
  const used = new Array(segs.length).fill(false);
  const out = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    const pts = [];
    let cur = s0;
    for (let guard = 0; guard <= segs.length; guard++) {
      used[cur] = true;
      pts.push(...segs[cur].pts);
      let best = -1, bestT = Infinity;
      for (let t = 0; t < segs.length; t++) {
        if (used[t] && t !== s0) continue;
        const tr = travel(segs[cur].pts[segs[cur].pts.length - 1], segs[cur].azOut, segs[t].pts[0], segs[t].azIn);
        if (tr < bestT) { bestT = tr; best = t; }
      }
      if (best < 0) break;   // 이을 곳 없음(자료가 어긋난 경우) — 그대로 닫음
      pts.push(...capArc(c, segs[cur].pts[segs[cur].pts.length - 1], segs[best].pts[0], dir));
      if (best === s0) break;
      cur = best;
    }
    out.push(pts);
  }
  return out;
}

const capOf = (domain) => (domain.kind === 'cap' && domain.maxAngularDist != null ? domain.maxAngularDist : null);

// ---- 영역 ----------------------------------------------------------------

/** 지도 영역의 사각형들(프레임 좌표). 구드는 반구·로브별로 나누고 절개선에서 EPS 만큼 안쪽 */
export function regionRects(domain) {
  const { phiMin, phiMax } = domain;
  const cuts = domain.cuts;
  if (!cuts) return [{ l0: -PI, l1: PI, p0: phiMin, p1: phiMax }];
  const rects = [];
  const band = (bounds, p0, p1) => {
    for (let i = 0; i + 1 < bounds.length; i++) {
      rects.push({ l0: bounds[i] + (i > 0 ? EPS : 0), l1: bounds[i + 1] - (i + 2 < bounds.length ? EPS : 0), p0, p1 });
    }
  };
  if (phiMax > 0) band([-PI, ...cuts.north, PI], Math.max(0, phiMin), phiMax);
  if (phiMin < 0) band([-PI, ...cuts.south, PI], phiMin, Math.min(0, phiMax));
  return rects;
}

/** 폴리곤을 프레임 좌표로 회전하고 날짜변경선(λ′ = ±180°)에서 잘라 평면 고리들로 */
export function clipAntimeridianPolygon(poly, rotation) {
  const rings = [];
  let cur = null;
  const sink = {
    polygonStart() {}, polygonEnd() {},
    lineStart() { cur = []; },
    point(l, p) { cur.push([l, p]); },
    lineEnd() { if (cur && cur.length >= 3) rings.push(cur); cur = null; },
    sphere() { rings.push([[-PI, -PI / 2], [PI, -PI / 2], [PI, PI / 2], [-PI, PI / 2]]); },
  };
  const clip = geoClipAntimeridian(sink);
  const q = [0, 0];
  clip.polygonStart();
  for (const ring of poly) {
    clip.lineStart();
    for (const [l, p] of ring) { rotation.forward(l, p, q); clip.point(q[0], q[1]); }
    clip.lineEnd();
  }
  clip.polygonEnd();
  return rings;
}

/** 땅 고리(프레임 좌표) — 영역별로 잘라냄. [{ region: 영역 번호, ring }] (검증에서도 씀) */
export function landFrameRings(fr, data) {
  const regions = regionRects(fr.domain);
  const cap = capOf(fr.domain);
  const out = [];
  for (const poly of data.land) {
    for (const ring of clipAntimeridianPolygon(poly, fr.rotation)) {
      const dense = densify(ring, true);
      regions.forEach((r, ri) => {
        const c = clipToRect(dense, r);
        if (c.length < 3) return;
        for (const cc of cap != null ? clipToCap(c, cap) : [c]) if (cc.length >= 3) out.push({ region: ri, ring: densify(cc, true) });
      });
    }
  }
  return out;
}

/** 바다 고리(프레임 좌표) = 지도 영역 */
export function seaFrameRings(domain) {
  const cap = capOf(domain);
  const out = [];
  for (const r of regionRects(domain)) {
    const ring = densify([[r.l0, r.p0], [r.l1, r.p0], [r.l1, r.p1], [r.l0, r.p1]], true);
    for (const rr of cap != null ? clipToCap(ring, cap) : [ring]) if (rr.length >= 3) out.push(densify(rr, true));
  }
  return out;
}

/** 테두리 선(프레임 좌표). 원형 도메인은 원 하나. 구드는 적도에서 맞닿는 로브 변을 빼고 그림 */
export function outlineFrameLines(domain) {
  const cap = capOf(domain);
  if (cap != null) { const c = capCircle(cap); return [densify([...c, c[0]], false)]; }
  const lines = [];
  const cut = !!domain.cuts;
  for (const r of regionRects(domain)) {
    const bl = [r.l0, r.p0], br = [r.l1, r.p0], tr = [r.l1, r.p1], tl = [r.l0, r.p1];
    if (!(cut && r.p0 === 0)) lines.push(densify([bl, br], false));
    lines.push(densify([br, tr], false));
    if (!(cut && r.p1 === 0)) lines.push(densify([tr, tl], false));
    lines.push(densify([tl, bl], false));
  }
  return lines;
}

/** 선 자료(지리 Float64Array 목록) → 프레임 좌표로 회전·날짜변경선·절개선 분할 → 도메인 밖에서 끊음 → 촘촘히 */
export function frameLines(lines, fr) {
  const split = splitAtCuts(splitLines(lines, fr.rotation), fr.domain.cuts || null);
  const runs = [];
  for (const ln of split) {
    let cur = [];
    for (let i = 0; i < ln.length; i += 2) {
      const l = ln[i], p = ln[i + 1];
      if (inDomain(fr.domain, l, p)) cur.push([l, p]);
      else { if (cur.length >= 2) runs.push(cur); cur = []; }
    }
    if (cur.length >= 2) runs.push(cur);
  }
  return runs.map((r) => densify(r, false));
}

// ---- 투영 ----------------------------------------------------------------

const MAX_DEPTH = 14;   // 종이 공간 세분 최대 깊이(1° → 약 0.0002°)
const TOL = 1.5e-4;    // 세분 허용 오차 = 지도 폭 × TOL (3000 px 에서 0.5 px)

function proj(f, l, p) {
  const q = f(l, p);
  return Number.isFinite(q[0]) && Number.isFinite(q[1]) ? [q[0], q[1]] : null;
}

/**
 * 프레임 선분 a–b(투영 pa–pb) 사이에 종이 공간 세분 점을 out 에 넣음(양 끝 제외).
 * (λ′, φ′) 중점의 투영이 종이 현의 중점에서 tol 넘게 벗어나면 둘로 나눠 되풀이 — 대척점 근처처럼 1° 가 종이에서 크게 휘는 곳.
 * 원형 경계 위 두 점 사이(원호 점, (λ′, φ′) 중점은 원 위가 아님)는 나누지 않음.
 */
function subdivide(f, a, b, pa, pb, tol, depth, out) {
  if (tol <= 0 || depth >= MAX_DEPTH || (a.onCap && b.onCap)) return;
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const q = proj(f, m[0], m[1]);
  if (!q || Math.hypot(q[0] - (pa[0] + pb[0]) / 2, q[1] - (pa[1] + pb[1]) / 2) <= tol) return;
  subdivide(f, a, m, pa, q, tol, depth + 1, out);
  out.push(q);
  subdivide(f, m, b, q, pb, tol, depth + 1, out);
}

/** 닫힌 고리 투영(비유한 점은 뺌). 이웃한 두 유한 점 사이는 종이 공간 세분 */
function projectRing(ring, f, tol = 0) {
  const n = ring.length, P = ring.map(([l, p]) => proj(f, l, p));
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!P[i]) continue;
    out.push(P[i]);
    const j = (i + 1) % n;
    if (P[j]) subdivide(f, ring[i], ring[j], P[i], P[j], tol, 0, out);
  }
  return out;
}

/** 선은 비유한 점에서 끊어 여러 조각으로. 조각 안은 종이 공간 세분 */
function projectLine(line, f, tol = 0) {
  const out = [];
  let cur = [];
  for (let i = 0; i < line.length; i++) {
    const q = proj(f, line[i][0], line[i][1]);
    if (!q) { if (cur.length >= 2) out.push(cur); cur = []; continue; }
    if (cur.length && i > 0) subdivide(f, line[i - 1], line[i], cur[cur.length - 1], q, tol, 0, cur);
    cur.push(q);
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

function bboxOf(paths) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pts of paths) for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 현재 프레임 → 종이 좌표 경로. fr = { f, domain, rotation } (state.frame() 그대로 넘겨도 됨)
 * 반환: { sea, land (닫힌 고리), coast, graticule, outline, tissot (열린 선), bbox }
 */
export function buildMapVector(fr, data, { graticule = true, tissot = false } = {}) {
  const f = fr.f;
  const seaFrame = seaFrameRings(fr.domain);
  // 세분 허용 오차: 바다 고리를 거칠게 투영한 지도 폭 기준
  const coarse = bboxOf(seaFrame.map((r) => projectRing(r, f)));
  const span = Math.max(coarse.maxX - coarse.minX, coarse.maxY - coarse.minY);
  const tol = Number.isFinite(span) && span > 0 ? TOL * span : 0;
  const sea = seaFrame.map((r) => projectRing(r, f, tol)).filter((r) => r.length >= 3);
  const land = landFrameRings(fr, data).map(({ ring }) => projectRing(ring, f, tol)).filter((r) => r.length >= 3);
  const coast = frameLines(data.coast, fr).flatMap((ln) => projectLine(ln, f, tol));
  const grat = graticule ? frameLines(data.graticule, fr).flatMap((ln) => projectLine(ln, f, tol)) : [];
  const outline = outlineFrameLines(fr.domain).flatMap((ln) => projectLine(ln, f, tol));
  const tis = tissot ? frameLines(data.tissot, fr).flatMap((ln) => projectLine(ln, f, tol)) : [];
  return { sea, land, coast, graticule: grat, outline, tissot: tis, bbox: bboxOf(sea.length ? sea : outline) };
}
