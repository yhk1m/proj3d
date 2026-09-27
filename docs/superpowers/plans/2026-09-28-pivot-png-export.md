# 회전 중심 표시 · PNG 저장 모달 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D 뷰에 회전 중심(빨간 점)을 표시하고 더블클릭·두 번 탭으로 옮기며 숨길 수 있게 하고, 지금 종이에 그려진 지도를 투명 배경·두 색(#000/#fff) PNG 로 저장하는 모달(채우기·색 반전·경위선)을 추가한다.

**Architecture:** 회전 중심은 `js/scene/pivot.js`(three.js 표시 + 레이캐스트)와 `js/util/doubleTap.js`(순수 판정). PNG 는 `js/export/mapVector.js`(현재 프레임 → 종이 좌표 벡터 경로, 순수 함수) → `js/export/drawMap.js`(캔버스 2D 그리기, 색 규칙) → `js/ui/exportModal.js`(모달 DOM). 벡터 경로는 화면과 같은 순서로 만든다: 지리 (λ,φ) → `rotation.forward` → 날짜변경선·도메인·구드 로브·원형 도메인에서 잘라내기 → 1° 간격으로 촘촘히 → `f`.

**Tech Stack:** 빌드 없는 ES 모듈, three.js r0.186(CDN import map), d3-geo 3.1.1(`geoClipAntimeridian`), topojson-client 3.1.0, Node 테스트(`npm test` = `node tests/run.mjs`, `tests/suite.js` 의 `report(section, name, pass, detail)`).

**Spec:** `docs/superpowers/specs/2026-09-28-pivot-png-export-design.md`

**공통 규칙**
- 새 JS 파일 첫 줄은 `// © 2026 김용현` (전역 훅이 자동 삽입, 지우지 말 것).
- UI 문구는 명사형 어미, 이모지 금지.
- 커밋은 해당 태스크 파일만 `git add <경로>` (절대 `git add -A` 금지). 커밋 메시지에 Co-Authored-By 넣지 않음.
- localStorage 읽기·쓰기는 모두 try/catch.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| Create `js/util/doubleTap.js` | 두 번 탭 판정 순수 함수 |
| Create `js/scene/pivot.js` | `PivotMarker`(빨간 점), `installPivotPicking`(더블클릭·두 번 탭 → 레이캐스트) |
| Create `js/export/mapVector.js` | `prepareMapData`, `regionRects`, `landFrameRings`, `buildMapVector` 등 벡터 경로 |
| Create `js/export/drawMap.js` | `LONG_SIDE`, `exportColors`, `layoutFor`, `drawMapVector` |
| Create `js/ui/exportModal.js` | `createExportModal({ landTopo, getFrame })` → `{ open() }` |
| Modify `js/main.js` | 중심점·체크박스·레이캐스트 연결, 모달 생성·유틸 버튼 연결 |
| Modify `js/ui/controls.js:172-204` | `mountUtilControls(container, { onExport })` 에 「PNG 저장」 칩 |
| Modify `css/style.css` | `.vcheck`, `.modal-backdrop`, `.modal*` |
| Modify `tests/suite.js` | 15장 「PNG 벡터」, 16장 「두 번 탭」 |
| Modify `CHANGELOG.md` | 변경 기록 |

---

### Task 1: 두 번 탭 판정 (`doubleTap.js`)

**Files:**
- Create: `js/util/doubleTap.js`
- Test: `tests/suite.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/suite.js` 맨 위 import 들 아래에 추가:

```js
import { isDoubleTap } from '../js/util/doubleTap.js';
```

`// 13.` 구획 주석 바로 앞(다른 test 함수들 사이)에 추가:

```js
// ---------------------------------------------------------------------------
// 16. 두 번 탭
// ---------------------------------------------------------------------------
function testDoubleTap() {
  const a = { t: 1000, x: 100, y: 100 };
  const cases = [
    [isDoubleTap(a, { t: 1250, x: 110, y: 95 }), true, '250 ms · 11 px → 두 번 탭'],
    [isDoubleTap(a, { t: 1400, x: 100, y: 100 }), false, '400 ms → 아님'],
    [isDoubleTap(a, { t: 1100, x: 150, y: 100 }), false, '50 px → 아님'],
    [isDoubleTap(null, a), false, '앞 탭 없음 → 아님'],
  ];
  const bad = cases.filter(([got, want]) => got !== want).map(([, , name]) => name);
  report('16. 두 번 탭', '320 ms · 32 px 안의 두 탭만 두 번 탭 (4경우)', bad.length === 0, bad.join(', '));
}
```

