// © 2026 김용현
// main.js — 부트스트랩, 씬 구성, 렌더 루프. 정점 위치 계산은 geometry/pipeline.js 로만 한다(PLAN 6장).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getState, subscribe, frame, tick, loadFromQuery, entry } from './state.js';
import { coastlines, graticuleLines, graticuleIntersections, splitLines, rotatePoints } from './geometry/clip.js';
import { maxRayReach, positionOf, paperPosition } from './geometry/pipeline.js';
import { flatOffset, coneGeometry } from './geometry/bend.js';
import { unitVector } from './geometry/rotate.js';
import { lightPosition } from './projections/perspective.js';
import { distortionAt } from './projections/distortion.js';
import { domainOf } from './projections/registry.js';
import { Globe, createLandMaskTexture } from './scene/globe.js';
import { Paper } from './scene/paper.js';
import { MapLayer } from './scene/mapLayer.js';
import { Rays } from './scene/rays.js';
import { Tissot } from './scene/tissot.js';
import { mountPicker } from './ui/picker.js';
import { mountControls } from './ui/controls.js';
import { mountStepper } from './ui/stepper.js';
import { mountSidePanel } from './ui/sidePanel.js';
import { CompareOverlay, AreaRatio } from './ui/compare.js';
import { tween, updateTweens, ease } from './util/tween.js';

const D = Math.PI / 180;
const DEV = /[?&]dev=1/.test(location.search) || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const INSTANT = /[?&]instant=1/.test(location.search); // 스크린샷 검증용: 카메라·지구본 트윈을 즉시 끝낸다
const dur = (d) => (INSTANT ? 0.001 : d);

