// © 2026 김용현
// tests/suite.js — 검증 항목 (PLAN 12장). 브라우저(verify.html)와 Node(run.mjs)에서 같은 코드를 돌린다.
// 각 항목은 { section, name, pass, detail } 을 돌려준다.
import * as d3 from 'd3-geo';
import * as d3p from 'd3-geo-projection';
import { PROJECTIONS, domainOf, lightProjections } from '../js/projections/registry.js';
import { DERIVATIONS, stepProjection, endOfStep, equalAreaMorph } from '../js/projections/derivations.js';
import { ROBINSON_TABLE } from '../js/projections/robinsonTable.js';
import { ROBINSON_SCALE, equidistantConic, lambertConformalConic, albers } from '../js/projections/adjusted.js';
import { distortionAt } from '../js/projections/distortion.js';
import { bend, coneGeometry } from '../js/geometry/bend.js';
import { makeRotation, aspectSpec, ASPECT_PRESETS, unitVector } from '../js/geometry/rotate.js';
import { inDomain, paperPosition } from '../js/geometry/pipeline.js';
import { lightPosition } from '../js/projections/perspective.js';
import { coastlines, splitLines, splitAtCuts, hasSeamCrossing, countryRings, projectedArea, AFRICA_FILTER, GREENLAND_FILTER } from '../js/geometry/clip.js';
import { GOODE_CUTS, goodeLobeIndex, goodeHomolosine, homolosine } from '../js/projections/adjusted.js';
import { buildGridTopology, scatterTriangles, fixLobeSeams } from '../js/geometry/mesh.js';
import { makeGridParam, positionOf } from '../js/geometry/pipeline.js';
import { layoutSpacingGraph } from '../js/ui/graphLayout.js';
import * as S from '../js/state.js';

const D = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const results = [];
function report(section, name, pass, detail = '') { results.push({ section, name, pass: !!pass, detail }); }
const fmt = (v) => (Number.isFinite(v) ? v.toExponential(2) : String(v));

function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  return L;
}

// ---------------------------------------------------------------------------
// 1. 굽힘 등장성
// ---------------------------------------------------------------------------
function testBendIsometry() {
  const shapes = [
    { name: '접선 원통', surface: { type: 'cylinder' }, params: { phi0: 0 } },
    { name: '할선 원통 φ₀=30°', surface: { type: 'cylinder' }, params: { phi0: 30 * D } },
    { name: '접선 원뿔 φ₀=40°', surface: { type: 'cone' }, params: { phi1: 40 * D, phi2: null } },
    { name: '할선 원뿔 30°/60°', surface: { type: 'cone' }, params: { phi1: 30 * D, phi2: 60 * D } },
  ];
  const N = 400;
  for (const sh of shapes) {
    const g = coneGeometry(sh.surface, sh.params);
    let worst = 0, worstDesc = '';
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      let checks;
      if (g.kind === 'cylinder') {
        const r = g.r;
        const horiz = [], vert = [];
        for (let i = 0; i <= N; i++) horiz.push(bend(sh.surface, sh.params, t, -Math.PI * r + (2 * Math.PI * r * i) / N, 0.3, [0, 0, 0]));
        for (let i = 0; i <= N; i++) vert.push(bend(sh.surface, sh.params, t, 1.0, -1 + (2 * i) / N, [0, 0, 0]));
        checks = [['가로 변', polylineLength(horiz), 2 * Math.PI * r], ['세로 변', polylineLength(vert), 2]];
      } else {
        const rho = 1.2, rho0 = 0.5, rho1 = 2.0, th = 0.3 * g.n;
        const arc = [], gen = [];
        for (let i = 0; i <= N; i++) { const theta = -Math.PI * g.n + (2 * Math.PI * g.n * i) / N; arc.push(bend(sh.surface, sh.params, t, rho * Math.sin(theta), g.rhoA - rho * Math.cos(theta), [0, 0, 0])); }
        for (let i = 0; i <= N; i++) { const r = rho0 + ((rho1 - rho0) * i) / N; gen.push(bend(sh.surface, sh.params, t, r * Math.sin(th), g.rhoA - r * Math.cos(th), [0, 0, 0])); }
        checks = [['호(θ 방향)', polylineLength(arc), 2 * Math.PI * g.n * rho], ['모선(ρ 방향)', polylineLength(gen), rho1 - rho0]];
      }
      for (const [desc, got, want] of checks) {
        const err = Math.abs(got - want) / want;
        if (err > worst) { worst = err; worstDesc = `t=${t.toFixed(1)} ${desc}: ${got.toFixed(6)} vs ${want.toFixed(6)}`; }
      }
    }
    report('1. 굽힘 등장성', `${sh.name} — t 11단계 변 길이 보존`, worst < 1e-3, `최대 상대오차 ${fmt(worst)} (${worstDesc})`);
  }
}

// ---------------------------------------------------------------------------
// 2. 빛 투영 공선성
// ---------------------------------------------------------------------------
function samplePointsInDomain(domain, n = 100, seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const pts = [];
  let guard = 0;
  while (pts.length < n && guard++ < 20000) {
    const lam = (rnd() * 2 - 1) * Math.PI * 0.98;
    const phi = domain.phiMin + rnd() * (domain.phiMax - domain.phiMin);
    const p = Math.max(domain.phiMin + 1e-3, Math.min(domain.phiMax - 1e-3, phi));
    if (!inDomain(domain, lam, p)) continue;
    if (domain.maxAngularDist != null) {
      const c = Math.acos(Math.cos(p) * Math.cos(lam));
      if (c > domain.maxAngularDist - 1e-3) continue;
    }
    pts.push([lam, p]);
  }
  return pts;
}