`runAll` 안 `testGraticule();` 다음 줄에 `testDoubleTap();` 추가.

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: 모듈을 찾지 못한다는 오류(`Cannot find module ... doubleTap.js`)로 실패.

- [ ] **Step 3: 구현**

`js/util/doubleTap.js`:

```js
// © 2026 김용현
// util/doubleTap.js — 두 번 탭 판정(터치). 앞 탭 a, 이번 탭 b: { t(ms), x, y(px) }
export function isDoubleTap(a, b, { ms = 320, px = 32 } = {}) {
  if (!a || !b) return false;
  const dt = b.t - a.t;
  return dt >= 0 && dt <= ms && Math.hypot(b.x - a.x, b.y - a.y) <= px;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: `PASS  320 ms · 32 px 안의 두 탭만 두 번 탭 (4경우)`, 마지막 줄 `112/112 통과`.

- [ ] **Step 5: 커밋**

```bash
git add js/util/doubleTap.js tests/suite.js
git commit -m "두 번 탭 판정 순수 함수(doubleTap.js)와 검증 16장"
```

---

### Task 2: 회전 중심 표시·더블클릭 이동 (`pivot.js` + main 연결)

**Files:**
- Create: `js/scene/pivot.js`
- Modify: `js/main.js` (import, `mountViewTools`, 씬 구성, 루프)
- Modify: `css/style.css` (`#viewtools` 규칙 바로 아래)

three.js 를 쓰므로 Node 테스트 없음 — Step 5 에서 실제 브라우저로 확인.

- [ ] **Step 1: `js/scene/pivot.js` 작성**

```js
// © 2026 김용현
// scene/pivot.js — 회전 중심(OrbitControls target) 표시, 더블클릭(마우스)·두 번 탭(터치)으로 옮기기.
// e-GIS 3D 와 같은 방식: 빨간 점을 항상 맨 위에, 화면상 크기 일정. 옮기면 카메라는 제자리에서 새 중심을 바라봄.
import * as THREE from 'three';
import { isDoubleTap } from '../util/doubleTap.js';

export class PivotMarker {
  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 }),
    );
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;
  }

  /** 매 프레임: 중심으로 옮기고 카메라 거리에 비례해 크기를 바꿔 화면상 크기를 일정하게 */
  update(camera, target) {
    this.mesh.position.copy(target);
    this.mesh.scale.setScalar(Math.max(camera.position.distanceTo(target) / 150, 1e-3));
  }
}

/** 자신과 조상이 모두 보이는지 */
function shown(o) {
  for (let x = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

/**
 * canvas 더블클릭·두 번 탭 → getTargets() 메시에 레이캐스트 → 맞은 점을 onPick(Vector3) 로.
 * 빈 공간이면 아무 일 없음.
 */
export function installPivotPicking(canvas, camera, getTargets, onPick) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(getTargets().filter(shown), false)[0];
    if (hit) onPick(hit.point.clone());
  };
  canvas.addEventListener('dblclick', (e) => pick(e.clientX, e.clientY));
  let lastTap = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const tap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    if (isDoubleTap(lastTap, tap)) { lastTap = null; pick(e.clientX, e.clientY); } else lastTap = tap;
  });
}
```

- [ ] **Step 2: `js/main.js` 수정**

(a) import 추가 — `import { CameraRig } from './scene/camera.js';` 다음 줄:

```js
import { PivotMarker, installPivotPicking } from './scene/pivot.js';
```

(b) `mountViewTools` 를 아래로 교체(체크박스·안내 문구 추가):

```js
/** 뷰포트 위 시점 도구: 자동 맞춤 · 확대 · 축소 · 중심점 숨기기 + 조작 안내 */
function mountViewTools(viewport, rig, { hidePivot, onHidePivot }) {
  const box = document.createElement('div');
  box.id = 'viewtools';
  const mk = (title, svg, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'vbtn'; b.title = title; b.innerHTML = svg;
    b.addEventListener('click', fn);
    box.appendChild(b);
    return b;
  };
  const fitBtn = mk('시점 자동 맞춤 — 단계마다 광원·지구본·종이가 보이게 카메라를 맞춤 (드래그하면 해제)', ICONS.fit, () => rig.fit());
  mk('확대', ICONS.plus, () => rig.zoom(0.8));
  mk('축소', ICONS.minus, () => rig.zoom(1.25));
  const lab = document.createElement('label');
  lab.className = 'vcheck';
  lab.title = '회전 중심(빨간 점) 숨기기 — 지구본·종이를 더블클릭하면 그 지점이 회전 중심';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = hidePivot;
  cb.addEventListener('change', () => onHidePivot(cb.checked));
  const sp = document.createElement('span');
  sp.textContent = '중심점 숨기기';
  lab.append(cb, sp);
  box.appendChild(lab);
  const hint = document.createElement('div');
  hint.className = 'vhint';
  hint.textContent = '드래그 회전 · 휠 확대/축소 · 오른쪽 드래그 이동 · 더블클릭 회전 중심 이동 · 시점이 흐트러지면 왼쪽 위 맞춤 버튼';
  viewport.append(box, hint);
  return { fitBtn };
}
```

