// © 2026 김용현
// scene/mapLayer.js — 지도 레이어 (PLAN 8.4): 격자 메시(육지 마스크) + 선(해안선·경위선).
// 모든 정점은 프레임 좌표 (λ', φ') 로 보관하고 매 프레임 pipeline.positionOf 로 3D 위치를 구한다.
// 격자 메시의 프래그먼트 셰이더는 (λ', φ') 를 역회전(toGeo = Mᵀ)해 지리좌표로 육지 마스크를 샘플링한다.
import * as THREE from 'three';
import { positionOf, makeGridParam } from '../geometry/pipeline.js';
import { buildGridTopology, scatterTriangles } from './paper.js';

export const INK = new THREE.Color(0x1b2a4a);
export const RAY = new THREE.Color(0xffd166);
const LIFT_GRID = 0.002, LIFT_LINE = 0.004;

// (λ', φ') 대신 프레임 단위벡터를 varying 으로 넘긴다. 각도를 보간하면 λ' = ±180° 를 걸치는 삼각형에서
// 값이 0 을 지나며 엉뚱한 경도를 샘플링하지만(모자 매개화의 뒷반구 자오선), 벡터 보간은 어디서나 연속이다.
const GRID_VERT = /* glsl */ `
  attribute vec3 geo;
  attribute float arrive;
  varying vec3 vGeo;
  varying float vArrive;
  void main() {
    vGeo = geo;
    vArrive = arrive;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GRID_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D landMask;
  uniform mat3 toGeo;
  uniform vec3 landColor;
  uniform vec3 rayColor;
  uniform float opacity;
  varying vec3 vGeo;
  varying float vArrive;
  void main() {
    vec3 v = normalize(vGeo);
    vec3 g = toGeo * v;
    float lam = atan(g.x, g.z);
    float phi = asin(clamp(g.y, -1.0, 1.0));
    vec2 uv = vec2(lam / 6.28318530718 + 0.5, phi / 3.14159265359 + 0.5);
    float land = texture2D(landMask, uv).r;
    if (land < 0.5) discard;
    float a = smoothstep(0.85, 1.0, vArrive);
    vec3 col = mix(rayColor, landColor, a);
    gl_FragColor = vec4(col, opacity * mix(0.5, 1.0, a));
  }
`;