function testCollinearity() {
  const cases = lightProjections().map((e) => ({ e, params: { ...e.params } }));
  cases.push({ e: PROJECTIONS.centralConic, params: { phi1: 30 * D, phi2: 60 * D }, label: ' (할선 30°/60°)' });
  cases.push({ e: PROJECTIONS.centralCylindrical, params: { phi0: 30 * D }, label: ' (할선 φ₀=30°)' });
  for (const { e, params, label = '' } of cases) {
    const domain = domainOf(e, params);
    const ctx = { f: (l, p) => e.forward(l, p, params), domain, surface: e.surface, params };
    const pts = samplePointsInDomain(domain, 100);
    let worst = 0;
    const Q = [0, 0, 0], P = [0, 0, 0], L = [0, 0, 0];
    for (const [l, p] of pts) {
      paperPosition(ctx, l, p, Q);
      unitVector(l, p, P);
      lightPosition(e.light, e.surface, P, L);
      const a = [P[0] - L[0], P[1] - L[1], P[2] - L[2]];
      const b = [Q[0] - L[0], Q[1] - L[1], Q[2] - L[2]];
      const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const sinAngle = Math.hypot(...cross) / (Math.hypot(...a) * Math.hypot(...b));
      if (sinAngle > worst) worst = sinAngle;
    }
    report('2. 빛 투영 공선성', `${e.nameKo}${label} — L·P·Q 공선성 (표본 ${pts.length}개)`, worst < 1e-6, `최대 sin(각) ${fmt(worst)}`);
  }
  // 펼친 중심원통 = tan φ
  let worst = 0;
  for (let lat = -70; lat <= 70; lat += 10) {
    const y = PROJECTIONS.centralCylindrical.forward(0, lat * D, { phi0: 0 })[1];
    worst = Math.max(worst, Math.abs(y - Math.tan(lat * D)));
  }
  report('2. 빛 투영 공선성', '펼친 중심원통의 y = tan φ', worst < 1e-12, `최대 오차 ${fmt(worst)}`);
}

// ---------------------------------------------------------------------------
// 3. forward vs d3
// ---------------------------------------------------------------------------
function compareGrid(name, mine, ref, domain, tol = 1e-6, note = '') {
  let worst = 0, n = 0;
  for (let lat = -90; lat <= 90; lat += 10) {
    for (let lon = -180; lon <= 180; lon += 10) {
      const l = lon * D, p = lat * D;
      if (!inDomain(domain, l, p)) continue;
      if (domain.maxAngularDist != null && Math.acos(Math.cos(p) * Math.cos(l)) > domain.maxAngularDist - 1e-6) continue;
      const a = mine(l, p), b = ref(l, p);
      if (!a.every(Number.isFinite) || !b.every(Number.isFinite)) continue;
      const err = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (err > worst) worst = err;
      n++;
    }
  }
  report('3. forward vs d3', `${name} (${n}점)${note ? ' — ' + note : ''}`, worst < tol && n > 0, `최대 오차 ${fmt(worst)}`);
}