(c) `const rays = new Rays();` 줄 바로 앞에 회전 중심 표시 추가:

```js
  const pivot = new PivotMarker();
  scene.add(pivot.mesh);
  const PIVOT_KEY = 'proj3d.hidePivot';
  let hidePivot = false;
  try { hidePivot = localStorage.getItem(PIVOT_KEY) === '1'; } catch (e) { /* 저장 불가 환경 */ }
  pivot.mesh.visible = !hidePivot;
```

(d) `const { fitBtn } = mountViewTools(viewport, rig);` 를 교체:

```js
  const { fitBtn } = mountViewTools(viewport, rig, {
    hidePivot,
    onHidePivot: (v) => {
      pivot.mesh.visible = !v;
      try { localStorage.setItem(PIVOT_KEY, v ? '1' : '0'); } catch (e) { /* 저장 불가 환경 */ }
    },
  });
  // 더블클릭·두 번 탭 → 회전 중심 이동. 종이 정점에는 도메인 밖 NaN 이 있어 three 가 자동 계산하는 경계 구가 NaN 이 되므로 큰 구로 고정.
  const pickSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  installPivotPicking(renderer.domElement, camera, () => {
    paper.geometry.boundingSphere = pickSphere;
    return [globe.mesh, paper.mesh];
  }, (point) => {
    rig.autoFrame = false;            // 자동 맞춤이 중심을 도로 끌고 가지 않도록
    controls.target.copy(point);
    controls.update();
  });
```

(e) 루프의 `controls.update();` 바로 다음 줄에:

```js
    pivot.update(camera, controls.target);
```

(f) `window.__app = { ... }` 객체에 `pivot` 추가: `window.__app = { scene, camera, renderer, controls, rig, refresh, getState, frame, entry, paperBox, pivot };`

- [ ] **Step 3: CSS 추가**

`css/style.css` 의 `.vbtn.on { … }` 줄 다음에:

```css
.vcheck {
  height: 34px; padding: 0 10px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;
  background: rgba(20,33,61,0.85); border: 1px solid var(--navy-line); color: var(--muted); font-size: 12px;
  cursor: pointer; user-select: none; white-space: nowrap;
}
.vcheck:hover { border-color: var(--accent); color: var(--text); }
.vcheck input { accent-color: var(--accent); margin: 0; }
```

- [ ] **Step 4: 회귀 테스트**

Run: `npm test`
Expected: `112/112 통과` (Node 테스트는 pivot.js 를 import 하지 않으므로 수만 유지).

- [ ] **Step 5: 실제 브라우저 확인 (이 PC Chrome, Claude in Chrome)**

`npm run serve` (8765) 켜진 상태에서 `http://localhost:8765/?p=equalEarth` 를 새 탭으로 열고 Ctrl+Shift+R.
확인(스크린샷으로 기록):
1. 화면 가운데 근처에 빨간 점이 보임.
2. `computer` 의 **double_click** 으로 지구본 위 한 점을 더블클릭 → `await (async () => { const a = window.__app; return [a.controls.target.toArray(), a.rig.autoFrame]; })()` 로 target 이 바뀌고 `autoFrame === false` 확인. 드래그로 돌려 그 점을 중심으로 회전하는지 확인.
3. 빈 우주를 더블클릭 → target 변화 없음.
4. 「중심점 숨기기」 체크 → 점 사라짐, 새로고침 후에도 체크 유지.
5. 맞춤 버튼 → autoFrame true 로 돌아가 원래 시점으로 복귀.

- [ ] **Step 6: 커밋**

```bash
git add js/scene/pivot.js js/main.js css/style.css
git commit -m "회전 중심 빨간 점 표시, 더블클릭·두 번 탭으로 중심 이동, 중심점 숨기기 체크박스"
```

---

### Task 3: 벡터 경로 (`mapVector.js`)

**Files:**
- Create: `js/export/mapVector.js`
- Test: `tests/suite.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/suite.js` import 추가:

```js
import { prepareMapData, buildMapVector, landFrameRings, regionRects } from '../js/export/mapVector.js';
```

(`makeRotation`, `aspectSpec` 은 이미 import 돼 있음, `inDomain` 도 있음. `DERIVATIONS` 도 있음.)

`// 16. 두 번 탭` 구획 앞에 추가:

