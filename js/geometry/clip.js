// © 2026 김용현
// geometry/clip.js — 선 자료 생성(해안선·경위선·티소 원)과 절개선 재분할 (PLAN 8.4, 10.1).
//
// 모든 선은 지리좌표 (λ, φ) 라디안으로 보관한다: Float64Array [λ0, φ0, λ1, φ1, …].
// aspect 가 바뀌면 splitLines() 로 프레임 좌표 (λ', φ') 로 회전하면서 절개선(λ' = ±180°)에서 다시 나눈다.
// 분할은 d3-geo 의 geoClipAntimeridian 스트림(라디안 입출력)을 그대로 쓴다.
import { geoClipAntimeridian, geoGraticule, geoCircle } from 'd3-geo';
import { mesh as topoMesh, feature as topoFeature } from 'topojson-client';

const D = Math.PI / 180;

function ringToLine(ring) {
  const out = new Float64Array(ring.length * 2);
  for (let i = 0; i < ring.length; i++) { out[2 * i] = ring[i][0] * D; out[2 * i + 1] = ring[i][1] * D; }
  return out;
}

/** 해안선: land-110m TopoJSON 의 mesh */
export function coastlines(topo) {
  const m = topoMesh(topo, topo.objects.land);
  return m.coordinates.map(ringToLine);
}

/** 아프리카 대륙(섬 포함) 국가 — ISO 3166-1 numeric. 소말릴란드는 id 가 없어 이름으로 고른다. */
const AFRICA_IDS = new Set(['012', '024', '204', '072', '854', '108', '120', '140', '148', '178', '180', '262', '818', '226', '232', '231', '266', '270', '288', '324', '624', '384', '404', '426', '430', '434', '450', '454', '466', '478', '504', '508', '516', '562', '566', '646', '686', '694', '706', '710', '728', '729', '748', '834', '768', '788', '800', '732', '894', '716']);
export const AFRICA_FILTER = (g) => AFRICA_IDS.has(String(g.id)) || (g.properties && g.properties.name === 'Somaliland');
export const GREENLAND_FILTER = (g) => String(g.id) === '304';

/** 국가 폴리곤 — 비교 모드의 면적 계산용. countries-110m, filter(geometry) → boolean. [{ exterior, holes[] }] */
export function countryRings(topo, filter) {
  const polys = [];
  for (const g of topo.objects.countries.geometries) {
    if (!filter(g)) continue;
    const f = topoFeature(topo, g);
    const list = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of list) polys.push({ exterior: ringToLine(poly[0]), holes: poly.slice(1).map(ringToLine) });
  }
  return polys;
}

/** 15° 경위선 */
export function graticuleLines(stepDeg = 15) {
  const g = geoGraticule().step([stepDeg, stepDeg]).precision(2);
  return g().coordinates.map(ringToLine);
}

/** 경위선 교점(광선 시작점). 위도 −75°~75°, 15° 간격. 지리좌표 라디안 [λ, φ] 배열 */
export function graticuleIntersections(stepDeg = 15) {
  const pts = [];
  for (let lat = -75; lat <= 75; lat += stepDeg) {
    for (let lon = -180; lon < 180; lon += stepDeg) pts.push([lon * D, lat * D]);
  }
  pts.push([0, 90 * D], [0, -90 * D]);
  return pts;
}

/** 티소 지표: 위도 −60°~60°, 경도 30° 간격, 각반경 4° 의 36각형. { center:[λ,φ], line } */
export function tissotCircles(radiusDeg = 4) {
  const circle = geoCircle().radius(radiusDeg).precision(10);
  const out = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 30) {
      const ring = circle.center([lon, lat])().coordinates[0];
      out.push({ center: [lon * D, lat * D], line: ringToLine(ring) });
    }
  }
  return out;
}

/**
 * 회전 + 절개선 분할. lines: 지리좌표 선 배열 → 프레임 좌표 (λ', φ') 선 배열.
 * 극을 넘는 선(경선)은 d3 가 극 위의 점을 넣어 두 조각으로 나눈다.
 */
