// © 2026 김용현
// main.js — 부트스트랩, 씬 구성, 렌더 루프. 정점 위치 계산은 geometry/pipeline.js 로만 한다(PLAN 6장).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getState, subscribe, frame, tick, loadFromQuery, entry } from './state.js';
import { coastlines, graticuleLines, graticuleIntersections, splitLines, splitAtCuts, rotatePoints } from './geometry/clip.js';
import { maxRayReach, minLightDist, positionOf, paperPosition } from './geometry/pipeline.js';
import { flatOffset } from './geometry/bend.js';
import { unitVector } from './geometry/rotate.js';
import { lightPosition } from './projections/perspective.js';
import { distortionAt } from './projections/distortion.js';
import { domainOf } from './projections/registry.js';
import { Globe, createLandMaskTexture } from './scene/globe.js';
import { Paper } from './scene/paper.js';
import { MapLayer } from './scene/mapLayer.js';
import { Rays } from './scene/rays.js';
import { Tissot } from './scene/tissot.js';
import { CameraRig } from './scene/camera.js';
import { mountPicker } from './ui/picker.js';
import { mountControls, mountUtilControls } from './ui/controls.js';
import { mountStepper } from './ui/stepper.js';
import { mountSidePanel } from './ui/sidePanel.js';
import { CompareOverlay, AreaRatio } from './ui/compare.js';
import { damp } from './util/tween.js';

const D = Math.PI / 180;
const DEV = /[?&]dev=1/.test(location.search) || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const INSTANT = /[?&]instant=1/.test(location.search); // 스크린샷 검증용: 카메라·지구본 감쇠를 즉시 끝낸다
// 빛 투영 타이밍: 광원 → 구면(빠르게) 0~FRONT_TO_SPHERE, 구면 → 종이 그 뒤. 평면 도법은 PLANE_LIGHT_END 에 빛이 다 닿고 나머지는 완성 모션.
export const FRONT_TO_SPHERE = 0.3;
export const PLANE_LIGHT_END = 0.85;

const ICONS = {
  fit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  minus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
};