```js
// ---------------------------------------------------------------------------
// 15. PNG 벡터
// ---------------------------------------------------------------------------
const MAPVEC_ASPECT_IDS = ['mercator', 'equalEarth', 'goodeHomolosine', 'stereographic', 'azimuthalEquidistant', 'lambertConformalConic'];

/** 도법 × 축 조합의 프레임 { f, domain, rotation } */
function mapVectorFrames() {
  const out = [];
  for (const e of Object.values(PROJECTIONS)) {
    const root = e.derivation ? PROJECTIONS[DERIVATIONS[e.derivation].root] : e;
    const params = { ...root.params, ...e.params };
    const st = root.surface ? root.surface.type : 'cylinder';
    for (const aspect of ['normal', 'transverse', 'oblique']) {
      if (aspect !== 'normal' && !MAPVEC_ASPECT_IDS.includes(e.id)) continue;
      out.push({ name: `${e.id}/${aspect}`, fr: { f: (l, p) => e.forward(l, p, params), domain: domainOf(e, params), rotation: makeRotation(aspectSpec(aspect, st)) } });
    }
  }
  return out;
}

function testMapVector(land) {
  const data = prepareMapData(land);
  const bad = { empty: [], finite: [], jump: [], domain: [], lobe: [] };
  const cases = mapVectorFrames();
  for (const { name, fr } of cases) {
    const v = buildMapVector(fr, data, { graticule: true });
    if (!v.sea.length || !v.land.length || !v.coast.length || !v.outline.length) { bad.empty.push(name); continue; }
    const paths = [...v.sea, ...v.land, ...v.coast, ...v.graticule, ...v.outline];
    if (!paths.every((pts) => pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)))) bad.finite.push(name);
    const lim = 0.5 * (v.bbox.maxX - v.bbox.minX);
    const jumps = (pts, closed) => {
      const n = pts.length;
      for (let i = 1; i < n + (closed ? 1 : 0); i++) {
        const a = pts[i - 1], b = pts[i % n];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > lim) return true;
      }
      return false;
    };
    if (v.sea.some((r) => jumps(r, true)) || v.land.some((r) => jumps(r, true)) ||
      [...v.coast, ...v.graticule, ...v.outline].some((l) => jumps(l, false))) bad.jump.push(name);
    const rings = landFrameRings(fr, data);
    if (!rings.every(({ ring }) => ring.every(([l, p]) => inDomain(fr.domain, l, p)))) bad.domain.push(name);
    if (fr.domain.cuts) {
      const rects = regionRects(fr.domain);
      const inRect = (r, l, p) => l >= r.l0 - 1e-9 && l <= r.l1 + 1e-9 && p >= r.p0 - 1e-9 && p <= r.p1 + 1e-9;
      if (!rings.every(({ region, ring }) => ring.every(([l, p]) => inRect(rects[region], l, p)))) bad.lobe.push(name);
    }
  }
  const S = '15. PNG 벡터';
  report(S, `바다·땅·해안선·테두리 경로가 비어 있지 않음 (${cases.length}개 도법·축)`, bad.empty.length === 0, bad.empty.join(', '));
  report(S, '모든 경로 좌표가 유한', bad.finite.length === 0, bad.finite.join(', '));
  report(S, '지도 폭의 절반을 넘는 선분 없음 (날짜변경선·절개선을 건너뛰지 않음)', bad.jump.length === 0, bad.jump.join(', '));
  report(S, '땅 고리가 모두 도메인 안 (사각·원형)', bad.domain.length === 0, bad.domain.join(', '));
  report(S, '구드: 땅 고리가 자기 로브(경도 구간 × 반구) 밖으로 나가지 않음', bad.lobe.length === 0, bad.lobe.join(', '));
}
```

`runAll` 안에서 `testClipAndArea(land, countries);` 다음 줄에 `testMapVector(land);` 추가.

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: `mapVector.js` 모듈을 찾지 못한다는 오류로 실패.

- [ ] **Step 3: 구현 — `js/export/mapVector.js`**

