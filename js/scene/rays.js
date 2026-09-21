// © 2026 김용현
// scene/rays.js — 광원·광선 (PLAN 8.3). 경위선 15° 교점에서만 광선을 그린다(최대 약 300개).
// 광선의 끝점은 pipeline.positionOf 가 주는 정점 위치(빛의 앞머리)와 같다. s 만 읽는다.
import * as THREE from 'three';
import { positionOf } from '../geometry/pipeline.js';
import { unitVector } from '../geometry/rotate.js';
import { lightPosition } from '../projections/perspective.js';

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

    // 내핵: 발광 구 + PointLight + 빌보드 글로우
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    this.core.renderOrder = 10;
    this.light = new THREE.PointLight(0xffd166, 0, 6, 1.5);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd166, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.glow.scale.set(0.9, 0.9, 1);
    this.glow.renderOrder = 11;
    // 축 광원(axisOrthogonal)용 발광 막대
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 12), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    this.rod.visible = false;
    this.rod.renderOrder = 10;
    this.coreGroup = new THREE.Group();
    this.coreGroup.add(this.core, this.light, this.glow, this.rod);
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

  /** ctx: pipeline 컨텍스트, intensity 0~1 */
  update(ctx, intensity) {
    const light = ctx.light, surface = ctx.surface;
    const axis = light && light.type === 'axisOrthogonal';
    this.rod.visible = axis;
    this.core.visible = !axis;
    this.glow.visible = !axis;
    if (!axis) {
      const L = lightPosition(light, surface, [0, 0, 0], this._L);
      this.coreGroup.position.set(L[0], L[1], Math.max(L[2], -3));
    } else {
      this.coreGroup.position.set(0, 0, 0);
    }
    this.light.intensity = 2.5 * intensity;
    this.material.opacity = 0.6 * intensity;
    this.glow.material.opacity = intensity;
    this.lines.visible = intensity > 0;

    const pos = this.pos, p = this._p, P = this._P, L = this._L;
    let o = 0;
    for (const [l, ph] of this.points) {
      positionOf(ctx, l, ph, p);
      if (Number.isNaN(p[0])) { for (let k = 0; k < 6; k++) pos[o + k] = 0; o += 6; continue; }
      unitVector(l, ph, P);
      lightPosition(light, surface, P, L);
      pos[o] = L[0]; pos[o + 1] = L[1]; pos[o + 2] = Math.max(L[2], -3);
      pos[o + 3] = p[0]; pos[o + 4] = p[1]; pos[o + 5] = p[2];
      o += 6;
    }
    this.posAttr.needsUpdate = true;
  }
}