function testForwardVsD3() {
  const P = PROJECTIONS;
  const p0 = { phi0: 0 };
  compareGrid('메르카토르', (l, p) => P.mercator.forward(l, p, p0), d3.geoMercatorRaw, P.mercator.domain);
  compareGrid('등장방형', (l, p) => P.equirectangular.forward(l, p, p0), d3.geoEquirectangularRaw, P.equirectangular.domain);
  compareGrid('밀러', (l, p) => P.miller.forward(l, p, p0), d3p.geoMillerRaw, P.miller.domain);
  compareGrid('람베르트 정적원통', (l, p) => P.lambertCylindricalEA.forward(l, p, p0), d3p.geoCylindricalEqualAreaRaw(0), P.lambertCylindricalEA.domain);
  compareGrid('중심원통', (l, p) => P.centralCylindrical.forward(l, p, p0), (l, p) => [l, Math.tan(p)], P.centralCylindrical.domain, 1e-6, 'd3 대응 없음 → 닫힌 식 y = tan φ');
  // 원뿔 (d3 관례 y = ρ(0) − ρcosθ 와 y 오프셋만 다르다)
  const conics = [
    ['정거원추', equidistantConic, d3.geoConicEquidistantRaw],
    ['람베르트 정각원추', lambertConformalConic, d3.geoConicConformalRaw],
    ['알베르스 정적원추', albers, d3.geoConicEqualAreaRaw],
  ];
  for (const [name, mine, rawF] of conics) {
    for (const params of [{ phi1: 30 * D, phi2: 60 * D }, { phi1: 40 * D, phi2: null }]) {
      const phi1 = params.phi1, phi2 = params.phi2 ?? phi1;
      const raw = rawF(phi1, phi2);
      const off = mine.d3Offset(params);
      const label = params.phi2 == null ? `접선 ${(phi1 / D).toFixed(0)}°` : `할선 ${(phi1 / D).toFixed(0)}°/${(phi2 / D).toFixed(0)}°`;
      compareGrid(`${name} ${label}`, (l, p) => mine(l, p, params), (l, p) => { const q = raw(l, p); return [q[0], q[1] - off]; }, { phiMin: -60 * D, phiMax: 89 * D, maxAngularDist: null }, 1e-6, 'y 오프셋 = d3 y(0, α)');
    }
  }
  // 중심원추 닫힌 식
  const cc = { phi1: 40 * D, phi2: null };
  compareGrid('중심원추 접선 40°', (l, p) => P.centralConic.forward(l, p, cc), (l, p) => {
    const phi0 = 40 * D, n = Math.sin(phi0);
    const rho = 1 / Math.tan(phi0) - Math.tan(p - phi0);
    return [rho * Math.sin(n * l), 1 / Math.tan(phi0) - rho * Math.cos(n * l)];
  }, domainOf(P.centralConic, cc), 1e-6, 'd3 대응 없음 → ρ = cotφ₀ − tan(φ−φ₀)');
  // 평면
  compareGrid('심사도법 (d=0)', (l, p) => P.gnomonic.forward(l, p, { d: 0 }), d3.geoGnomonicRaw, domainOf(P.gnomonic, { d: 0 }));
  compareGrid('평사도법 (d=1)', (l, p) => P.stereographic.forward(l, p, { d: 1 }), (l, p) => { const q = d3.geoStereographicRaw(l, p); return [2 * q[0], 2 * q[1]]; }, domainOf(P.stereographic, { d: 1 }), 1e-6, 'd3 는 중심 통과 평면(×½) → ×2');
  compareGrid('정사도법 (d=∞)', (l, p) => P.orthographic.forward(l, p, { d: Infinity }), d3.geoOrthographicRaw, domainOf(P.orthographic, { d: Infinity }));
  compareGrid('정거방위', (l, p) => P.azimuthalEquidistant.forward(l, p, {}), d3.geoAzimuthalEquidistantRaw, P.azimuthalEquidistant.domain);
  compareGrid('람베르트 정적방위', (l, p) => P.lambertAzimuthalEA.forward(l, p, {}), d3.geoAzimuthalEqualAreaRaw, P.lambertAzimuthalEA.domain);
  // 의사원통 · 변형 방위
  compareGrid('시뉴소이드', (l, p) => P.sinusoidal.forward(l, p, {}), d3p.geoSinusoidalRaw, P.sinusoidal.domain);
  compareGrid('몰바이데', (l, p) => P.mollweide.forward(l, p, {}), d3p.geoMollweideRaw, P.mollweide.domain);
  compareGrid('에케르트 IV', (l, p) => P.eckert4.forward(l, p, {}), d3p.geoEckert4Raw, P.eckert4.domain);
  compareGrid('Equal Earth', (l, p) => P.equalEarth.forward(l, p, {}), d3.geoEqualEarthRaw, P.equalEarth.domain);
  compareGrid('Equal Earth (PLAN 9.3 다항식)', (l, p) => P.equalEarth.forward(l, p, {}), (l, p) => {
    const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
    const th = Math.asin((Math.sqrt(3) / 2) * Math.sin(p));
    const th2 = th * th, th6 = th2 * th2 * th2;
    const y = A1 * th + A2 * th * th2 + A3 * th * th6 + A4 * th * th6 * th2;
    const x = (2 * Math.sqrt(3) * l * Math.cos(th)) / (3 * (A1 + 3 * A2 * th2 + 7 * A3 * th6 + 9 * A4 * th6 * th2));
    return [x, y];
  }, P.equalEarth.domain, 1e-9);
  compareGrid('로빈슨', (l, p) => { const q = P.robinson.forward(l, p, {}); return [q[0] / ROBINSON_SCALE, q[1] / ROBINSON_SCALE]; }, d3p.geoRobinsonRaw, P.robinson.domain, 1e-6, '정의 x = 0.8487·X·λ → ÷0.8487');
  compareGrid('빈켈 트리펠', (l, p) => P.winkelTripel.forward(l, p, {}), d3p.geoWinkel3Raw, P.winkelTripel.domain);
  compareGrid('아이토프', (l, p) => P.aitoff.forward(l, p, {}), d3p.geoAitoffRaw, P.aitoff.domain);
  // 횡축 메르카토르: 회전 + 메르카토르 합성 vs d3 geoTransverseMercatorRaw ∘ geoRotation
  const rot = makeRotation(aspectSpec('transverse', 'cylinder'));
  const d3rot = d3.geoRotation([-127, 0, 90]);
  compareGrid('횡축 메르카토르 (127°E) — R + 메르카토르 합성', (l, p) => {
    const q = rot.forward(l, p, [0, 0]);
    return P.mercator.forward(q[0], q[1], p0);
  }, (l, p) => {
    const r = d3rot([l / D, p / D]);
    const q = d3.geoTransverseMercatorRaw(r[0] * D, r[1] * D);
    return [q[1], -q[0]];
  }, { phiMin: -HALF_PI, phiMax: HALF_PI, maxAngularDist: null, kind: 'rect' }, 1e-6, 'd3 는 축을 바꿔 그림 → (y, −x)');
}