```js
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
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 15장 5항목 PASS, `117/117 통과`.
실패하면 detail 에 찍힌 `도법/축` 을 하나 골라 원인을 찾을 것(허용 오차를 늘려 통과시키지 말 것). 예상되는 함정:
- d3 `geoClipAntimeridian` 출력 고리가 닫는 점을 반복하면 `jumps` 가 아니라 길이 0 선분이라 무해.
- 방위도법(원형 도메인, c ≥ 90°)에서 λ′ = ±180° 변이 지도 안쪽 반지름 선으로 투영되는 것은 정상(채우기용 고리, 테두리는 원 하나).

- [ ] **Step 5: 커밋**

```bash
git add js/export/mapVector.js tests/suite.js
git commit -m "PNG 저장용 벡터 경로(mapVector.js): 날짜변경선·도메인·구드 로브·원형 도메인 잘라내기, 검증 15장"
```

---

### Task 4: 캔버스 그리기·색 규칙 (`drawMap.js`)

**Files:**
- Create: `js/export/drawMap.js`
- Test: `tests/suite.js`

- [ ] **Step 1: 실패하는 테스트 작성**

import 추가:

```js
import { exportColors, drawMapVector, layoutFor, LONG_SIDE } from '../js/export/drawMap.js';
```

`testMapVector` 함수 끝(마지막 `report` 다음, 함수 닫는 `}` 앞)에 추가:

```js
  // 색 규칙표
  const C = (fill, invert) => exportColors({ fill, invert });
  const want = [
    { sea: '#ffffff', land: '#000000', line: '#000000' },
    { sea: '#000000', land: '#ffffff', line: '#ffffff' },
    { sea: null, land: null, line: '#000000' },
    { sea: null, land: null, line: '#ffffff' },
  ];
  const got = [C(true, false), C(true, true), C(false, false), C(false, true)];
  report(S, '색 규칙표 (채우기 × 색 반전 4경우)', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));

  // 그리기 순서·색 (가짜 캔버스로 호출 기록)
  const record = () => {
    const calls = [];
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '', lineCap: '',
      clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
      fill() { calls.push(['fill', this.fillStyle]); },
      stroke() { calls.push(['stroke', this.strokeStyle]); },
    };
    return { ctx, calls };
  };
  const sample = mapVectorFrames().find((c) => c.name === 'equalEarth/normal').fr;
  const v = buildMapVector(sample, data, { graticule: true });
  const L = layoutFor(v.bbox, LONG_SIDE);
  const on = record();
  drawMapVector(on.ctx, v, { fill: true, invert: false, graticule: true }, L, LONG_SIDE);
  const fills = on.calls.filter((c) => c[0] === 'fill').map((c) => c[1]);
  const colorsOn = new Set(on.calls.map((c) => c[1]));
  report(S, '채우기: 바다(흰) → 땅(검) 순서, 쓰인 색은 #000000·#ffffff 뿐', JSON.stringify(fills) === '["#ffffff","#000000"]' && [...colorsOn].every((c) => c === '#000000' || c === '#ffffff'), `fill ${fills.join(' → ')}`);
  const off = record();
  drawMapVector(off.ctx, v, { fill: false, invert: true, graticule: true }, L, LONG_SIDE);
  const offFills = off.calls.filter((c) => c[0] === 'fill').length;
  const offColors = new Set(off.calls.map((c) => c[1]));
  report(S, '채우기 끔 + 색 반전: 면 없이 흰 선만', offFills === 0 && offColors.size === 1 && offColors.has('#ffffff'), `fill ${offFills}회, 색 ${[...offColors].join(',')}`);
  report(S, `저장 크기: 긴 변 ${LONG_SIDE} px`, Math.max(L.width, L.height) === LONG_SIDE, `${L.width} × ${L.height}`);
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: `drawMap.js` 모듈을 찾지 못한다는 오류로 실패.

- [ ] **Step 3: 구현 — `js/export/drawMap.js`**