async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/** 뷰포트 위 시점 도구: 자동 맞춤 · 확대 · 축소 + 조작 안내 */
function mountViewTools(viewport, rig) {
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
  const hint = document.createElement('div');
  hint.className = 'vhint';
  hint.textContent = '드래그 회전 · 휠 확대/축소 · 오른쪽 드래그 이동 · 시점이 흐트러지면 왼쪽 위 맞춤 버튼';
  viewport.append(box, hint);
  return { fitBtn };
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
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.minDistance = 1.5;
  controls.maxDistance = 60;
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

  const rig = new CameraRig(camera, controls, { frameGroup, moveGroup, globeGroup });
  rig.instant = INSTANT;

  // ---- UI ----
  mountPicker(document.getElementById('picker'));
  mountControls(document.getElementById('controls'));
  const { utilSlot } = mountStepper(document.getElementById('stepper'));
  mountUtilControls(utilSlot);
  const drawerUtils = document.getElementById('drawerUtils');
  drawerUtils.parentNode.appendChild(drawerUtils);               // 컨트롤 뒤(서랍 맨 아래)로
  mountUtilControls(drawerUtils);                                 // 모바일 서랍(햄버거)용 — 같은 상태를 구독하므로 서로 동기화됨

  // ---- 모바일 햄버거 서랍 · 설명 패널 접기/펴기 ----
  const menuBtn = document.getElementById('menuBtn');
  const setMenu = (open) => { document.body.classList.toggle('menu-open', open); menuBtn.setAttribute('aria-expanded', String(open)); };
  menuBtn.addEventListener('click', (ev) => { ev.stopPropagation(); setMenu(!document.body.classList.contains('menu-open')); });
  document.addEventListener('pointerdown', (ev) => {
    if (!document.body.classList.contains('menu-open')) return;
    if (ev.target.closest('#controls') || ev.target.closest('#menuBtn') || ev.target.closest('.picker-menu') || ev.target.closest('.popover')) return;
    setMenu(false);
  });
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') setMenu(false); });
  const setSide = (collapsed) => {
    document.body.classList.toggle('side-collapsed', collapsed);
    try { localStorage.setItem('proj3d.sideCollapsed', collapsed ? '1' : '0'); } catch (e) { /* 저장 불가 환경 */ }
    // 그리드 열이 바뀌므로 렌더러 크기를 다시 맞춘다(전환 애니메이션 뒤 한 번 더)
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
  };
  document.getElementById('sideToggle').addEventListener('click', () => setSide(!document.body.classList.contains('side-collapsed')));
  document.getElementById('sheetHandle').addEventListener('click', () => setSide(!document.body.classList.contains('side-collapsed')));
  try { if (localStorage.getItem('proj3d.sideCollapsed') === '1') document.body.classList.add('side-collapsed'); } catch (e) { /* 무시 */ }
  const sheetTitle = document.getElementById('sheetTitle');
  subscribe(() => { sheetTitle.textContent = entry().nameKo; });
  sheetTitle.textContent = entry().nameKo;
  const side = mountSidePanel(document.getElementById('side'));
  const tooltip = document.getElementById('tooltip');
  const { fitBtn } = mountViewTools(viewport, rig);

  // ---- 상태 → 씬 ----
  let dirty = true;
  subscribe(() => { dirty = true; });
  loadFromQuery(location.search);

  let lastRot = null, lastFrame = null, lastTissot = null, lastCompare = null, lastLowPower = null;
  let lastStage = null, lastStep = -1, lastEntry = null;
  let lastCuts, baseLines = { coast: [], graticule: [] };
  let rayPoints = [];
  let currentCtx = null, currentFrame = null;
  let paperOpacity = 1, paperOpacityTarget = 1;
  const offset = [0, 0, 0];
  const M4 = new THREE.Matrix4();

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
    const plane = fr.surface.type === 'plane';           // 평면은 펼치기 단계가 없다
    const lightEnd = plane ? PLANE_LIGHT_END : 0.999;
    const projectDone = s.stage === 'project' && s.t >= lightEnd;
    const finish = plane && s.stage === 'project' ? Math.max(0, Math.min(1, (s.t - PLANE_LIGHT_END) / (1 - PLANE_LIGHT_END))) : 0; // 완성 모션 진행도

    // 단계·도법이 바뀌면 카메라 자동 추적을 다시 켠다
    if (s.stage !== lastStage || s.step !== lastStep || fr.entry !== lastEntry) {
      rig.autoFrame = true;
      lastStage = s.stage; lastStep = s.step; lastEntry = fr.entry;
    }

    if (s.lowPower !== lastLowPower) {
      lastLowPower = s.lowPower;
      mapLayer.grid.lowPower = s.lowPower;
      mapLayer.grid.kind = null;
      renderer.setPixelRatio(s.lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      rays.setPoints(s.lowPower ? rayPoints.filter((_, i) => i % 2 === 0) : rayPoints);
    }

    if (fr.rotation !== lastRot) {
      lastRot = fr.rotation;
      baseLines = { coast: splitLines(coastGeo, fr.rotation), graticule: splitLines(gratGeo, fr.rotation) };
      lastCuts = undefined; // 아래에서 절개선 적용과 함께 setLines
      mapLayer.setRotation(fr.rotation);
      tissot.setRotation(fr.rotation);
      compare.setRotation(fr.rotation, splitLines);
      rayPoints = rotatePoints(rayGeo, fr.rotation);
      rays.setPoints(s.lowPower ? rayPoints.filter((_, i) => i % 2 === 0) : rayPoints);
      const m = fr.rotation.toWorld;
      M4.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
      frameGroup.quaternion.setFromRotationMatrix(M4);
    }

    // 단열 도법: 절개 자오선에서 선을 다시 나눈다(구드)
    const cuts = fr.domain.cuts || null;
    if (cuts !== lastCuts) {
      lastCuts = cuts;
      mapLayer.setLines({ coast: splitAtCuts(baseLines.coast, cuts), graticule: splitAtCuts(baseLines.graticule, cuts) });
      tissot.applyCuts(cuts);
    }

    const ctx = { f: fr.f, domain: fr.domain, surface: fr.surface, params: fr.params, light: fr.light, bendT: fr.bendT, s: fr.s, rayReach: 1 };
    if (fr.s < 1) {
      const full = { ...ctx, s: 1 };
      ctx.rayReach = maxRayReach(full, rayPoints) * 1.02;
      if (s.stage === 'project') {
        // 빛의 앞머리 진행도 s: 광원→구면 구간(reach 0 ~ 최소 |P−L|)은 FRONT_TO_SPHERE 동안 빠르게, 나머지는 구면→종이
        const tl = plane ? Math.min(1, s.t / PLANE_LIGHT_END) : s.t;
        const r0 = Math.min(0.95, minLightDist(full, rayPoints) / ctx.rayReach);
        ctx.s = tl >= 1 ? 1 : tl < FRONT_TO_SPHERE ? r0 * (tl / FRONT_TO_SPHERE) : r0 + (1 - r0) * ((tl - FRONT_TO_SPHERE) / (1 - FRONT_TO_SPHERE));
      }
    }
    currentCtx = ctx; currentFrame = fr;

    paper.update(ctx);
    const showMap = s.stage === 'project' || s.stage === 'unroll' || s.stage === 'adjust';
    mapLayer.visible = showMap;
    if (showMap) mapLayer.update(ctx);
    tissot.visible = showMap && s.tissot;
    if (tissot.visible) tissot.update(ctx);

    // 광원: 씌우기 단계부터 어둡게 보이고(어디서 빛이 나올지), 빛 투영에서 완전히 켜지고, 펼치기(평면은 투영이 끝나는 순간)에 꺼진다.
    // 광선은 빛 투영 단계에만 그린다.
    let rayI = 0, raysOn = false;
    if (s.stage === 'wrap') rayI = 0.45 * Math.min(1, s.t * 3);
    else if (s.stage === 'project') { rayI = plane ? 1 - finish : 1; raysOn = true; }
    else if (s.stage === 'unroll') { rayI = Math.max(0, 1 - s.t * 2.5); raysOn = true; }
    rays.group.visible = rayI > 0;
    if (rayI > 0) rays.update(ctx, rayI, raysOn);

    // 지구본: 씌우기 0.8(안쪽 광원이 비침), 빛 단계 0.35. 종이도 빛 단계에 반투명(0.5) — 안쪽 광원과 광선이 보이게
    globe.setOpacity(
      s.stage === 'wrap' ? 1 - 0.2 * Math.min(1, s.t * 3)
        : s.stage === 'project' ? (plane ? 0.35 + 0.65 * finish : 0.8 - 0.45 * Math.min(1, s.t * 3))
          : s.stage === 'unroll' ? 0.35 + 0.65 * Math.min(1, s.t * 2) : 1,
    );
    paperOpacityTarget = s.stage === 'project' ? (plane ? 0.5 + 0.5 * finish : 0.5) : s.stage === 'unroll' ? 0.5 + 0.5 * Math.min(1, s.t / 0.3) : 1;

    if (fr.moveP < 1) {
      const b = paperBox();
      flatOffset(fr.surface, fr.params, (b.max[0] - b.min[0]) / 2, offset);
      moveGroup.position.set(offset[0] * (1 - fr.moveP), offset[1] * (1 - fr.moveP), offset[2] * (1 - fr.moveP));
    } else {
      moveGroup.position.set(0, 0, 0);
    }
    compare.update(fr, ctx);
    rig.setTarget(fr, s, paperBox(), paper.gridPos);

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
    if (currentFrame) rig.setTarget(currentFrame, getState(), paperBox(), paper.gridPos);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- 루프 ----
  let last = performance.now();
  let snapped = false;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tick(dt);
    if (dirty) {
      dirty = false;
      refresh();
      if (!snapped) { rig.snap(); snapped = true; }
    }
    rig.update(dt);
    paperOpacity = INSTANT ? paperOpacityTarget : damp(paperOpacity, paperOpacityTarget, 6, dt);
    paper.setOpacity(paperOpacity);
    fitBtn.classList.toggle('on', rig.autoFrame);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  document.body.classList.add('ready');
  window.__app = { scene, camera, renderer, controls, rig, refresh, getState, frame, entry, paperBox };
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('viewport');
  const msg = document.createElement('div');
  msg.className = 'fatal';
  msg.textContent = '불러오기 실패: ' + err.message;
  el.appendChild(msg);
});