export function splitLines(lines, rotation) {
  const out = [];
  let cur = null;
  const sink = {
    lineStart() { cur = []; },
    point(l, p) { cur.push(l, p); },
    lineEnd() { if (cur && cur.length >= 4) out.push(Float64Array.from(cur)); cur = null; },
    polygonStart() {}, polygonEnd() {}, sphere() {},
  };
  const clip = geoClipAntimeridian(sink);
  const tmp = [0, 0];
  for (const line of lines) {
    clip.lineStart();
    for (let i = 0; i < line.length; i += 2) {
      rotation.forward(line[i], line[i + 1], tmp);
      clip.point(tmp[0], tmp[1]);
    }
    clip.lineEnd();
  }
  return out;
}

/**
 * 단열 도법의 절개 자오선에서 선을 나눈다(PLAN 10장 1번, 구드). cuts = { north:[λ…], south:[λ…] } 라디안.
 * 나뉜 끝점은 ε 만큼 안쪽으로 밀어 두 조각이 서로 다른 로브로 확실히 평가되게 한다.
 */
export function splitAtCuts(lines, cuts, eps = 1e-6) {
  if (!cuts) return lines;
  const out = [];
  for (const line of lines) {
    let cur = [line[0], line[1]];
    for (let i = 2; i < line.length; i += 2) {
      const l0 = line[i - 2], p0 = line[i - 1], l1 = line[i], p1 = line[i + 1];
      let best = null;
      const consider = (c, north) => {
        if (!((l0 < c && l1 > c) || (l0 > c && l1 < c))) return;
        const s = (c - l0) / (l1 - l0);
        const pc = p0 + (p1 - p0) * s;
        if ((north && pc < 0) || (!north && pc >= 0)) return; // 그 반구의 절개선이 아니다
        if (!best || s < best.s) best = { c, s, pc, dir: Math.sign(l1 - l0) };
      };
      if (p0 >= 0 || p1 >= 0) for (const c of cuts.north) consider(c, true);
      if (p0 < 0 || p1 < 0) for (const c of cuts.south) consider(c, false);
      if (best) {
        cur.push(best.c - best.dir * eps, best.pc);
        out.push(Float64Array.from(cur));
        cur = [best.c + best.dir * eps, best.pc];
      }
      cur.push(l1, p1);
    }
    if (cur.length >= 4) out.push(Float64Array.from(cur));
  }
  return out;
}

/** 점 배열을 프레임 좌표로 회전 */
export function rotatePoints(points, rotation) {
  return points.map(([l, p]) => rotation.forward(l, p, [0, 0]));
}

/**
 * 지도상 폴리곤 면적(신발끈 공식). polys: countryRings() 결과, f: 프레임 투영, rotation: aspect 회전.
 * 외곽 고리 넓이에서 구멍(예: 남아프리카 안의 레소토) 넓이를 뺀다.
 */
export function projectedArea(polys, f, rotation) {
  const q = [0, 0];
  const ringArea = (ring) => {
    let a = 0, x0 = 0, y0 = 0, xp = 0, yp = 0;
    for (let i = 0; i < ring.length; i += 2) {
      rotation.forward(ring[i], ring[i + 1], q);
      const xy = f(q[0], q[1]);
      if (i === 0) { x0 = xp = xy[0]; y0 = yp = xy[1]; continue; }
      a += xp * xy[1] - xy[0] * yp;
      xp = xy[0]; yp = xy[1];
    }
    a += xp * y0 - x0 * yp;
    return Math.abs(a) / 2;
  };
  let total = 0;
  for (const p of polys) {
    total += ringArea(p.exterior);
    for (const h of p.holes) total -= ringArea(h);
  }
  return total;
}

/** 절개선을 가로지르는 선분이 없는지(검증용) */
export function hasSeamCrossing(lines) {
  for (const line of lines) {
    for (let i = 2; i < line.length; i += 2) {
      if (Math.abs(line[i] - line[i - 2]) > Math.PI) return true;
    }
  }
  return false;
}