/** 프레임 좌표 선 집합 → LineSegments (정점색으로 광선색→잉크색 전환) */
export class LineLayer {
  constructor({ color = INK, lineOpacity = 1, lift = LIFT_LINE, depthTest = true } = {}) {
    this.color = color instanceof THREE.Color ? color : new THREE.Color(color);
    this.lift = lift;
    this.lines = [];
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: lineOpacity < 1, opacity: lineOpacity, depthTest });
    this.object = new THREE.LineSegments(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 3;
    this._p = [0, 0, 0]; this._n = [0, 0, 0];
    this.setLines([]);
  }

  /** lines: Float64Array[(λ', φ') …] 배열 (프레임 좌표) */
  setLines(lines) {
    this.lines = lines;
    let nSeg = 0;
    for (const l of lines) nSeg += Math.max(0, l.length / 2 - 1);
    this.segCount = nSeg;
    this.pos = new Float32Array(nSeg * 6);
    this.col = new Float32Array(nSeg * 6);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('color', this.colAttr);
    this.geometry.setDrawRange(0, nSeg * 2);
    this.dirty = true;
  }

  update(ctx) {
    const pos = this.pos, col = this.col, p = this._p, n = this._n;
    const c0 = RAY, c1 = this.color;
    let o = 0;
    let vx = 0, vy = 0, vz = 0, vr = 0, vg = 0, vb = 0, vok = false;
    for (const line of this.lines) {
      for (let i = 0; i < line.length; i += 2) {
        const sv = positionOf(ctx, line[i], line[i + 1], p, n);
        const ok = !Number.isNaN(p[0]);
        let x = 0, y = 0, z = 0, r = 0, g = 0, b = 0;
        if (ok) {
          x = p[0] + n[0] * this.lift; y = p[1] + n[1] * this.lift; z = p[2] + n[2] * this.lift;
          const a = sv < 0.85 ? 0 : sv >= 1 ? 1 : (sv - 0.85) / 0.15;
          r = c0.r + (c1.r - c0.r) * a; g = c0.g + (c1.g - c0.g) * a; b = c0.b + (c1.b - c0.b) * a;
        }
        if (i > 0) {
          if (ok && vok) {
            pos[o] = vx; pos[o + 1] = vy; pos[o + 2] = vz; pos[o + 3] = x; pos[o + 4] = y; pos[o + 5] = z;
            col[o] = vr; col[o + 1] = vg; col[o + 2] = vb; col[o + 3] = r; col[o + 4] = g; col[o + 5] = b;
          } else {
            // 도메인 밖 정점이 포함된 선분은 버린다(퇴화)
            const kx = ok ? x : vx, ky = ok ? y : vy, kz = ok ? z : vz;
            pos[o] = kx; pos[o + 1] = ky; pos[o + 2] = kz; pos[o + 3] = kx; pos[o + 4] = ky; pos[o + 5] = kz;
          }
          o += 6;
        }
        vx = x; vy = y; vz = z; vr = r; vg = g; vb = b; vok = ok;
      }
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}

/** 2° 격자 메시 + 육지 마스크 셰이더 */
export class LandGrid {
  constructor(landTexture, { lowPower = false } = {}) {
    this.lowPower = lowPower;
    this.uniforms = {
      landMask: { value: landTexture },
      toGeo: { value: new THREE.Matrix3() },
      landColor: { value: INK.clone() },
      rayColor: { value: RAY.clone() },
      opacity: { value: 0.82 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: GRID_VERT, fragmentShader: GRID_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.kind = null;
    this._g = [0, 0]; this._p = [0, 0, 0]; this._n = [0, 0, 0];
  }

  setRotation(rotation) {
    const m = rotation.toWorld;
    this.uniforms.toGeo.value.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
  }

  _ensureGrid(kind) {
    if (this.kind === kind) return;
    this.kind = kind;
    const scale = this.lowPower ? 0.5 : 1;
    const nu = Math.round(180 * scale), nv = Math.round((kind === 'cap' ? 60 : 90) * scale);
    this.topo = buildGridTopology(nu, nv);
    const n = this.topo.count;
    this.gridPos = new Float32Array(n * 3);
    this.gridGeo = new Float32Array(n * 3);
    this.gridArr = new Float32Array(n);
    const tn = this.topo.tris.length;
    this.triPos = new Float32Array(tn * 3);
    this.triGeo = new Float32Array(tn * 3);
    this.triArr = new Float32Array(tn);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.triPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('geo', new THREE.BufferAttribute(this.triGeo, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('arrive', new THREE.BufferAttribute(this.triArr, 1).setUsage(THREE.DynamicDrawUsage));
  }

  update(ctx) {
    const param = makeGridParam(ctx.domain);
    this._ensureGrid(param.kind);
    const { uv, tris, count } = this.topo;
    const gp = this.gridPos, gg = this.gridGeo, ga = this.gridArr, g = this._g, p = this._p, n = this._n;
    for (let k = 0; k < count; k++) {
      param.toGeo(uv[2 * k], uv[2 * k + 1], g);
      const sv = positionOf(ctx, g[0], g[1], p, n);
      gp[3 * k] = p[0] + n[0] * LIFT_GRID; gp[3 * k + 1] = p[1] + n[1] * LIFT_GRID; gp[3 * k + 2] = p[2] + n[2] * LIFT_GRID;
      const cp = Math.cos(g[1]);
      gg[3 * k] = cp * Math.sin(g[0]); gg[3 * k + 1] = Math.sin(g[1]); gg[3 * k + 2] = cp * Math.cos(g[0]);
      ga[k] = sv;
    }
    scatterTriangles(gp, tris, this.triPos, [
      { src: gg, dst: this.triGeo, n: 3 },
      { src: ga, dst: this.triArr, n: 1 },
    ]);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.geo.needsUpdate = true;
    this.geometry.attributes.arrive.needsUpdate = true;
  }
}

/** 지도 레이어 묶음: 육지 격자 + 해안선 + 경위선 */
export class MapLayer {
  constructor(landTexture, { lowPower = false } = {}) {
    this.group = new THREE.Group();
    this.grid = new LandGrid(landTexture, { lowPower });
    this.coast = new LineLayer({ color: INK });
    this.graticule = new LineLayer({ color: 0x5b6f96, lineOpacity: 0.8 });
    this.group.add(this.grid.mesh, this.coast.object, this.graticule.object);
  }

  setLines({ coast, graticule }) {
    this.coast.setLines(coast);
    this.graticule.setLines(graticule);
  }

  setRotation(rotation) { this.grid.setRotation(rotation); }

  update(ctx) {
    this.grid.update(ctx);
    this.coast.update(ctx);
    this.graticule.update(ctx);
  }

  set visible(v) { this.group.visible = v; }
  get visible() { return this.group.visible; }
}
