// © 2026 김용현
// scene/tissot.js — 티소 지표 (PLAN 8.5). 각반경 4° 구면 원(36각형)을 같은 파이프라인에 통과시켜 타원을 얻는다.
import * as THREE from 'three';
import { tissotCircles, splitLines, rotatePoints } from '../geometry/clip.js';
import { positionOf } from '../geometry/pipeline.js';
import { LineLayer } from './mapLayer.js';

export class Tissot {
  constructor() {
    this.circles = tissotCircles(4);
    this.layer = new LineLayer({ color: 0xe8553f, lift: 0.006 });
    this.layer.object.renderOrder = 4;
    this.group = new THREE.Group();
    this.group.add(this.layer.object);
    this.frameCenters = [];
    this.centerPos = new Float32Array(this.circles.length * 3);
    this._p = [0, 0, 0];
  }

  setRotation(rotation) {
    this.layer.setLines(splitLines(this.circles.map((c) => c.line), rotation));
    this.frameCenters = rotatePoints(this.circles.map((c) => c.center), rotation);
  }

  update(ctx) {
    this.layer.update(ctx);
    const p = this._p, cp = this.centerPos;
    for (let i = 0; i < this.frameCenters.length; i++) {
      positionOf(ctx, this.frameCenters[i][0], this.frameCenters[i][1], p);
      cp[3 * i] = p[0]; cp[3 * i + 1] = p[1]; cp[3 * i + 2] = p[2];
    }
  }

  /**
   * 화면 좌표(ndc)에서 가장 가까운 원의 인덱스. 반환 { index, center:[λ,φ](지리), distancePx } | null
   */
  pick(ndcX, ndcY, camera, worldMatrix, viewportW, viewportH, maxPx = 18) {
    const v = new THREE.Vector3();
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.circles.length; i++) {
      if (Number.isNaN(this.centerPos[3 * i])) continue;
      v.set(this.centerPos[3 * i], this.centerPos[3 * i + 1], this.centerPos[3 * i + 2]).applyMatrix4(worldMatrix).project(camera);
      if (v.z > 1) continue;
      const dx = (v.x - ndcX) * viewportW / 2, dy = (v.y - ndcY) * viewportH / 2;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0 || bestD > maxPx) return null;
    return { index: best, center: this.circles[best].center, distancePx: bestD };
  }

  set visible(v) { this.group.visible = v; }
  get visible() { return this.group.visible; }
}