```js
// © 2026 김용현
// export/drawMap.js — mapVector 결과를 캔버스 2D 에 그린다. 색은 두 가지(#000000 · #ffffff)만, 지도 밖은 투명.
// 채우기: 바다 → 경위선(땅 아래라 바다 위에만 보임) → 땅 → 해안선 → 테두리. 채우기 끔: 경위선 → 해안선 → 테두리.
export const LONG_SIDE = 3000;
const BLACK = '#000000', WHITE = '#ffffff';

/** 색 규칙. 채우기 끔이면 면은 투명(null). 선은 늘 땅 색 */
export function exportColors({ fill, invert }) {
  const dark = invert ? WHITE : BLACK, light = invert ? BLACK : WHITE;
  return { sea: fill ? light : null, land: fill ? dark : null, line: dark };
}

/** 캔버스 크기(긴 변 = longSide, 사방 여백 1 %)와 종이 좌표 → 픽셀 변환(y 뒤집기) */
export function layoutFor(bbox, longSide) {
  const w = bbox.maxX - bbox.minX, h = bbox.maxY - bbox.minY;
  const span = Math.max(w, h);
  const k = longSide / (span * 1.02);
  const pad = 0.01 * span * k;
  return {
    width: Math.round(w * k + 2 * pad), height: Math.round(h * k + 2 * pad),
    tx: (x) => (x - bbox.minX) * k + pad,
    ty: (y) => (bbox.maxY - y) * k + pad,
  };
}

function trace(ctx, pts, L, close) {
  if (pts.length < 2) return;
  ctx.moveTo(L.tx(pts[0][0]), L.ty(pts[0][1]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(L.tx(pts[i][0]), L.ty(pts[i][1]));
  if (close) ctx.closePath();
}

/** opts = { fill, invert, graticule }. 선 굵기는 긴 변 3000 px 기준(테두리 3, 해안선 2, 경위선 1.5)으로 비례 */
export function drawMapVector(ctx, vec, opts, L, longSide) {
  const c = exportColors(opts);
  const s = longSide / LONG_SIDE;
  const w = (px) => Math.max(0.75, px * s);
  ctx.clearRect(0, 0, L.width, L.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // 면: 짝홀 채우기 + 같은 색 가는 선(날짜변경선·로브 경계에서 잘린 고리 사이 머리카락 틈 가림)
  const fillRings = (rings, color) => {
    ctx.beginPath();
    for (const r of rings) trace(ctx, r, L, true);
    ctx.fillStyle = color;
    ctx.fill('evenodd');
    ctx.strokeStyle = color;
    ctx.lineWidth = w(1);
    ctx.stroke();
  };
  const strokeLines = (lines, px) => {
    ctx.beginPath();
    for (const ln of lines) trace(ctx, ln, L, false);
    ctx.strokeStyle = c.line;
    ctx.lineWidth = w(px);
    ctx.stroke();
  };
  if (opts.fill) fillRings(vec.sea, c.sea);
  if (opts.graticule) strokeLines(vec.graticule, 1.5);
  if (opts.fill) fillRings(vec.land, c.land);
  strokeLines(vec.coast, 2);
  strokeLines(vec.outline, 3);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 15장 새 4항목 PASS, `121/121 통과`.

- [ ] **Step 5: 커밋**

```bash
git add js/export/drawMap.js tests/suite.js
git commit -m "PNG 그리기(drawMap.js): 두 색 규칙·채우기·색 반전·그리기 순서, 검증 4항목"
```

---

### Task 5: 모달과 버튼 (`exportModal.js`, controls, main, CSS)

**Files:**
- Create: `js/ui/exportModal.js`
- Modify: `js/ui/controls.js` (`mountUtilControls`)
- Modify: `js/main.js` (import, 모달 생성, `mountUtilControls` 두 호출)
- Modify: `css/style.css` (끝 쪽, `@media (max-width: 860px)` 블록 앞)

- [ ] **Step 1: `js/ui/exportModal.js` 작성**

```js
// © 2026 김용현
// ui/exportModal.js — PNG 저장 모달: 미리보기 + 채우기 · 색 반전 · 경위선, 저장은 긴 변 3000 px 투명 배경 PNG.
// 그리는 지도 = 지금 종이에 그려진 모양(state.frame() 의 f · domain · rotation), 카메라와 무관한 정면.
import { prepareMapData, buildMapVector } from '../export/mapVector.js';
import { drawMapVector, layoutFor, LONG_SIDE } from '../export/drawMap.js';

const KEY = 'proj3d.export';
const PREVIEW_SIDE = 520;
const DEFAULTS = { fill: true, invert: false, graticule: true };

function loadOpts() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; }
}
function saveOpts(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* 저장 불가 환경 */ }
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, '_');