async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function main() {
  const [land, countries] = await Promise.all([loadJSON('data/land-110m.json'), loadJSON('data/countries-110m.json')]);

  // ---- 렌더러 · 카메라 ----
  const viewport = document.getElementById('viewport');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  viewport.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14213d);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  camera.position.set(1.4, 1.0, 4.6);
  scene.add(camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.2;
  controls.maxDistance = 40;
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(1.5, 2.5, 3);
  camera.add(keyLight);

  // ---- 씬 객체 ----
  const landTex = createLandMaskTexture(land);
  const globe = new Globe(landTex);
  const globeGroup = new THREE.Group();
  globeGroup.add(globe.group);
  scene.add(globeGroup);

  const frameGroup = new THREE.Group();      // aspect 역회전 Mᵀ
  const moveGroup = new THREE.Group();       // FLAT 단계 강체 이동
  frameGroup.add(moveGroup);
  scene.add(frameGroup);

  const paper = new Paper();
  const mapLayer = new MapLayer(landTex, { lowPower: getState().lowPower });
  const tissot = new Tissot();
  const compare = new CompareOverlay();
  moveGroup.add(paper.group, mapLayer.group, tissot.group, compare.group);
  const rays = new Rays();
  frameGroup.add(rays.group);

  const coastGeo = coastlines(land);
  const gratGeo = graticuleLines(15);
  const rayGeo = graticuleIntersections(15);
  compare.setCoastSource(coastGeo);
  const areaRatio = new AreaRatio(countries);

  // ---- UI ----
  mountPicker(document.getElementById('picker'));
  mountControls(document.getElementById('controls'), {
    onFullscreen: () => { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); },
  });
  mountStepper(document.getElementById('stepper'));
  const side = mountSidePanel(document.getElementById('side'));
  const tooltip = document.getElementById('tooltip');

  // ---- 상태 → 씬 ----
  let dirty = true;
  subscribe(() => { dirty = true; });
  loadFromQuery(location.search);

  let lastRot = null, lastFrame = null, lastTissot = null, lastCompare = null, lastLowPower = null, lastFlat = null, lastFitKey = null;
  let rayPoints = [];
  let currentCtx = null, currentFrame = null;
  const offset = [0, 0, 0];
  const M4 = new THREE.Matrix4();

  function frameToWorld(v) {
    return new THREE.Vector3(v[0], v[1], v[2]).applyQuaternion(frameGroup.quaternion);
  }

  function paperBox() {
    const gp = paper.gridPos;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < gp.length; i += 3) {
      if (Number.isNaN(gp[i])) continue;
      for (let k = 0; k < 3; k++) { if (gp[i + k] < min[k]) min[k] = gp[i + k]; if (gp[i + k] > max[k]) max[k] = gp[i + k]; }
    }
    if (!Number.isFinite(min[0])) return { min: [-1, -1, 1], max: [1, 1, 1] };
    return { min, max };
  }

  let camTween = null, globeTween = null;
  function moveCamera(pos, target, up, duration = 1.2) {
    if (camTween) camTween.cancel();
    controls.enabled = false;
    const from = [camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z, camera.up.x, camera.up.y, camera.up.z];
    const to = [pos.x, pos.y, pos.z, target.x, target.y, target.z, up.x, up.y, up.z];
    camTween = tween({
      from, to, duration: dur(duration), easing: ease.inOutCubic,
      onUpdate: (v) => {
        camera.position.set(v[0], v[1], v[2]);
        controls.target.set(v[3], v[4], v[5]);
        camera.up.set(v[6], v[7], v[8]).normalize();
        camera.lookAt(controls.target);
      },
      onComplete: () => { controls.enabled = true; controls.update(); camTween = null; },
    });
  }

  function moveGlobe(pos, scale, duration = 1.2) {
    if (globeTween) globeTween.cancel();
    const from = [globeGroup.position.x, globeGroup.position.y, globeGroup.position.z, globeGroup.scale.x];
    globeTween = tween({
      from, to: [pos.x, pos.y, pos.z, scale], duration: dur(duration), easing: ease.inOutCubic,
      onUpdate: (v) => { globeGroup.position.set(v[0], v[1], v[2]); globeGroup.scale.setScalar(v[3]); },
      onComplete: () => { globeTween = null; },
    });
  }

  /** 펼친 뒤: 종이 정면(법선 방향) 시점, 지구본은 좌측 상단에 작게 */
  function fitFlatView(fr, duration = 1.2) {
    const g = coneGeometry(fr.surface, fr.params);
    const cone = g.kind === 'cone';
    const b = paperBox();
    const center = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    const normal = cone ? [0, 1, 0] : [0, 0, 1];
    const up = cone ? [0, 0, -1] : [0, 1, 0];
    const w0 = b.max[0] - b.min[0];
    const h = cone ? b.max[2] - b.min[2] : b.max[1] - b.min[1];
    // 지구본은 종이 왼쪽 위, 종이 평면보다 조금 앞(법선 방향)에 둔다. 카메라 맞춤에는 지구본 폭도 넣는다.
    const gscale = 0.32;
    const gx = center[0] - w0 / 2 - gscale - 0.15;
    const gpos = frameToWorld([
      gx + normal[0] * (gscale + 0.1),
      center[1] + up[1] * (h / 2 - gscale) + normal[1] * (gscale + 0.1),
      center[2] + up[2] * (h / 2 - gscale) + normal[2] * (gscale + 0.1),
    ]);
    // 지구본이 왼쪽 바깥에 있으므로 맞춤 상자를 왼쪽으로만 넓히고 시선 중심을 그만큼 옮긴다
    const leftExtent = w0 / 2 + 0.15 + 2 * gscale + 0.25, rightExtent = w0 / 2 + 0.1;
    const w = leftExtent + rightExtent;
    const look = [center[0] - (leftExtent - rightExtent) / 2, center[1], center[2]];
    const fov = camera.fov * D;
    const dist = Math.max((h / 2) / Math.tan(fov / 2), (w / 2) / (Math.tan(fov / 2) * camera.aspect)) * 1.12 + 0.5;
    const pos = frameToWorld([look[0] + normal[0] * dist, look[1] + normal[1] * dist, look[2] + normal[2] * dist]);
    moveCamera(pos, frameToWorld(look), frameToWorld(up), duration);
    moveGlobe(gpos, gscale, duration);
  }

  /** 기본 3D 시점: 프레임 +Z(종이 정면) 쪽에서 비스듬히, 지구본과 종이가 모두 들어오게 */
  function fitDefaultView(duration = 1.2) {
    const b = paperBox();
    const off = moveGroup.position;
    const min = [Math.min(-1, b.min[0] + off.x), Math.min(-1, b.min[1] + off.y), Math.min(-1, b.min[2] + off.z)];
    const max = [Math.max(1, b.max[0] + off.x), Math.max(1, b.max[1] + off.y), Math.max(1, b.max[2] + off.z)];
    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
    const fovV = camera.fov * D;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
    const dist = Math.max(2.5, (radius / Math.sin(Math.min(fovV, fovH) / 2)) * 0.92);
    // 평면(접점 = 프레임 +Z)은 비스듬히 봐야 종이 아래의 지구본과 광선이 보인다
    const plane = currentFrame && currentFrame.surface && currentFrame.surface.type === 'plane';
    const dir = (plane ? new THREE.Vector3(0.85, 0.55, 0.8) : new THREE.Vector3(0.32, 0.26, 1)).normalize();
    const pos = frameToWorld([center[0] + dir.x * dist, center[1] + dir.y * dist, center[2] + dir.z * dist]);
    const target = frameToWorld(center);
    const view = pos.clone().sub(target).normalize();
    const up = Math.abs(view.y) > 0.9 ? frameToWorld([0, 1, 0]) : new THREE.Vector3(0, 1, 0);
    moveCamera(pos, target, up, duration);
    moveGlobe(new THREE.Vector3(0, 0, 0), 1, duration);
  }

  function assertCollinear(fr) {
    if (!DEV || !fr.light) return;
    // 빛 투영은 항상 root 도법으로 한다(조정 단계의 f 는 원근 투영이 아니다)
    const params = fr.params;
    const ctx = { f: (l, p) => fr.root.forward(l, p, params), domain: domainOf(fr.root, params), surface: fr.surface, params, light: fr.light, bendT: 1, s: 1, rayReach: 1 };
    const Q = [0, 0, 0], P = [0, 0, 0], L = [0, 0, 0];
    let worst = 0;
    for (const [l, p] of rayPoints) {
      paperPosition(ctx, l, p, Q);
      if (Number.isNaN(Q[0])) continue;
      unitVector(l, p, P);
      lightPosition(fr.light, fr.surface, P, L);
      const a = [P[0] - L[0], P[1] - L[1], P[2] - L[2]], b = [Q[0] - L[0], Q[1] - L[1], Q[2] - L[2]];
      const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      worst = Math.max(worst, Math.hypot(...c) / (Math.hypot(...a) * Math.hypot(...b)));
    }
    if (worst > 1e-6) console.warn(`[dev] 공선성 assert 실패: ${fr.root.id} sin(각) = ${worst}`);
  }

  function renderAreaRatio() {
    if (!currentFrame) return;
    const fr = currentFrame;
    const cur = fr.flatView ? { id: fr.entry.id, name: fr.entry.nameKo, ratio: areaRatio.ratioCurrent(fr.f, fr.rotation) } : null;
    areaRatio.render(side.areaRatioEl, cur);
  }
  side.onAreaRatioNeeded = renderAreaRatio;

  function refresh() {
    const s = getState();
    const fr = frame();
    if (fr === lastFrame && s.tissot === lastTissot && s.compare === lastCompare && s.lowPower === lastLowPower) return;
    document.body.classList.toggle('projector', !!s.projector);

    if (s.lowPower !== lastLowPower) {
      lastLowPower = s.lowPower;
      mapLayer.grid.lowPower = s.lowPower;
      mapLayer.grid.kind = null;
      renderer.setPixelRatio(s.lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      rays.setPoints(s.lowPower ? rayPoints.filter((_, i) => i % 2 === 0) : rayPoints);
    }

    if (fr.rotation !== lastRot) {
      lastRot = fr.rotation;
      mapLayer.setLines({ coast: splitLines(coastGeo, fr.rotation), graticule: splitLines(gratGeo, fr.rotation) });
      mapLayer.setRotation(fr.rotation);
      tissot.setRotation(fr.rotation);
      compare.setRotation(fr.rotation, splitLines);
      rayPoints = rotatePoints(rayGeo, fr.rotation);
      rays.setPoints(s.lowPower ? rayPoints.filter((_, i) => i % 2 === 0) : rayPoints);
      const m = fr.rotation.toWorld;
      M4.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
      frameGroup.quaternion.setFromRotationMatrix(M4);
      lastFlat = null; // 시점 다시 잡기
    }

    const ctx = { f: fr.f, domain: fr.domain, surface: fr.surface, params: fr.params, light: fr.light, bendT: fr.bendT, s: fr.s, rayReach: 1 };
    if (fr.s < 1) ctx.rayReach = maxRayReach({ ...ctx, s: 1 }, rayPoints) * 1.02;
    currentCtx = ctx; currentFrame = fr;

    paper.update(ctx);
    const showMap = s.stage === 'project' || s.stage === 'unroll' || s.stage === 'adjust';
    mapLayer.visible = showMap;
    if (showMap) mapLayer.update(ctx);
    tissot.visible = showMap && s.tissot;
    if (tissot.visible) tissot.update(ctx);
    const rayI = s.stage === 'project' ? 1 : s.stage === 'unroll' ? Math.max(0, 1 - s.t * 2.5) : 0;
    rays.group.visible = rayI > 0;
    if (rayI > 0) rays.update(ctx, rayI);
    globe.setOpacity(s.stage === 'project' ? 1 - 0.65 * Math.min(1, s.t * 3) : s.stage === 'unroll' ? 0.35 + 0.65 * Math.min(1, s.t * 2) : 1);
    if (fr.moveP < 1) {
      const b = paperBox();
      flatOffset(fr.surface, fr.params, (b.max[0] - b.min[0]) / 2, offset);
      moveGroup.position.set(offset[0] * (1 - fr.moveP), offset[1] * (1 - fr.moveP), offset[2] * (1 - fr.moveP));
    } else {
      moveGroup.position.set(0, 0, 0);
    }
    compare.update(fr, ctx);

    if (fr.flatView !== lastFlat) {
      lastFlat = fr.flatView;
      if (fr.flatView) fitFlatView(fr); else fitDefaultView();
      lastFitKey = fr.entry.id + '|' + (fr.stepInfo ? fr.stepInfo.index : -1);
    } else if (fr.flatView) {
      const key = fr.entry.id + '|' + (fr.stepInfo ? fr.stepInfo.index : -1);
      if (key !== lastFitKey && s.t >= 1) { lastFitKey = key; fitFlatView(fr, 0.9); }
    }

    if (lastFrame === null || fr.root !== lastFrame.root || fr.params !== lastFrame.params) assertCollinear(fr);
    if (fr.stepInfo && fr.stepInfo.panel === 'areaRatio') renderAreaRatio();
    lastFrame = fr; lastTissot = s.tissot; lastCompare = s.compare;
  }

  // ---- 마우스: 티소 지표 값 · 로빈슨 표 행 강조 ----
  const worldMatrix = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (!currentCtx) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    moveGroup.updateWorldMatrix(true, false);
    worldMatrix.copy(moveGroup.matrixWorld);
    let shown = false;
    if (tissot.visible) {
      const hit = tissot.pick(nx, ny, camera, worldMatrix, rect.width, rect.height);
      if (hit) {
        const fr = currentFrame;
        const fGeo = (l, p) => fr.f(...fr.rotation.forward(l, p, [0, 0]));
        const d = distortionAt(fGeo, hit.center[0], hit.center[1]);
        const eq = fr.entry.property === 'equalArea' && fr.stage === 'adjust' && fr.t >= 1;
        const html = `<b>티소 지표</b> (${(hit.center[0] / D).toFixed(0)}°, ${(hit.center[1] / D).toFixed(0)}°)<br>h = ${d.h.toFixed(2)}, k = ${d.k.toFixed(2)}<br>면적배율 s = ${d.s.toFixed(2)}${eq || Math.abs(d.s - 1) < 0.005 ? ' <span class="badge">면적배율 1.00</span>' : ''}<br>최대각왜곡 ω = ${(d.omega / D).toFixed(1)}°`;
        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        tooltip.style.left = `${ev.clientX + 14}px`;
        tooltip.style.top = `${ev.clientY + 14}px`;
        side.setReadout(html);
        shown = true;
      }
    }
    if (!shown) { tooltip.style.display = 'none'; side.setReadout(''); }
    // 로빈슨 표: 가장 가까운 위선 행 강조
    const fr = currentFrame;
    if (fr && fr.stepInfo && fr.stepInfo.panel === 'robinsonTable') {
      let best = null, bestD = 14;
      const p = [0, 0, 0];
      for (let deg = 0; deg <= 90; deg += 5) {
        for (const sign of [1, -1]) {
          if (deg === 0 && sign < 0) continue;
          for (let i = 0; i <= 24; i++) {
            const l = -Math.PI + (2 * Math.PI * i) / 24;
            positionOf(currentCtx, l, sign * deg * D, p);
            if (Number.isNaN(p[0])) continue;
            tmpV.set(p[0], p[1], p[2]).applyMatrix4(worldMatrix).project(camera);
            const dpx = Math.hypot((tmpV.x - nx) * rect.width / 2, (tmpV.y - ny) * rect.height / 2);
            if (dpx < bestD) { bestD = dpx; best = deg; }
          }
        }
      }
      side.highlightRow(best);
    }
  });
  renderer.domElement.addEventListener('pointerleave', () => { tooltip.style.display = 'none'; side.setReadout(''); side.highlightRow(null); });

  // ---- 크기 ----
  function resize() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  fitDefaultView(0.01);

  // ---- 루프 ----
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tick(dt);
    updateTweens(dt);
    if (dirty) { dirty = false; refresh(); }
    if (controls.enabled) controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  document.body.classList.add('ready');
  window.__app = { scene, camera, renderer, refresh, getState, frame, entry };
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('viewport');
  const msg = document.createElement('div');
  msg.className = 'fatal';
  msg.textContent = '불러오기 실패: ' + err.message;
  el.appendChild(msg);
});
