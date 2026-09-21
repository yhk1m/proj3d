// © 2026 김용현
// scene/rays.js — 광원·광선 (PLAN 8.3). 경위선 15° 교점에서만 광선을 그린다(최대 약 300개).
// 광선의 끝점은 pipeline.positionOf 가 주는 정점 위치(빛의 앞머리)와 같다. s 만 읽는다.
import * as THREE from 'three';
import { paperPosition } from '../geometry/pipeline.js';
import { unitVector } from '../geometry/rotate.js';
import { lightPosition, PARALLEL_LIGHT_DIST } from '../projections/perspective.js';

const RAY_COLOR = 0xffd166;

function glowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 230, 150, 1)');
  g.addColorStop(0.3, 'rgba(255, 200, 90, 0.55)');
  g.addColorStop(1, 'rgba(255, 180, 60, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export class Rays {
  constructor() {
    this.group = new THREE.Group();
    this.points = [];
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.LineBasicMaterial({
      color: RAY_COLOR, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;

    // 내핵: 발광 구 + PointLight + 빌보드 글로우. 광원은 항상 보여야 하므로 깊이 검사를 끄고 맨 위에 그린다.
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, depthTest: false, depthWrite: false }));
    this.core.renderOrder = 12;
    this.light = new THREE.PointLight(0xffd166, 0, 6, 1.5);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd166, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.glow.scale.set(1.1, 1.1, 1);
    this.glow.renderOrder = 13;
    // 선광원(axisOrthogonal): 지축 전체가 광원 — 발광 막대 + 가산 글로우 통
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 12), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, depthTest: false, depthWrite: false }));
    this.rod.visible = false;
    this.rod.renderOrder = 12;
    this.rodGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.04, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.rodGlow.visible = false;
    this.rodGlow.renderOrder = 13;
    // 평행광(정사): 먼 광원 평면 — 발광 원판
    this.plate = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.plate.visible = false;
    this.plate.renderOrder = 12;
    this.coreGroup = new THREE.Group();
    this.coreGroup.add(this.core, this.light, this.glow, this.rod, this.rodGlow, this.plate);
    this.group.add(this.lines, this.coreGroup);
    this._p = [0, 0, 0]; this._P = [0, 0, 0]; this._L = [0, 0, 0];
    this.setPoints([]);
  }

  /** points: 프레임 좌표 [λ', φ'] 배열 */
  setPoints(points) {
    this.points = points;
    this.pos = new Float32Array(points.length * 6);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
  }

  /**
   * ctx: pipeline 컨텍스트, intensity 0~1 (광원 밝기), raysOn: 광선을 그릴지(빛 투영 단계에서만)
   * 광원(내핵·막대)은 씌우기 단계부터 어둡게 보이다가 빛 투영에서 완전히 켜진다.
   */
  update(ctx, intensity, raysOn = true) {
    const light = ctx.light, surface = ctx.surface;
    const axis = light && light.type === 'axisOrthogonal';
    const parallel = light && light.type === 'point' && light.d === Infinity && surface && surface.type === 'plane';
    this.rod.visible = axis;
    this.rodGlow.visible = axis;
    this.plate.visible = parallel;
    this.core.visible = !axis && !parallel;
    this.glow.visible = !axis && !parallel;
    if (parallel) {
      this.coreGroup.position.set(0, 0, -PARALLEL_LIGHT_DIST);
    } else if (!axis) {
      const L = lightPosition(light, surface, [0, 0, 0], this._L);
      this.coreGroup.position.set(L[0], L[1], L[2]);
    } else {
      this.coreGroup.position.set(0, 0, 0);
    }
    this.light.intensity = 2.5 * intensity;
    this.core.material.opacity = 0.35 + 0.65 * intensity;
    this.glow.material.opacity = 0.4 + 0.6 * intensity;
    this.rod.material.opacity = 0.35 + 0.65 * intensity;
    this.rodGlow.material.opacity = 0.15 + 0.3 * intensity;
    this.plate.material.opacity = 0.15 + 0.3 * intensity;
    this.material.opacity = 0.6 * intensity;
    this.lines.visible = raysOn && intensity > 0;
    if (!this.lines.visible) return;

    // 광선은 광원 L 에서 빛의 앞머리(reach = s·rayReach)까지만 자란다. 앞머리가 구면 점 P 를 지나면
    // 정점이 P → Q 로 움직이는데, 그 위치가 곧 광선 끝이다(pipeline.positionOf 와 같은 규칙).
    const pos = this.pos, q = this._p, P = this._P, L = this._L;
    const reach = ctx.s >= 1 ? Infinity : ctx.s * ctx.rayReach;
    let o = 0;
    for (const [l, ph] of this.points) {
      paperPosition(ctx, l, ph, q);
      if (Number.isNaN(q[0])) { for (let k = 0; k < 6; k++) pos[o + k] = 0; o += 6; continue; }
      unitVector(l, ph, P);
      lightPosition(light, surface, P, L);
      const dx = q[0] - L[0], dy = q[1] - L[1], dz = q[2] - L[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      const k = Math.min(1, reach / len);
      pos[o] = L[0]; pos[o + 1] = L[1]; pos[o + 2] = L[2];
      pos[o + 3] = L[0] + dx * k; pos[o + 4] = L[1] + dy * k; pos[o + 5] = L[2] + dz * k;
      o += 6;
    }
    this.posAttr.needsUpdate = true;
  }
}