// ---------------------------------------------------------------------------
// 4. 정적 · 정각
// ---------------------------------------------------------------------------
function scanDistortion(f, domain, latMax, mode) {
  let worst = 0, n = 0;
  for (let lat = -latMax; lat <= latMax; lat += 10) {
    for (let lon = -170; lon <= 170; lon += 10) {
      const l = lon * D, p = lat * D;
      if (!inDomain(domain, l, p)) continue;
      if (domain.maxAngularDist != null && Math.acos(Math.cos(p) * Math.cos(l)) > domain.maxAngularDist - 2 * D) continue;
      const d = distortionAt(f, l, p);
      const v = mode === 'area' ? d.s : d.h / d.k;
      if (!Number.isFinite(v)) continue;
      worst = Math.max(worst, Math.abs(v - 1));
      n++;
    }
  }
  return { worst, n };
}

function testDistortion() {
  const P = PROJECTIONS;
  const ea = [
    ['람베르트 정적원통', P.lambertCylindricalEA, { phi0: 0 }, 80],
    ['알베르스 정적원추 30°/60°', P.albers, { phi1: 30 * D, phi2: 60 * D }, 80],
    ['람베르트 정적방위', P.lambertAzimuthalEA, {}, 80],
    ['시뉴소이드', P.sinusoidal, {}, 80],
    ['몰바이데', P.mollweide, {}, 80],
    ['에케르트 IV', P.eckert4, {}, 80],
    ['Equal Earth', P.equalEarth, {}, 80],
  ];
  for (const [name, e, params, latMax] of ea) {
    const r = scanDistortion((l, p) => e.forward(l, p, params), domainOf(e, params), latMax, 'area');
    report('4. 정적·정각', `${name} — 면적배율 = 1 ± 0.01 (${r.n}점)`, r.worst < 0.01, `최대 |s−1| ${fmt(r.worst)}`);
  }
  const conf = [
    ['메르카토르', P.mercator, { phi0: 0 }, 80],
    ['평사도법', P.stereographic, { d: 1 }, 80],
    ['람베르트 정각원추 30°/60°', P.lambertConformalConic, { phi1: 30 * D, phi2: 60 * D }, 80],
  ];
  for (const [name, e, params, latMax] of conf) {
    const r = scanDistortion((l, p) => e.forward(l, p, params), domainOf(e, params), latMax, 'conformal');
    report('4. 정적·정각', `${name} — h/k = 1 ± 0.01 (${r.n}점)`, r.worst < 0.01, `최대 |h/k−1| ${fmt(r.worst)}`);
  }
  // 횡축 메르카토르: 합성 f(R(λ,φ)) 로 검사
  {
    const rot = makeRotation(aspectSpec('transverse', 'cylinder'));
    const dom = P.transverseMercator.domain;
    const f = (l, p) => { const q = rot.forward(l, p, [0, 0]); return P.mercator.forward(q[0], q[1], { phi0: 0 }); };
    let worst = 0, n = 0;
    for (let lat = -80; lat <= 80; lat += 10) for (let lon = -170; lon <= 170; lon += 10) {
      const q = rot.forward(lon * D, lat * D, [0, 0]);
      if (!inDomain(dom, q[0], q[1]) || Math.abs(q[1]) > 80 * D || Math.abs(q[0]) > 175 * D) continue; // 절개선 근처는 차분이 끊긴다
      const d = distortionAt(f, lon * D, lat * D);
      worst = Math.max(worst, Math.abs(d.h / d.k - 1)); n++;
    }
    report('4. 정적·정각', `횡축 메르카토르 — 합성 h/k = 1 ± 0.01 (${n}점)`, worst < 0.01 && n > 0, `최대 |h/k−1| ${fmt(worst)}`);
  }
  // 티소 지표 위치(−60~60°, 30° 간격)에서 메르카토르 h/k
  {
    let worst = 0;
    for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 30) {
      const d = distortionAt((l, p) => P.mercator.forward(l, p, { phi0: 0 }), lon * D, lat * D);
      worst = Math.max(worst, Math.abs(d.h / d.k - 1));
    }
    report('4. 정적·정각', '메르카토르 — 티소 지표 60개 모두 h/k = 1 ± 0.01', worst < 0.01, `최대 |h/k−1| ${fmt(worst)}`);
  }
}

// ---------------------------------------------------------------------------
// 5. equalAreaFamily 중간 프레임
// ---------------------------------------------------------------------------
function testEqualAreaFamily() {
  const P = PROJECTIONS;
  const fA = (l, p) => P.lambertCylindricalEA.forward(l, p, { phi0: 0 });
  for (const target of ['equalEarth', 'sinusoidal', 'mollweide', 'eckert4']) {
    const fB = (l, p) => P[target].forward(l, p, {});
    let worst = 0, worstT = 0;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const f = t >= 1 ? fB : equalAreaMorph(fA, fB, t);
      const r = scanDistortion(f, P[target].domain, 85, 'area');
      if (r.worst > worst) { worst = r.worst; worstT = t; }
    }
    report('5. 정적성 보존 모핑', `람베르트 정적원통 → ${P[target].nameKo} — t = 0, .25, .5, .75, 1 면적배율 = 1 ± 0.01`, worst < 0.01, `최대 |s−1| ${fmt(worst)} (t=${worstT})`);
  }
}

