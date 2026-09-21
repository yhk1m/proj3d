// © 2026 김용현
// scene/paper.js — 종이 메시 (PLAN 8.2). 종이는 도메인 (λ', φ') 격자의 상(像) f → B_t 로 만든다.
// 정점 위치는 geometry/pipeline.js 의 합성으로만 계산한다.
import * as THREE from 'three';
import { positionOf, makeGridParam } from '../geometry/pipeline.js';

/** (nu+1)×(nv+1) 격자의 (u, v) 와 삼각형 인덱스 */
export function buildGridTopology(nu, nv) {
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = (j * (nu + 1) + i) * 2;
    uv[k] = i / nu; uv[k + 1] = j / nv;
  }
  const tris = new Uint32Array(nu * nv * 6);
  let t = 0;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    tris[t++] = a; tris[t++] = b; tris[t++] = d;
    tris[t++] = a; tris[t++] = d; tris[t++] = c;
  }
  return { uv, tris, count: (nu + 1) * (nv + 1) };
}

/**
 * 격자 정점 배열(NaN 포함 가능)을 인덱스 없는 삼각형 버퍼로 흩뿌린다.
 * NaN 정점이 하나라도 있는 삼각형은 퇴화(세 점을 같은 점으로)시켜 그리지 않는다.
 * extra: { src: Float32Array(count*n), dst: Float32Array(tris.length*n), n } 들의 배열 (geo, arrive 등)
 */
export function scatterTriangles(gridPos, tris, dst, extras = []) {
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const bad = Number.isNaN(gridPos[a * 3]) || Number.isNaN(gridPos[b * 3]) || Number.isNaN(gridPos[c * 3]);
    let ia = a, ib = b, ic = c;
    if (bad) {
      const good = !Number.isNaN(gridPos[a * 3]) ? a : !Number.isNaN(gridPos[b * 3]) ? b : !Number.isNaN(gridPos[c * 3]) ? c : -1;
      if (good < 0) { for (let k = 0; k < 9; k++) dst[t * 3 + k] = 0; for (const e of extras) for (let k = 0; k < e.n * 3; k++) e.dst[t * e.n + k] = 0; continue; }
      ia = ib = ic = good;
    }
    const o = t * 3;
    dst[o] = gridPos[ia * 3]; dst[o + 1] = gridPos[ia * 3 + 1]; dst[o + 2] = gridPos[ia * 3 + 2];
    dst[o + 3] = gridPos[ib * 3]; dst[o + 4] = gridPos[ib * 3 + 1]; dst[o + 5] = gridPos[ib * 3 + 2];
    dst[o + 6] = gridPos[ic * 3]; dst[o + 7] = gridPos[ic * 3 + 1]; dst[o + 8] = gridPos[ic * 3 + 2];
    for (const e of extras) {
      const n = e.n, eo = t * n;
      for (let k = 0; k < n; k++) { e.dst[eo + k] = e.src[ia * n + k]; e.dst[eo + n + k] = e.src[ib * n + k]; e.dst[eo + 2 * n + k] = e.src[ic * n + k]; }
    }
  }
}

export class Paper {
  constructor({ nu = 128, nv = 64 } = {}) {
    this.nu = nu; this.nv = nv;
    this.topo = buildGridTopology(nu, nv);
    this.gridPos = new Float32Array(this.topo.count * 3);
    this.triPos = new Float32Array(this.topo.tris.length * 3);
    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.triPos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.material = new THREE.MeshLambertMaterial({
      color: 0xf4eedc, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;

    // 종이 가장자리 선
    const nEdge = 2 * (nu + nv);
    this.edgePos = new Float32Array(nEdge * 2 * 3);
    this.edgeGeometry = new THREE.BufferGeometry();
    this.edgeAttr = new THREE.BufferAttribute(this.edgePos, 3);
    this.edgeAttr.setUsage(THREE.DynamicDrawUsage);
    this.edgeGeometry.setAttribute('position', this.edgeAttr);
    this.edge = new THREE.LineSegments(this.edgeGeometry, new THREE.LineBasicMaterial({ color: 0xc9bf9f, transparent: true, opacity: 0.9 }));
    this.edge.frustumCulled = false;
    this.edge.renderOrder = 2;

    this.group = new THREE.Group();
    this.group.add(this.mesh, this.edge);
    this._g = [0, 0];
    this._p = [0, 0, 0];
  }

  /** ctx: pipeline 컨텍스트. 종이는 항상 s = 1(구면과 섞지 않음). */
  update(ctx) {
    const paperCtx = { ...ctx, s: 1 };
    const param = makeGridParam(ctx.domain);
    const { uv, tris, count } = this.topo;
    const gp = this.gridPos, g = this._g, p = this._p;
    for (let k = 0; k < count; k++) {
      param.toGeo(uv[2 * k], uv[2 * k + 1], g);
      positionOf(paperCtx, g[0], g[1], p);
      gp[3 * k] = p[0]; gp[3 * k + 1] = p[1]; gp[3 * k + 2] = p[2];
    }
    scatterTriangles(gp, tris, this.triPos);
    this.posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this._updateEdge(param.kind);
  }

  _updateEdge(kind) {
    const { nu, nv } = this;
    const gp = this.gridPos, ep = this.edgePos;
    const ring = [];
    if (kind === 'cap') {
      // 원판: v = 0 은 중심점, u = 0/1 은 같은 반지름 선이므로 바깥 테두리(v = 1)만 그린다
      for (let i = 0; i <= nu; i++) ring.push(nv * (nu + 1) + i);
    } else {
      for (let i = 0; i < nu; i++) ring.push(i);                       // v = 0
      for (let j = 0; j < nv; j++) ring.push(j * (nu + 1) + nu);        // u = 1
      for (let i = nu; i > 0; i--) ring.push(nv * (nu + 1) + i);        // v = 1
      for (let j = nv; j > 0; j--) ring.push(j * (nu + 1));             // u = 0
    }
    ep.fill(0);
    let o = 0;
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length];
      const bad = Number.isNaN(gp[a * 3]) || Number.isNaN(gp[b * 3]);
      const ia = bad ? (Number.isNaN(gp[a * 3]) ? b : a) : a;
      const ib = bad ? ia : b;
      ep[o++] = gp[ia * 3]; ep[o++] = gp[ia * 3 + 1]; ep[o++] = gp[ia * 3 + 2];
      ep[o++] = gp[ib * 3]; ep[o++] = gp[ib * 3 + 1]; ep[o++] = gp[ib * 3 + 2];
    }
    this.edgeAttr.needsUpdate = true;
  }
}
