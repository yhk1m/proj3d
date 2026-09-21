// © 2026 김용현
// scene/camera.js — 카메라 리그. 단계마다 광원·지구본·종이가 한 화면에 들어오게 자동으로 맞추고,
// 사용자가 드래그·휠로 조작하면 자동 추적을 멈춘다(단계가 바뀌거나 fit() 을 부르면 다시 켠다).
// 시점은 두 자세를 섞어 만든다: 3D 자세(경계 구 맞춤, 비스듬한 시선) ↔ 정면 자세(종이 평면 맞춤, 지구본은 좌측 상단 축소).
// 값은 state.frame() 파생값과 종이 bbox 만 읽는다. 위치 계산 파이프라인에는 손대지 않는다.
import * as THREE from 'three';
import { coneGeometry } from '../geometry/bend.js';
import { PARALLEL_LIGHT_DIST } from '../projections/perspective.js';

const D = Math.PI / 180;
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class CameraRig {
  constructor(camera, controls, { frameGroup, moveGroup, globeGroup }) {
    this.camera = camera;
    this.controls = controls;
    this.frameGroup = frameGroup;
    this.moveGroup = moveGroup;
    this.globeGroup = globeGroup;
    this.autoFrame = true;
    this.instant = false;
    this.lambda = 3.2;
    this.desired = {
      pos: new THREE.Vector3(1.4, 1.0, 4.6), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
      globePos: new THREE.Vector3(), globeScale: 1,
    };
    this._v = new THREE.Vector3();
    this._normalWorld = new THREE.Vector3();
    this._upFlat = new THREE.Vector3();
    this._worldUp = new THREE.Vector3(0, 1, 0);
    controls.addEventListener('start', () => { this.autoFrame = false; });
  }

  frameToWorld(a, out) {
    return out.set(a[0], a[1], a[2]).applyQuaternion(this.frameGroup.quaternion);
  }

  /**
   * 상태가 바뀔 때 호출해 목표 자세를 계산한다.
   *  fr: state.frame(), s: state, box: 종이 bbox(프레임 좌표, 이동 오프셋 제외)
   */
  setTarget(fr, s, box, points = null) {
    const cam = this.camera, d = this.desired;
    const g = coneGeometry(fr.surface, fr.params);
    const cone = g.kind === 'cone';
    const plane = fr.surface && fr.surface.type === 'plane';
    const off = this.moveGroup.position;
    const fovV = cam.fov * D;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * cam.aspect);

    // ---- 3D 자세: 지구본(반지름 1, 광원 포함) ∪ 종이 상자를 비스듬히 본다. 상자 꼭짓점을 화면 축에 투영해 꽉 채운다 ----
    const mn = [Math.min(-1, box.min[0] + off.x), Math.min(-1, box.min[1] + off.y), Math.min(-1, box.min[2] + off.z)];
    const mx = [Math.max(1, box.max[0] + off.x), Math.max(1, box.max[1] + off.y), Math.max(1, box.max[2] + off.z)];
    const dLight = fr.light && fr.light.type === 'point' ? (fr.params.d ?? fr.light.d) : 0;
    // 광원도 상자에 넣는다: 평면 도법의 점광원(축 위 −d)·평행광의 광원 원판(z = −3, 반지름 1.25)
    if (plane && fr.light && fr.light.type === 'point') {
      const dl = dLight === Infinity ? PARALLEL_LIGHT_DIST : dLight;
      const r = dLight === Infinity ? 1.25 : 0.45;
      mn[0] = Math.min(mn[0], -r); mn[1] = Math.min(mn[1], -r); mn[2] = Math.min(mn[2], -dl - 0.1);
      mx[0] = Math.max(mx[0], r); mx[1] = Math.max(mx[1], r);
    }
    const c3 = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    // 평면: 광원이 지구 뒤(대척점·무한원)에 있으면 거의 옆에서 보아 광원 → 지구본 → 원판 순서가 한눈에 들어오게,
    //       광원이 지구 안(심사)이면 원판 면이 보이도록 조금 위에서
    // 원뿔: 절개선(부채꼴의 두 반지름이 만나는 자리, λ' = ±180°)이 뒤쪽이라 뒤에서 보아 우산이 닫히며 두 변이 붙는 모습이 정면에 오게
    const lightBehind = plane && dLight >= 0.5;
    const dir3 = plane ? (lightBehind ? [0.95, 0.42, 0.28] : [0.9, 0.5, 0.55]) : cone ? [0.36, 0.3, -1] : [0.36, 0.28, 1];
    const n3 = Math.hypot(...dir3);
    const dz = [dir3[0] / n3, dir3[1] / n3, dir3[2] / n3];            // 카메라 → 대상 반대 방향(프레임 좌표)
    const upHint = Math.abs(dz[1]) > 0.9 ? [0, 0, -1] : [0, 1, 0];
    let rx = [upHint[1] * dz[2] - upHint[2] * dz[1], upHint[2] * dz[0] - upHint[0] * dz[2], upHint[0] * dz[1] - upHint[1] * dz[0]];
    const rl = Math.hypot(...rx); rx = [rx[0] / rl, rx[1] / rl, rx[2] / rl];
    const uy = [dz[1] * rx[2] - dz[2] * rx[1], dz[2] * rx[0] - dz[0] * rx[2], dz[0] * rx[1] - dz[1] * rx[0]];
    // 화면 축에 투영한 반폭. 종이는 상자 꼭짓점 대신 실제 정점을 쓴다(비스듬히 본 원판은 상자보다 훨씬 얇다).
    let hx = 0, hy = 0, near = -Infinity;
    const accum = (px, py, pz) => {
      const vx = px - c3[0], vy = py - c3[1], vz = pz - c3[2];
      hx = Math.max(hx, Math.abs(vx * rx[0] + vy * rx[1] + vz * rx[2]));
      hy = Math.max(hy, Math.abs(vx * uy[0] + vy * uy[1] + vz * uy[2]));
      near = Math.max(near, vx * dz[0] + vy * dz[1] + vz * dz[2]);
    };
    if (points) {
      for (let i = 0; i < points.length; i += 3) if (!Number.isNaN(points[i])) accum(points[i] + off.x, points[i + 1] + off.y, points[i + 2] + off.z);
    } else {
      for (const cx of [box.min[0], box.max[0]]) for (const cy of [box.min[1], box.max[1]]) for (const cz of [box.min[2], box.max[2]]) accum(cx + off.x, cy + off.y, cz + off.z);
    }
    // 지구본(반지름 1 구)과 광원
    for (const sx of [-1, 1]) { accum(sx, 0, 0); accum(0, sx, 0); accum(0, 0, sx); }
    accum(c3[0] + rx[0], c3[1] + rx[1], c3[2] + rx[2]); accum(c3[0] - rx[0], c3[1] - rx[1], c3[2] - rx[2]);
    accum(c3[0] + uy[0], c3[1] + uy[1], c3[2] + uy[2]); accum(c3[0] - uy[0], c3[1] - uy[1], c3[2] - uy[2]);
    if (plane && fr.light && fr.light.type === 'point') {
      const dl = dLight === Infinity ? PARALLEL_LIGHT_DIST : dLight;
      const r = dLight === Infinity ? 1.25 : 0.45;
      accum(r, r, -dl - 0.1); accum(-r, -r, -dl - 0.1); accum(r, -r, -dl); accum(-r, r, -dl);
    }
    const dist3 = Math.max(2.6, Math.max(hy / Math.tan(fovV / 2), hx / Math.tan(fovH / 2)) * 1.12 + near + 0.25);
    const pos3 = [c3[0] + dz[0] * dist3, c3[1] + dz[1] * dist3, c3[2] + dz[2] * dist3];

    // ---- 정면 자세: 종이 평면을 꽉 채우고, 지구본은 왼쪽 위에 작게 ----
    const normal = cone ? [0, 1, 0] : [0, 0, 1];
    const upF = cone ? [0, 0, -1] : [0, 1, 0];
    const cF = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
    const w0 = box.max[0] - box.min[0];
    const h = cone ? box.max[2] - box.min[2] : box.max[1] - box.min[1];
    const gs = 0.32;
    const gF = [
      cF[0] - w0 / 2 - gs - 0.15 + normal[0] * (gs + 0.1),
      cF[1] + upF[1] * (h / 2 - gs) + normal[1] * (gs + 0.1),
      cF[2] + upF[2] * (h / 2 - gs) + normal[2] * (gs + 0.1),
    ];
    const left = w0 / 2 + 0.15 + 2 * gs + 0.25, right = w0 / 2 + 0.1, w = left + right;
    const look = [cF[0] - (left - right) / 2, cF[1], cF[2]];
    const distF = Math.max((h / 2) / Math.tan(fovV / 2), (w / 2) / (Math.tan(fovV / 2) * cam.aspect)) * 1.12 + 0.5;
    const posF = [look[0] + normal[0] * distF, look[1] + normal[1] * distF, look[2] + normal[2] * distF];

    // ---- 섞기: 펼치기 진행도에 따라 3D → 정면. 평면(펼치기 없음)은 빛 투영이 끝날 무렵에 정면으로 ----
    let wf = 0;
    if (s.stage === 'adjust') wf = 1;
    else if (s.stage === 'unroll') wf = smooth((s.t - 0.15) / 0.85);
    else if (plane && s.stage === 'project') wf = smooth((s.t - 0.8) / 0.2);
    this.frameToWorld(lerp3(pos3, posF, wf), d.pos);
    this.frameToWorld(lerp3(c3, look, wf), d.target);

    // up: 기본은 세계 Y(북쪽 위). 정면 자세의 시선이 Y 와 나란하면(극 접평면, 원뿔 부채꼴) 종이의 위쪽을 쓴다.
    this.frameToWorld(normal, this._normalWorld);
    if (Math.abs(this._normalWorld.y) > 0.9) this.frameToWorld(upF, this._upFlat); else this._upFlat.copy(this._worldUp);
    d.up.copy(this._worldUp).lerp(this._upFlat, wf).normalize();

    // 지구본: 정면 자세에 가까워지면 좌측 상단으로
    if (wf > 0.6) { this.frameToWorld(gF, d.globePos); d.globeScale = gs; }
    else { d.globePos.set(0, 0, 0); d.globeScale = 1; }
  }

  /** 매 프레임. 자동 추적 중이면 카메라를, 항상 지구본을 목표로 감쇠 보간한다. */
  update(dt) {
    const d = this.desired, cam = this.camera, ctl = this.controls;
    const k = this.instant ? 1 : 1 - Math.exp(-this.lambda * dt);
    if (this.autoFrame) {
      cam.position.lerp(d.pos, k);
      ctl.target.lerp(d.target, k);
      cam.up.lerp(d.up, k).normalize();
    }
    const kg = this.instant ? 1 : 1 - Math.exp(-2.6 * dt);
    this.globeGroup.position.lerp(d.globePos, kg);
    const sc = this.globeGroup.scale.x + (d.globeScale - this.globeGroup.scale.x) * kg;
    this.globeGroup.scale.setScalar(sc);
  }

  /** 즉시 목표 자세로 (첫 화면) */
  snap() {
    const d = this.desired;
    this.camera.position.copy(d.pos);
    this.controls.target.copy(d.target);
    this.camera.up.copy(d.up);
    this.globeGroup.position.copy(d.globePos);
    this.globeGroup.scale.setScalar(d.globeScale);
    this.controls.update();
  }

  fit() { this.autoFrame = true; }

  /** 사용자 확대/축소 (자동 추적 해제) */
  zoom(factor) {
    this.autoFrame = false;
    const v = this._v.copy(this.camera.position).sub(this.controls.target).multiplyScalar(factor);
    const len = v.length();
    const min = this.controls.minDistance, max = this.controls.maxDistance;
    if (len < min) v.setLength(min);
    if (len > max) v.setLength(max);
    this.camera.position.copy(this.controls.target).add(v);
    this.controls.update();
  }
}