// ---------------------------------------------------------------------------
// 6. 로빈슨 표
// ---------------------------------------------------------------------------
function testRobinsonTable() {
  const YK = 1.593415793900743; // d3 의 y 배율 (= 1.3523 / 0.8487, 반올림 차이 3e-5)
  let worstX = 0, worstY = 0;
  for (const [deg, X, Y] of ROBINSON_TABLE) {
    const q = d3p.geoRobinsonRaw(1, deg * D);
    worstX = Math.max(worstX, Math.abs(q[0] - X));
    worstY = Math.max(worstY, Math.abs(q[1] - Y * YK));
  }
  report('6. 로빈슨 표', `표 19행의 X(φ) = geoRobinsonRaw(1, φ).x`, worstX < 1e-9, `최대 오차 ${fmt(worstX)}`);
  report('6. 로빈슨 표', `표 19행의 Y(φ)·1.5934 = geoRobinsonRaw(0, φ).y`, worstY < 1e-9, `최대 오차 ${fmt(worstY)}`);
  report('6. 로빈슨 표', `1.3523 / 0.8487 ≈ d3 배율 1.593416`, Math.abs(1.3523 / 0.8487 - YK) < 1e-4, `차이 ${fmt(Math.abs(1.3523 / 0.8487 - YK))}`);
}

// ---------------------------------------------------------------------------
// 7. aspect 회전
// ---------------------------------------------------------------------------
function testRotation() {
  let worstOrtho = 0, worstInv = 0, worstCenter = 0;
  for (const aspect of Object.keys(ASPECT_PRESETS)) {
    for (const type of ['cylinder', 'cone', 'plane']) {
      const rot = makeRotation(aspectSpec(aspect, type));
      const M = rot.M;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        let dot = 0;
        for (let k = 0; k < 3; k++) dot += M[3 * i + k] * M[3 * j + k];
        worstOrtho = Math.max(worstOrtho, Math.abs(dot - (i === j ? 1 : 0)));
      }
      const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
      worstOrtho = Math.max(worstOrtho, Math.abs(det - 1));
      for (let lat = -80; lat <= 80; lat += 20) for (let lon = -180; lon < 180; lon += 30) {
        const q = rot.forward(lon * D, lat * D, [0, 0]);
        const b = rot.inverse(q[0], q[1], [0, 0]);
        const va = unitVector(lon * D, lat * D), vb = unitVector(b[0], b[1]);
        worstInv = Math.max(worstInv, Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]));
      }
      const spec = aspectSpec(aspect, type);
      const c = rot.forward(spec.center[0] * D, spec.center[1] * D, [0, 0]);
      worstCenter = Math.max(worstCenter, Math.hypot(c[0], c[1]));
    }
  }
  report('7. aspect 회전', '모든 프리셋의 M 이 회전행렬(직교, det=1)', worstOrtho < 1e-12, `최대 오차 ${fmt(worstOrtho)}`);
  report('7. aspect 회전', 'R⁻¹∘R = 항등', worstInv < 1e-12, `최대 오차 ${fmt(worstInv)}`);
  report('7. aspect 회전', '지도 중심 C 가 프레임 (0, 0) 으로 감', worstCenter < 1e-12, `최대 오차 ${fmt(worstCenter)}`);
  const id = makeRotation(aspectSpec('normal', 'cylinder'));
  report('7. aspect 회전', '정축 원통 = 항등 회전', id.isIdentity, '');
  // 횡축 원통: 프레임의 +x'(종이 가로) 방향이 지리적 북쪽인가 (127°E, 0°에서 북으로 1° 이동 → λ' 증가)
  const tr = makeRotation(aspectSpec('transverse', 'cylinder'));
  const a = tr.forward(127 * D, 0, [0, 0]), b = tr.forward(127 * D, 1 * D, [0, 0]);
  report('7. aspect 회전', '횡축 원통: 127°E 자오선을 따라 북쪽 = 종이 +x 방향', b[0] - a[0] > 0 && Math.abs(b[1] - a[1]) < 1e-9, `Δλ'=${fmt(b[0] - a[0])} Δφ'=${fmt(b[1] - a[1])}`);
}

// ---------------------------------------------------------------------------
// 8. 절개선 재분할 · 9. 면적비
// ---------------------------------------------------------------------------
function testClipAndArea(land, countries) {
  if (!land) { report('8. 절개선 재분할', 'data/land-110m.json 로드', false, '파일 없음'); return; }
  const lines = coastlines(land);
  for (const aspect of ['normal', 'transverse', 'oblique']) {
    for (const type of ['cylinder', 'plane']) {
      const rot = makeRotation(aspectSpec(aspect, type));
      const split = splitLines(lines, rot);
      report('8. 절개선 재분할', `해안선 ${aspect}/${type}: 절개선을 가로지르는 선분 없음 (${lines.length} → ${split.length}개 선)`, !hasSeamCrossing(split) && split.length >= lines.length, '');
    }
  }
  if (!countries) { report('9. 면적비', 'data/countries-110m.json 로드', false, '파일 없음'); return; }
  const gl = countryRings(countries, GREENLAND_FILTER), af = countryRings(countries, AFRICA_FILTER);
  const trueRatio = d3.geoArea({ type: 'MultiPolygon', coordinates: polysToDeg(af) }) / d3.geoArea({ type: 'MultiPolygon', coordinates: polysToDeg(gl) });
  report('9. 면적비', `구면 실제 면적비 그린란드 : 아프리카 = 1 : ${trueRatio.toFixed(2)} (110m 자료, 참고)`, trueRatio > 12 && trueRatio < 16, '');
  const id = makeRotation(aspectSpec('normal', 'cylinder'));
  const P = PROJECTIONS;
  const ratio = (e, params) => projectedArea(af, (l, p) => e.forward(l, p, params), id) / projectedArea(gl, (l, p) => e.forward(l, p, params), id);
  const ee = ratio(P.equalEarth, {});
  report('9. 면적비', `Equal Earth 지도상 면적비 = 1 : ${ee.toFixed(2)} (14 ± 5%)`, Math.abs(ee - 14) / 14 < 0.05, '');
  const mc = ratio(P.mercator, { phi0: 0 }), rb = ratio(P.robinson, {});
  report('9. 면적비', `메르카토르 1 : ${mc.toFixed(2)},  로빈슨 1 : ${rb.toFixed(2)} (참고)`, mc < 3 && rb > 5 && rb < 14, '');
}

