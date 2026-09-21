// © 2026 김용현
// scene/globe.js — 지구본 (PLAN 8.1). 육지 마스크 텍스처 + 15° 경위선. 3단계에서 불투명도 1 → 0.35.
import * as THREE from 'three';
import { geoPath, geoEquirectangular } from 'd3-geo';
import { feature } from 'topojson-client';
import { unitVector } from '../geometry/rotate.js';

const D = Math.PI / 180;

/** 런타임에 TopoJSON 을 오프스크린 canvas(2048×1024, 등장방형)에 그려 육지 마스크를 만든다. 외부 이미지 없음. */
export function createLandMaskTexture(landTopo, w = 2048, h = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const proj = geoEquirectangular().scale(w / (2 * Math.PI)).translate([w / 2, h / 2]);
  const path = geoPath(proj, ctx);
  ctx.beginPath();
  path(feature(landTopo, landTopo.objects.land));
  ctx.fillStyle = '#fff';
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** 구면 격자 지오메트리. uv = (λ/2π + ½, φ/π + ½), 이음매는 λ = ±180° */
function sphereGeometry(nLon = 96, nLat = 48, radius = 1) {
  const pos = [], nrm = [], uv = [], idx = [];
  const v = [0, 0, 0];
  for (let j = 0; j <= nLat; j++) {
    const phi = -Math.PI / 2 + (Math.PI * j) / nLat;
    for (let i = 0; i <= nLon; i++) {
      const lam = -Math.PI + (2 * Math.PI * i) / nLon;
      unitVector(lam, phi, v);
      pos.push(v[0] * radius, v[1] * radius, v[2] * radius);
      nrm.push(v[0], v[1], v[2]);
      uv.push(i / nLon, j / nLat);
    }
  }
  for (let j = 0; j < nLat; j++) {
    for (let i = 0; i < nLon; i++) {
      const a = j * (nLon + 1) + i, b = a + 1, c = a + nLon + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** 15° 경위선(LineSegments 좌표) */
function graticuleSegments(stepDeg = 15, radius = 1.003) {
  const out = [];
  const v = [0, 0, 0];
  const push = (lam, phi) => { unitVector(lam, phi, v); out.push(v[0] * radius, v[1] * radius, v[2] * radius); };
  for (let lon = -180; lon < 180; lon += stepDeg) {
    for (let lat = -90; lat < 90; lat += 2) { push(lon * D, lat * D); push(lon * D, (lat + 2) * D); }
  }
  for (let lat = -75; lat <= 75; lat += stepDeg) {
    for (let lon = -180; lon < 180; lon += 2) { push(lon * D, lat * D); push((lon + 2) * D, lat * D); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

const VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D landMask;
  uniform vec3 ocean;
  uniform vec3 land;
  uniform float opacity;
  uniform vec3 lightDir;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    float m = texture2D(landMask, vUv).r;
    vec3 col = mix(ocean, land, m);
    float l = 0.62 + 0.38 * max(dot(normalize(vNormal), normalize(lightDir)), 0.0);
    gl_FragColor = vec4(col * l, opacity);
  }
`;

export class Globe {
  constructor(landTexture) {
    this.group = new THREE.Group();
    this.uniforms = {
      landMask: { value: landTexture },
      ocean: { value: new THREE.Color(0x27436f) },
      land: { value: new THREE.Color(0x9cc3b0) },
      opacity: { value: 1 },
      lightDir: { value: new THREE.Vector3(-0.35, 0.55, 0.75) },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG });
    // 표시용 구는 1 보다 아주 조금 작게(0.992) 만들어, 반지름 1 로 씌워진 종이와 접선에서 z-fighting 하지 않게 한다.
    this.mesh = new THREE.Mesh(sphereGeometry(96, 48, 0.992), this.material);
    this.mesh.renderOrder = 0;
    this.gratMaterial = new THREE.LineBasicMaterial({ color: 0xc7d6ee, transparent: true, opacity: 0.45 });
    this.graticule = new THREE.LineSegments(graticuleSegments(15, 0.996), this.gratMaterial);
    this.graticule.renderOrder = 21;
    this.group.add(this.mesh, this.graticule);
    this.setOpacity(1);
  }

  /** 1 = 불투명, 0.35 = 내부 광원이 보이게 */
  setOpacity(o) {
    const translucent = o < 0.999;
    this.uniforms.opacity.value = o;
    // 불투명할 때도 종이 깊이 패스(19) 뒤에 그려 가림 순서를 유지한다.
    this.material.transparent = true;
    this.material.depthWrite = !translucent;
    this.material.needsUpdate = true;
    this.mesh.renderOrder = 20;
    this.gratMaterial.opacity = 0.45 * o;
  }
}