export function createExportModal({ landTopo, getFrame }) {
  let data = null, vec = null, fileName = 'map';
  const opts = loadOpts();

  const backdrop = el('div', 'modal-backdrop');
  const box = el('div', 'modal');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'PNG 저장');
  const title = el('h3', null, 'PNG 저장');
  const preview = el('div', 'modal-preview');
  const canvas = el('canvas');
  preview.appendChild(canvas);
  const optsBox = el('div', 'modal-opts');
  const mk = (key, label) => {
    const wrap = el('label', 'ctl ctl-toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = opts[key];
    input.addEventListener('change', () => { opts[key] = input.checked; saveOpts(opts); drawPreview(); });
    wrap.append(input, el('span', 'ctl-label', label));
    optsBox.appendChild(wrap);
  };
  mk('fill', '채우기');
  mk('invert', '색 반전');
  mk('graticule', '경위선');
  const note = el('p', 'modal-note');
  const actions = el('div', 'modal-actions');
  const cancel = el('button', 'chip', '취소');
  cancel.type = 'button';
  const save = el('button', 'chip on', '저장');
  save.type = 'button';
  actions.append(cancel, save);
  box.append(title, preview, optsBox, note, actions);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);

  const close = () => backdrop.classList.remove('open');
  cancel.addEventListener('click', close);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && backdrop.classList.contains('open')) close(); });

  function render(cv, side) {
    const L = layoutFor(vec.bbox, side);
    cv.width = L.width;
    cv.height = L.height;
    drawMapVector(cv.getContext('2d'), vec, opts, L, side);
  }

  function drawPreview() {
    if (!vec) return;
    render(canvas, PREVIEW_SIDE);
    const full = layoutFor(vec.bbox, LONG_SIDE);
    note.textContent = `저장 크기 ${full.width} × ${full.height} px · 지도 밖은 투명 · 색은 #000000 · #ffffff 두 가지`;
  }

  save.addEventListener('click', () => {
    if (!vec) return;
    const cv = document.createElement('canvas');
    render(cv, LONG_SIDE);
    cv.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName(fileName)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      close();
    }, 'image/png');
  });

  return {
    open() {
      if (!data) data = prepareMapData(landTopo);
      const fr = getFrame();
      fileName = fr.entry.nameKo;
      vec = buildMapVector(fr, data, { graticule: true });
      const ok = vec.sea.length > 0 && Number.isFinite(vec.bbox.minX);
      save.disabled = !ok;
      backdrop.classList.add('open');
      if (ok) drawPreview();
      else { vec = null; note.textContent = '이 단계에서는 그릴 지도가 없음'; }
      save.focus();
    },
  };
}
```

- [ ] **Step 2: `mountUtilControls` 에 버튼 추가 (`js/ui/controls.js`)**

함수 머리 교체:

```js
/** 유틸 버튼(저사양·전체화면·링크 복사·PNG 저장) — 하단 재생 줄 오른쪽에 둔다(헤더가 두 줄이 되지 않게). */
export function mountUtilControls(container, { onExport } = {}) {
```

`box.appendChild(share);` 다음 줄(render 함수 안)에 추가:

```js
    if (onExport) {
      const png = el('button', 'chip', 'PNG 저장');
      png.type = 'button';
      png.title = '지금 종이에 그려진 지도를 투명 배경 PNG 로 저장';
      png.addEventListener('click', onExport);
      box.appendChild(png);
    }
```

- [ ] **Step 3: `js/main.js` 연결**

import 추가(`import { CompareOverlay, AreaRatio } from './ui/compare.js';` 다음):

```js
import { createExportModal } from './ui/exportModal.js';
```

`// ---- UI ----` 블록의 두 `mountUtilControls` 호출을 교체:

```js
  const exportModal = createExportModal({ landTopo: land, getFrame: frame });
  const onExport = () => exportModal.open();
  mountPicker(document.getElementById('picker'));
  mountControls(document.getElementById('controls'));
  const { utilSlot } = mountStepper(document.getElementById('stepper'));
  mountUtilControls(utilSlot, { onExport });
  const drawerUtils = document.getElementById('drawerUtils');
  drawerUtils.parentNode.appendChild(drawerUtils);               // 컨트롤 뒤(서랍 맨 아래)로
  mountUtilControls(drawerUtils, { onExport });                   // 모바일 서랍(햄버거)용 — 같은 상태를 구독하므로 서로 동기화됨
```

(원래 있던 `mountPicker` · `mountControls` · `mountStepper` 줄은 위 블록에 포함되므로 중복되지 않게 교체할 것.)

바깥 클릭으로 서랍을 닫는 핸들러의 예외 목록에 모달 추가 — `ev.target.closest('.popover')` 뒤에 `|| ev.target.closest('.modal-backdrop')`.

- [ ] **Step 4: CSS 추가**

`css/style.css` 의 `.popover-close:hover { … }` 줄 다음에:

```css
/* ---- 모달 (PNG 저장) ---- */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 40; display: none; align-items: center; justify-content: center;
  padding: 16px; background: rgba(8,14,28,0.6);
}
.modal-backdrop.open { display: flex; }
.modal {
  width: min(560px, 100%); max-height: calc(100dvh - 32px); overflow: auto;
  background: rgba(20,33,61,0.98); border: 1px solid var(--navy-line); border-radius: 10px; padding: 14px 16px 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.45); font-size: 13px; line-height: 1.55; color: var(--text); word-break: keep-all;
}
.modal h3 { margin: 0 0 10px; font-size: 15px; color: var(--accent); }
.modal-preview {
  display: flex; justify-content: center; border: 1px solid var(--navy-line); border-radius: 6px; overflow: hidden;
  background: repeating-conic-gradient(#c9ced6 0% 25%, #eef1f5 0% 50%) 0 0 / 16px 16px;   /* 투명 = 체커보드 */
}
.modal-preview canvas { display: block; max-width: 100%; height: auto; }
.modal-opts { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 12px 0 4px; }
.modal-note { margin: 4px 0 12px; color: var(--muted); font-size: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.modal .chip:disabled { opacity: 0.45; cursor: not-allowed; }
```

- [ ] **Step 5: 회귀 테스트**

Run: `npm test`
Expected: `121/121 통과`.

- [ ] **Step 6: 실제 브라우저 확인 (이 PC Chrome)**

`http://localhost:8765/?p=equalEarth&stage=adjust&step=1&t=1` 새로고침(Ctrl+Shift+R).
1. 리모컨 오른쪽 「PNG 저장」 **실제 마우스 클릭** → 모달, 미리보기에 Equal Earth(흰 바다·검은 땅·곡선 경선), 체커보드 배경.
2. 채우기 끄기 → 선만. 색 반전 → 흰 선. 경위선 끄기 → 경위선 사라짐. 새로고침 후 체크 상태 유지.
3. Esc · 바깥 클릭 · 취소로 닫힘.
4. 저장 → 다운로드 폴더에 `Equal Earth 도법.png`. 아래 스크립트로 검사(경로는 실제 파일로):

```bash
python - <<'EOF'
from PIL import Image
import os
p = os.path.expanduser('~/Downloads/Equal Earth 도법.png')
im = Image.open(p).convert('RGBA'); w, h = im.size
px = im.load()
corners = [px[0, 0][3], px[w-1, 0][3], px[0, h-1][3], px[w-1, h-1][3]]
opaque = [c[:3] for c in im.getdata() if c[3] == 255]
pure = sum(1 for c in opaque if c in ((0, 0, 0), (255, 255, 255)))
print('크기', w, h, '모서리 알파', corners, '불투명 중 순색 비율', round(pure / max(1, len(opaque)), 4))
EOF
```

Expected: 긴 변 3000, 모서리 알파 `[0, 0, 0, 0]`, 순색 비율 0.99 이상(나머지는 안티앨리어싱 가장자리).
5. 같은 방법으로 메르카토르(정축), 구드 호몰로사인, 평사도법 사축(`?p=stereographic&aspect=oblique`)을 미리보기로 보고 이상한 선(지도를 가로지르는 직선, 빠진 땅)이 없는지 확인. 휴대폰 폭(390px)에서 햄버거 서랍의 「PNG 저장」으로 모달이 화면 안에 들어오는지 `_probe.html` 방식으로 확인(커밋 금지).

- [ ] **Step 7: 커밋**

```bash
git add js/ui/exportModal.js js/ui/controls.js js/main.js css/style.css
git commit -m "PNG 저장 모달: 미리보기·채우기·색 반전·경위선, 긴 변 3000 px 투명 배경"
```

---

### Task 6: 기록 정리

**Files:**
- Modify: `CHANGELOG.md` (맨 위 `# CHANGELOG` 다음)

- [ ] **Step 1: CHANGELOG 항목 추가**

```markdown
## 2026-09-28 — 회전 중심 표시 · PNG 저장

- 회전 중심(빨간 점)을 항상 표시(화면상 크기 일정, 맨 위). 지구본·종이를 더블클릭(휴대폰은 두 번 탭)하면 그 지점이 회전 중심 — 자동 맞춤은 꺼지고, 맞춤 버튼·단계 변경으로 복귀. 왼쪽 위 「중심점 숨기기」(상태 기억). `js/scene/pivot.js`, `js/util/doubleTap.js`.
- 「PNG 저장」(리모컨 유틸 줄·모바일 서랍) → 모달: 미리보기 + 채우기 · 색 반전 · 경위선. 지금 종이에 그려진 모양을 정면 벡터로 다시 그려 긴 변 3000 px, 지도 밖 투명, 면은 #000000 · #ffffff 두 색. 채우기 끔이면 선만.
- 벡터 경로 `js/export/mapVector.js`: 지리 (λ,φ) → 회전 → 날짜변경선(d3 폴리곤 클리핑) · 사각 도메인 · 구드 로브 · 원형 도메인(원호 보충) 잘라내기 → 1° 촘촘히 → f. 그리기 `js/export/drawMap.js`, 모달 `js/ui/exportModal.js`.
- 검증 15장 「PNG 벡터」(전 도법 × 축: 비어 있지 않음·유한·절개선 건너뜀 없음·도메인·구드 로브, 색 규칙·그리기 순서·크기), 16장 「두 번 탭」.
```

- [ ] **Step 2: 최종 확인과 커밋**

Run: `npm test` → Expected `121/121 통과`.

```bash
git add CHANGELOG.md
git commit -m "CHANGELOG: 회전 중심 표시·PNG 저장"
```

배포(푸시)는 사용자가 `/cpd` 로 요청할 때.