function polysToDeg(polys) {
  const ringToDeg = (r) => { const ring = []; for (let i = 0; i < r.length; i += 2) ring.push([r[i] / D, r[i + 1] / D]); return ring; };
  return polys.map((p) => [ringToDeg(p.exterior), ...p.holes.map(ringToDeg)]);
}

// ---------------------------------------------------------------------------
// 10. 조정 시나리오 연결
// ---------------------------------------------------------------------------
function testDerivations() {
  for (const [id, deriv] of Object.entries(DERIVATIONS)) {
    const owner = Object.values(PROJECTIONS).find((e) => e.derivation === id);
    const params = { ...PROJECTIONS[deriv.root].params, ...(owner ? owner.params : {}) };
    const root = PROJECTIONS[deriv.root];
    const start = stepProjection(deriv, 0, 0, params);
    let worstStart = 0, worstEnd = 0, finiteFail = 0;
    const last = deriv.steps.length - 1;
    const end = stepProjection(deriv, last, 1, params);
    const dom = end.domain;
    for (let lat = -80; lat <= 80; lat += 20) for (let lon = -160; lon <= 160; lon += 40) {
      const l = lon * D, p = lat * D;
      if (inDomain(start.domain, l, p)) {
        const a = start.f(l, p), b = root.forward(l, p, params);
        if (a.every(Number.isFinite) && b.every(Number.isFinite)) worstStart = Math.max(worstStart, Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
      if (owner && inDomain(dom, l, p) && (dom.maxAngularDist == null || Math.acos(Math.cos(p) * Math.cos(l)) < dom.maxAngularDist - 2 * D)) {
        const a = end.f(l, p), b = owner.forward(l, p, params);
        if (a.every(Number.isFinite) && b.every(Number.isFinite)) worstEnd = Math.max(worstEnd, Math.hypot(a[0] - b[0], a[1] - b[1]));
        for (let k = 0; k <= last; k++) {
          const mid = stepProjection(deriv, k, 0.5, params);
          if (!inDomain(mid.domain, l, p)) continue;
          const q = mid.f(l, p);
          if (!q.every(Number.isFinite)) finiteFail++;
        }
      }
    }
    report('10. 조정 시나리오', `${id}: 0단계 t=0 은 root(${root.nameKo}), 마지막 단계 t=1 은 ${owner ? owner.nameKo : '?'}, 중간 프레임 유한`, worstStart < 1e-9 && worstEnd < 1e-9 && finiteFail === 0, `시작 오차 ${fmt(worstStart)}, 끝 오차 ${fmt(worstEnd)}, 비유한 ${finiteFail}`);
  }
}

// ---------------------------------------------------------------------------
// 11. 구드 호몰로사인 (M6): d3 대응, 절개선 분할, 로브 경계를 걸치는 삼각형·선분 없음
// ---------------------------------------------------------------------------
function nearCut(lam, phi, margin = 3 * D) {
  const list = phi >= 0 ? GOODE_CUTS.north : GOODE_CUTS.south;
  return list.some((c) => Math.abs(lam - c) < margin) || Math.abs(Math.abs(lam) - Math.PI) < margin;
}

function testGoode(land) {
  // d3 의 단열 호몰로사인 투영(scale 1, y 반전)과 비교. 절개선 위의 점은 로브 귀속 관례가 달라 제외.
  const proj = d3p.geoInterruptedHomolosine().scale(1).translate([0, 0]);
  let worst = 0, n = 0;
  for (let lat = -85; lat <= 85; lat += 10) for (let lon = -175; lon <= 175; lon += 10) {
    const l = lon * D, p = lat * D;
    if (nearCut(l, p, 0.5 * D)) continue;
    const a = goodeHomolosine(l, p), q = proj([lon, lat]);
    worst = Math.max(worst, Math.hypot(a[0] - q[0], a[1] + q[1])); n++;
  }
  report('11. 구드 호몰로사인', `단열 forward vs d3.geoInterruptedHomolosine (${n}점)`, worst < 1e-6, `최대 오차 ${fmt(worst)}`);
  // 비단열 vs d3 raw, 40°44′ 이음매 연속
  let seam = 0;
  for (let lon = -170; lon <= 170; lon += 10) {
    const a = homolosine(lon * D, 0.7109889596207567 - 1e-7), b = homolosine(lon * D, 0.7109889596207567 + 1e-7);
    seam = Math.max(seam, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  report('11. 구드 호몰로사인', '비단열 호몰로사인의 40°44′ 이음매 연속 (x 불연속 없음)', seam < 1e-4, `최대 틈 ${fmt(seam)}`);
  // 정적성 (절개선 근처 제외)
  let worstS = 0, ns = 0;
  for (let lat = -80; lat <= 80; lat += 10) for (let lon = -170; lon <= 170; lon += 10) {
    const l = lon * D, p = lat * D;
    if (nearCut(l, p) || Math.abs(Math.abs(p) - 0.7109889596207567) < 2 * D) continue;
    const d = distortionAt(goodeHomolosine, l, p);
    worstS = Math.max(worstS, Math.abs(d.s - 1)); ns++;
  }
  report('11. 구드 호몰로사인', `면적배율 = 1 ± 0.01 (절개선·이음매 근처 제외, ${ns}점)`, worstS < 0.01, `최대 |s−1| ${fmt(worstS)}`);
  // 선 분할: 같은 반구의 두 끝점은 같은 로브
  if (land) {
    const lines = splitAtCuts(splitLines(coastlines(land), makeRotation(aspectSpec('normal', 'cylinder'))), GOODE_CUTS);
    let bad = 0, segs = 0;
    for (const line of lines) for (let i = 2; i < line.length; i += 2) {
      const p0 = line[i - 1], p1 = line[i + 1];
      if ((p0 >= 0) !== (p1 >= 0)) continue;
      segs++;
      if (goodeLobeIndex(line[i - 2], p0) !== goodeLobeIndex(line[i], p1)) bad++;
    }
    report('11. 구드 호몰로사인', `해안선 절개선 분할: 로브 경계를 걸치는 선분 없음 (${segs}개 선분)`, bad === 0, `걸침 ${bad}`);
  }
  // 격자 메시: 절개 모핑 t = 0.5, 1 에서 로브 경계를 걸치는 삼각형 없음
  const deriv = DERIVATIONS.goodeFromParts;
  const params = { phi0: 0 };
  const topo = buildGridTopology(180, 90);
  const gridPos = new Float32Array(topo.count * 3), gridLatLon = new Float64Array(topo.count * 2), tri = new Float32Array(topo.tris.length * 3);
  for (const t of [0.5, 1]) {
    const sp = stepProjection(deriv, 2, t, params);
    const ctx = { f: sp.f, domain: sp.domain, surface: { type: 'cylinder' }, params, light: null, bendT: 0, s: 1, rayReach: 1 };
    const param = makeGridParam(sp.domain);
    const g = [0, 0], p = [0, 0, 0];
    for (let k = 0; k < topo.count; k++) {
      param.toGeo(topo.uv[2 * k], topo.uv[2 * k + 1], g);
      positionOf(ctx, g[0], g[1], p);
      gridPos[3 * k] = p[0]; gridPos[3 * k + 1] = p[1]; gridPos[3 * k + 2] = p[2];
      gridLatLon[2 * k] = g[0]; gridLatLon[2 * k + 1] = g[1];
    }
    scatterTriangles(gridPos, topo.tris, tri);
    const fixed = fixLobeSeams(gridLatLon, topo.tris, tri, sp.domain.cuts, (l, ph, out) => positionOf(ctx, l, ph, out));
    let longest = 0;
    for (let i = 0; i < tri.length; i += 9) {
      for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
        const e = Math.hypot(tri[i + a] - tri[i + b], tri[i + a + 1] - tri[i + b + 1], tri[i + a + 2] - tri[i + b + 2]);
        if (e > longest) longest = e;
      }
    }
    // 로브를 걸치면 이웃 중앙경선 차이(≥ 40° = 0.7) 만큼 길어진다. 극 근처 몰바이데 삼각형은 정상적으로 0.12 정도.
    report('11. 구드 호몰로사인', `격자 메시 t=${t}: 로브 경계를 걸치는 삼각형 없음 (보정 ${fixed}개, 최장 변 ${longest.toFixed(3)})`, fixed > 0 && longest < 0.3, '');
  }
}

// ---------------------------------------------------------------------------
// 12. 측면 패널 간격 그래프: 축 이름·눈금·최댓값·범례 글자가 서로 겹치지 않고 캔버스 안에 들어와야 한다.
// 글자 폭은 Pretendard 11px 근사치(한글 11, 숫자·영문 6.2, 기호 축소)로 잰다.
function estimateTextWidth(text) {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 0x3000) w += 11;                 // 한글·CJK
    else if (ch === '°') w += 4.5;
    else if (ch === '(' || ch === ')' || ch === ' ' || ch === '.') w += 3.5;
    else w += 6.2;
  }
  return w;
}
function rectsOverlap(a, b) {
  return a.left < b.left + b.w && b.left < a.left + a.w && a.top < b.top + b.h && b.top < a.top + a.h;
}
function testGraphLabels() {
  const legend = [{ label: '출발', color: '#aab' }, { label: '목표', color: '#7ea' }, { label: '현재', color: '#fd6' }];
  const cases = [
    { name: '원통·원뿔 (φ, y = −3.2…3.2)', xLabel: 'φ', yLabel: 'y(φ)', ticks: [-90, -45, 0, 45, 90], x0: -90, x1: 90, ymin: -3.2, ymax: 3.2 },
    { name: '원통·원뿔 (φ, y = −0.5…1.0)', xLabel: 'φ', yLabel: 'y(φ)', ticks: [-90, -45, 0, 45, 90], x0: -90, x1: 90, ymin: -0.5, ymax: 1.0 },
    { name: '방위 (c, r = 0…4.0)', xLabel: 'c (접점 각거리)', yLabel: 'r(c)', ticks: [0, 60, 120, 180], x0: 0, x1: 180, ymin: 0, ymax: 4 },
  ];
  for (const c of cases) {
    const W = 300, H = 180;
    const L = layoutSpacingGraph({ W, H, ...c, legend, measure: estimateTextWidth });
    const boxes = [...L.texts, ...L.swatches.map((s) => ({ role: 'swatch', text: '■', left: s.x, top: s.y, w: s.w, h: s.h }))];
    const outside = boxes.filter((b) => b.left < 0 || b.top < 0 || b.left + b.w > W || b.top + b.h > H);
    report('12. 간격 그래프 글자', `${c.name}: 모든 글자가 캔버스 안`, outside.length === 0,
      outside.map((b) => `${b.role} "${b.text}" [${b.left.toFixed(0)}..${(b.left + b.w).toFixed(0)}]`).join(', '));
    const pairs = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (rectsOverlap(boxes[i], boxes[j])) pairs.push(`${boxes[i].role} "${boxes[i].text}" × ${boxes[j].role} "${boxes[j].text}"`);
    }
    report('12. 간격 그래프 글자', `${c.name}: 겹치는 글자 없음`, pairs.length === 0, pairs.join(', '));
  }
}

