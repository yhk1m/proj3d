// © 2026 김용현
// scene/paper.js — 종이 메시 (PLAN 8.2). 종이는 도메인 (λ', φ') 격자의 상(像) f → B_t 로 만든다.
// 정점 위치는 geometry/pipeline.js 의 합성으로만 계산한다. 격자 유틸은 geometry/mesh.js.
import * as THREE from 'three';
import { positionOf, makeGridParam } from '../geometry/pipeline.js';
import { buildGridTopology, scatterTriangles, fixLobeSeams, cutEdgeLines } from '../geometry/mesh.js';
import { getState } from '../state.js';
import { contactGLSL, contactUniforms, updateContact } from './contact.js';

export { buildGridTopology, scatterTriangles };

const MAX_CUT_SEGMENTS = 8 * 46; // 절개선 8줄(4개 × 양쪽) × 2° 간격

export class Paper {
  // 2° 격자: 절개 자오선(−40°, −100°, −20°, 80°)이 격자선 위에 오게 한다
  constructor({ nu = 180, nv = 90 } = {}) {
    this.nu = nu; this.nv = nv;
    this.topo = buildGridTopology(nu, nv);
    this.gridPos = new Float32Array(this.topo.count * 3);
    this.gridLatLon = new Float64Array(this.topo.count * 2); // 절개선 판정용 — Float32 는 극에서 도메인 밖으로 밀린다
    this.triPos = new Float32Array(this.topo.tris.length * 3);
    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.triPos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.material = new THREE.MeshLambertMaterial({
      color: 0xffffff, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.07,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
    });
    // 위치 계산은 그대로 두고 색만 조절. UV는 종이의 도메인 격자에 붙어 움직인다.
    const paperUV = new Float32Array(this.topo.tris.length * 2);
    for (let i = 0; i < this.topo.tris.length; i++) {
      const k = this.topo.tris[i];
      paperUV[2 * i] = this.topo.uv[2 * k];
      paperUV[2 * i + 1] = this.topo.uv[2 * k + 1];
    }
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(paperUV, 2));
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPaperUV;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaperUV = uv;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vPaperUV;
        float paperHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float paperNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(paperHash(i), paperHash(i + vec2(1.0, 0.0)), f.x),
            mix(paperHash(i + vec2(0.0, 1.0)), paperHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
      `)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // 얼룩·긴 섬유 대신 짧고 불규칙한 요철 입자. 입자의 밝은 면과 어두운 면을 쌍으로 표현.
          vec2 grainUV = vPaperUV * vec2(470.0, 610.0);
          float footprint = max(fwidth(grainUV.x), fwidth(grainUV.y));
          float relief = paperNoise(grainUV + vec2(0.32, 0.24)) - paperNoise(grainUV - vec2(0.32, 0.24));
          float tooth = paperHash(floor(grainUV * 1.9));
          float detail = 1.0 - smoothstep(0.8, 2.2, footprint);
          float edge = min(min(vPaperUV.x, 1.0 - vPaperUV.x), min(vPaperUV.y, 1.0 - vPaperUV.y));
          diffuseColor.rgb *= (0.98 + detail * (0.32 * relief + 0.16 * (tooth - 0.5)))
            * mix(0.97, 1.0, smoothstep(0.0, 0.006, edge));
          if (!gl_FrontFacing) diffuseColor.rgb *= 0.94;
        `);
    };
    this.material.customProgramCacheKey = () => 'paper-white-dry-grain-v4';
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;

    // 광선(9~13)은 보인 뒤, 지구(20~21)에만 실제 종이의 가림을 적용.
    // 별도 근사면 없이 동일한 pipeline geometry/세계 변환으로 깊이를 기록한다.
    this.globeOccluder = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide, transparent: true, opacity: 0,
      colorWrite: false, depthWrite: true, forceSinglePass: true,
    }));
    this.globeOccluder.frustumCulled = false;
    this.globeOccluder.renderOrder = 19;

    // 접촉부만 불투명하게 깊이를 기록한다. 반투명 지구가 나중에 그려져도
    // 종이와 만나는 선을 덮지 않으며, 실제로 종이 밖으로 나온 부분은 유지한다.
    // 위치는 별도로 만들지 않고 pipeline으로 계산한 종이 geometry를 공유한다.
    this.contactMaterial = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      depthWrite: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      uniforms: contactUniforms(),
      vertexShader: `
        varying vec3 vPaperPosition;
        void main() {
          vPaperPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        ${contactGLSL}
        varying vec3 vPaperPosition;
        void main() {
          float d = contactDistance(vPaperPosition);
          if (contactEnabled < 0.5 || d > 0.014) discard;
          float pixelWidth = max(fwidth(d), 0.0001);
          float ink = 1.0 - smoothstep(pixelWidth * 0.2, pixelWidth * 0.8, d);
          // 가림 폭과 선 폭을 분리: 흰 종이로 가리고 중심만 약 1px 표시.
          gl_FragColor = vec4(mix(vec3(0.92), vec3(0.60, 0.40, 0.14), ink), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.contact = new THREE.Mesh(this.geometry, this.contactMaterial);
    this.contact.frustumCulled = false;
    this.contact.renderOrder = 0.5;

    // 종이 가장자리 선 (+ 절개선)
    const nEdge = 2 * (nu + nv) + MAX_CUT_SEGMENTS;
    this.edgePos = new Float32Array(nEdge * 2 * 3);
    this.edgeGeometry = new THREE.BufferGeometry();
    this.edgeAttr = new THREE.BufferAttribute(this.edgePos, 3);
    this.edgeAttr.setUsage(THREE.DynamicDrawUsage);
    this.edgeGeometry.setAttribute('position', this.edgeAttr);
    this.edge = new THREE.LineSegments(this.edgeGeometry, new THREE.LineBasicMaterial({ color: 0xc7ccd2, transparent: true, opacity: 0.9 }));
    this.edge.frustumCulled = false;
    this.edge.renderOrder = 2;

    this.group = new THREE.Group();
    this.group.add(this.mesh, this.edge, this.contact, this.globeOccluder);
    this._g = [0, 0];
    this._p = [0, 0, 0];
    this._translucent = false;
  }

  /** 빛 투영 단계에서 종이를 반투명하게 해 안쪽의 광원·광선·지구본이 보이게 한다. */
  setOpacity(o) {
    const tr = o < 0.995;
    this.material.opacity = o;
    if (tr !== this._translucent) {
      this._translucent = tr;
      this.material.transparent = tr;
      this.material.depthWrite = !tr;
      this.material.needsUpdate = true;
    }
    this.edge.material.opacity = 0.9 * o;
  }

  /** ctx: pipeline 컨텍스트. 종이는 항상 s = 1(구면과 섞지 않음). */
  update(ctx) {
    // 빛 단계에서 종이 자체의 f와 B_t는 고정이다(s는 지도에만 적용). 재계산할 필요가 없다.
    const state = getState();
    updateContact(this.contactMaterial.uniforms);
    this.contact.visible = this.contactMaterial.uniforms.contactEnabled.value > 0;
    const key = state.stage === 'project' ? JSON.stringify([state.projection, ctx.surface, ctx.params, ctx.domain, ctx.bendT]) : null;
    if (key !== null && this._shapeKey === key) return;
    this._shapeKey = key;
    const paperCtx = { ...ctx, s: 1 };
    const param = makeGridParam(ctx.domain);
    const { uv, tris, count } = this.topo;
    const gp = this.gridPos, gl = this.gridLatLon, g = this._g, p = this._p;
    for (let k = 0; k < count; k++) {
      param.toGeo(uv[2 * k], uv[2 * k + 1], g);
      positionOf(paperCtx, g[0], g[1], p);
      gp[3 * k] = p[0]; gp[3 * k + 1] = p[1]; gp[3 * k + 2] = p[2];
      gl[2 * k] = g[0]; gl[2 * k + 1] = g[1];
    }
    scatterTriangles(gp, tris, this.triPos);
    const cuts = ctx.domain.cuts || null;
    if (cuts) fixLobeSeams(gl, tris, this.triPos, cuts, (l, ph, out) => positionOf(paperCtx, l, ph, out));
    this.posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this._updateEdge(param.kind, cuts, paperCtx);
  }

  _updateEdge(kind, cuts, paperCtx) {
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
    // 절개선: 양쪽 로브의 가장자리를 각각 그린다
    if (cuts) {
      const p = this._p;
      for (const line of cutEdgeLines(cuts)) {
        let px = NaN, py = 0, pz = 0;
        for (let i = 0; i < line.length; i += 2) {
          positionOf(paperCtx, line[i], line[i + 1], p);
          if (i > 0 && !Number.isNaN(px) && !Number.isNaN(p[0]) && o + 6 <= ep.length) {
            ep[o++] = px; ep[o++] = py; ep[o++] = pz;
            ep[o++] = p[0]; ep[o++] = p[1]; ep[o++] = p[2];
          }
          px = p[0]; py = p[1]; pz = p[2];
        }
      }
    }
    this.edgeGeometry.setDrawRange(0, o / 3);
    this.edgeAttr.needsUpdate = true;
  }
}
