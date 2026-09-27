// © 2026 김용현
// export/mapVector.js — PNG 저장용 벡터 경로(순수 함수, DOM 없음).
// 현재 프레임 { f, domain, rotation } 을 종이 좌표 [x, y] 경로로 만든다. 순서는 화면 파이프라인과 같다:
//   지리 (λ, φ) ──rotation.forward──▶ 프레임 (λ′, φ′) ──잘라내기·촘촘히──▶ f ──▶ (x, y)
// 잘라내기: 날짜변경선(d3 geoClipAntimeridian 폴리곤 스트림) → 영역(사각 도메인, 구드는 로브별) → 원형 도메인(방위도법).
import { geoClipAntimeridian } from 'd3-geo';
import { feature as topoFeature } from 'topojson-client';
import { coastlines, graticuleLines, splitLines, splitAtCuts } from '../geometry/clip.js';
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
  return { land: landPolygons(landTopo), coast: coastlines(landTopo), graticule: graticuleLines(15) };
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

/** 나간 점 a → 들어온 점 b 사이 원호. 두 방향 중 중점이 (λ′, φ′) 평면에서 a·b 중점에 가까운 쪽 */
function capArc(c, a, b) {
  const az0 = capAz(a);
  let d = capAz(b) - az0;
  d = (((d + PI) % (2 * PI)) + 2 * PI) % (2 * PI) - PI;
  const alt = d > 0 ? d - 2 * PI : d + 2 * PI;
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dist = (dd) => { const q = capPoint(c, az0 + dd / 2); return Math.hypot(q[0] - mid[0], q[1] - mid[1]); };
  const dd = dist(d) <= dist(alt) ? d : alt;
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

/** 원형 도메인으로 자름. 고리가 원 전체를 감싸면 원 고리 */
function clipToCap(ring, c) {
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
  const cut = clipHalf(ring, inside, cross);
  if (!cut.length) return pointInRing([0, 0], ring) ? capCircle(c) : [];
  const out = [];
  for (let i = 0; i < cut.length; i++) {
    const a = cut[i], b = cut[(i + 1) % cut.length];
    out.push(a);
    if (a.exit && b.entry) out.push(...capArc(c, a, b));
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
        let c = clipToRect(dense, r);
        if (c.length && cap != null) c = clipToCap(c, cap);
        if (c.length >= 3) out.push({ region: ri, ring: densify(c, true) });
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
    let ring = densify([[r.l0, r.p0], [r.l1, r.p0], [r.l1, r.p1], [r.l0, r.p1]], true);
    if (cap != null) ring = clipToCap(ring, cap);
    if (ring.length >= 3) out.push(densify(ring, true));
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

function projectRing(ring, f) {
  const out = [];
  for (const [l, p] of ring) {
    const q = f(l, p);
    if (Number.isFinite(q[0]) && Number.isFinite(q[1])) out.push([q[0], q[1]]);
  }
  return out;
}

/** 선은 비유한 점에서 끊어 여러 조각으로 */
function projectLine(line, f) {
  const out = [];
  let cur = [];
  for (const [l, p] of line) {
    const q = f(l, p);
    if (Number.isFinite(q[0]) && Number.isFinite(q[1])) cur.push([q[0], q[1]]);
    else { if (cur.length >= 2) out.push(cur); cur = []; }
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
 * 반환: { sea, land (닫힌 고리), coast, graticule, outline (열린 선), bbox }
 */
export function buildMapVector(fr, data, { graticule = true } = {}) {
  const f = fr.f;
  const sea = seaFrameRings(fr.domain).map((r) => projectRing(r, f)).filter((r) => r.length >= 3);
  const land = landFrameRings(fr, data).map(({ ring }) => projectRing(ring, f)).filter((r) => r.length >= 3);
  const coast = frameLines(data.coast, fr).flatMap((ln) => projectLine(ln, f));
  const grat = graticule ? frameLines(data.graticule, fr).flatMap((ln) => projectLine(ln, f)) : [];
  const outline = outlineFrameLines(fr.domain).flatMap((ln) => projectLine(ln, f));
  return { sea, land, coast, graticule: grat, outline, bbox: bboxOf(sea.length ? sea : outline) };
}