// ---------------------------------------------------------------------------
// 13. 리모컨 재생 상태: 일시정지·이전·스크럽은 진행을 그 자리에서 멈춰야 한다 — 자동 재생의 "한 단계 끝 → 1초 뒤 다음 단계" 대기 중에도.
function testPlayback() {
  const sec = '13. 리모컨 재생';
  const run = (secs) => { for (let i = 0; i < secs / 0.05; i++) S.tick(0.05); };
  const finishStep = () => { S.setState({ autoplay: true }); S.goTo('wrap', 0, 0.9, true); run(0.5); };   // 씌우기 2.4초 → 0.1 남음 → 끝나고 대기 시작
  S.selectProjection('mercator');
  // (a) 대기 중 상태는 "진행 중"으로 보여야 한다(일시정지 아이콘)
  finishStep();
  let s = S.getState();
  report(sec, '단계 끝 → 자동 재생 대기 중 = 진행 중(isRunning)', s.t >= 1 && s.stage === 'wrap' && typeof S.isRunning === 'function' && S.isRunning(), `t=${s.t} stage=${s.stage}`);
  // (b) 대기 중 일시정지 → 다음 단계로 넘어가지 않고 그 자리(t = 1)에 머문다
  S.togglePlay(); run(2);
  s = S.getState();
  report(sec, '대기 중 일시정지 → 씌우기 t=1 에 머묾(다음 단계로 점프 없음)', s.stage === 'wrap' && s.t >= 1 && !s.playing, `stage=${s.stage} t=${s.t} playing=${s.playing}`);
  // (c) 대기 중 이전 → 처음으로 되돌린 뒤 자동으로 다음 단계로 넘어가지 않는다
  finishStep(); S.prev(); run(2);
  s = S.getState();
  report(sec, '대기 중 이전 → 씌우기 t=0 에 머묾', s.stage === 'wrap' && s.t === 0 && !s.playing, `stage=${s.stage} t=${s.t}`);
  // (d) 대기 중 스크럽 → 그 위치에 머문다
  finishStep(); S.setT(0.5); run(2);
  s = S.getState();
  report(sec, '대기 중 스크럽 0.5 → 씌우기 t=0.5 에 머묾', s.stage === 'wrap' && Math.abs(s.t - 0.5) < 1e-9 && !s.playing, `stage=${s.stage} t=${s.t}`);
  // (e) 개입이 없으면 자동 재생은 여전히 다음 단계로 이어진다
  finishStep(); run(2);
  s = S.getState();
  report(sec, '개입 없음 → 1초 뒤 다음 단계(빛 투영) 재생', s.stage === 'project' && s.playing === 1, `stage=${s.stage} playing=${s.playing}`);
  // (f) 재생 중 일시정지 → 그 자리
  S.goTo('wrap', 0, 0, true); run(1); S.pause(); const tp = S.getState().t; run(1);
  s = S.getState();
  report(sec, '재생 중 일시정지 → 그 자리에 머묾', s.stage === 'wrap' && s.t === tp && tp > 0 && tp < 1, `t=${s.t}`);
  S.pause(); S.goTo('flat', 0, 0, false);
}

// ---------------------------------------------------------------------------
export async function runAll({ loadJSON } = {}) {
  results.length = 0;
  testBendIsometry();
  testCollinearity();
  testForwardVsD3();
  testDistortion();
  testEqualAreaFamily();
  testRobinsonTable();
  testRotation();
  testDerivations();
  let land = null, countries = null;
  if (loadJSON) {
    try { land = await loadJSON('data/land-110m.json'); countries = await loadJSON('data/countries-110m.json'); } catch (e) { /* 아래에서 보고 */ }
  }
  testClipAndArea(land, countries);
  testGoode(land);
  testGraphLabels();
  testPlayback();
  return results.slice();
}
