// © 2026 김용현
// geometry/rotate.js — aspect 회전 R (PLAN 6.1). 가전면을 돌리지 않고 좌표를 돌린다.
//
// 가전면 기준 좌표계(이하 '프레임')는 다음 규칙으로 정한다.
//   +Z : 지도 중심 C(λc, φc)            → 프레임 좌표 (λ'=0, φ'=0)
//   +Y : C에서 '위쪽' 방향(북쪽 접선을 시계 방향으로 ψ만큼 돌린 것) = 가전면의 축 방향
//   +X : Y × Z (오른손 좌표계)
// 정축 원통(C=(0,0), ψ=0)에서는 항등 회전이 된다. 평면의 정축(극)은 C=(0°, 90°)로 표현한다.
//
// 3D 위치 P(λ,φ) = (cos φ sin λ, sin φ, cos φ cos λ) 로 두면(three.js Y-up, λ=0 이 +Z),
//   프레임 좌표 v' = M · v,  M 의 행 = (ex, ey, ez).
// 종이 그룹에는 역회전 Mᵀ 를 쿼터니언으로 건다(scene 쪽 책임).

const DEG = Math.PI / 180;

/** 지리좌표 → 단위 벡터 (Y-up, λ=0 → +Z) */
export function unitVector(lam, phi, out = [0, 0, 0]) {
  const c = Math.cos(phi);
  out[0] = c * Math.sin(lam);
  out[1] = Math.sin(phi);
  out[2] = c * Math.cos(lam);
  return out;
}

/** 단위 벡터 → 지리좌표 [λ, φ] */
export function lonLat(v, out = [0, 0]) {
  out[0] = Math.atan2(v[0], v[2]);
  out[1] = Math.asin(Math.max(-1, Math.min(1, v[1])));
  return out;
}

/**
 * aspect 프리셋. surface.type 별로 기준점이 다르다.
 *  - cylinder / cone : 정축 = 적도·그리니치 중심, 횡축 = 127°E 자오선을 따라(우리나라 TM), 사축 = 서울 중심
 *  - plane           : 정축 = 북극 접점, 횡축 = 적도 (0°,0°) 접점, 사축 = 서울 접점
 * center 는 도, azimuth 는 북쪽에서 시계 방향(도).
 */
export const ASPECT_PRESETS = {
  normal: {
    cylinder: { center: [0, 0], azimuth: 0 },
    cone: { center: [0, 0], azimuth: 0 },
    plane: { center: [0, 90], azimuth: 0 },
  },
  transverse: {
    cylinder: { center: [127, 0], azimuth: 270 },
    cone: { center: [127, 0], azimuth: 270 },
    plane: { center: [0, 0], azimuth: 0 },
  },
  oblique: {
    cylinder: { center: [127, 37.5], azimuth: 0 },
    cone: { center: [127, 37.5], azimuth: 0 },
    plane: { center: [127, 37.5], azimuth: 0 },
  },
};

export const ASPECT_LABELS = {
  cylinder: { normal: '정축', transverse: '횡축', oblique: '사축' },
  cone: { normal: '정축', transverse: '횡축', oblique: '사축' },
  plane: { normal: '정축(극)', transverse: '횡축(적도)', oblique: '사축' },
};

export function aspectSpec(aspect, surfaceType) {
  const group = ASPECT_PRESETS[aspect] || ASPECT_PRESETS.normal;
  return group[surfaceType] || group.cylinder;
}

/**
 * 프레임 행렬 M (행 우선 9개: ex, ey, ez). spec = { center:[λc°, φc°], azimuth:ψ° }
 */
export function frameMatrix(spec) {
  const lc = spec.center[0] * DEG, pc = spec.center[1] * DEG, psi = (spec.azimuth || 0) * DEG;
  const ez = unitVector(lc, pc);
  // C 에서의 북쪽 접선·동쪽 접선 (극에서도 연속인 식)
  const north = [-Math.sin(pc) * Math.sin(lc), Math.cos(pc), -Math.sin(pc) * Math.cos(lc)];
  const east = [Math.cos(lc), 0, -Math.sin(lc)];
  const ey = [
    Math.cos(psi) * north[0] + Math.sin(psi) * east[0],
    Math.cos(psi) * north[1] + Math.sin(psi) * east[1],
    Math.cos(psi) * north[2] + Math.sin(psi) * east[2],
  ];
  const ex = [
    ey[1] * ez[2] - ey[2] * ez[1],
    ey[2] * ez[0] - ey[0] * ez[2],
    ey[0] * ez[1] - ey[1] * ez[0],
  ];
  return new Float64Array([ex[0], ex[1], ex[2], ey[0], ey[1], ey[2], ez[0], ez[1], ez[2]]);
}

/**
 * 회전 객체를 만든다.
 *  forward(λ, φ) → [λ', φ']   (지리 → 프레임)
 *  inverse(λ', φ') → [λ, φ]   (프레임 → 지리)
 *  M       : 행 우선 3×3 (지리 벡터 → 프레임 벡터)
 *  toWorld : 행 우선 3×3 Mᵀ (프레임 벡터 → 지리 벡터). 종이 그룹 회전·프래그먼트 셰이더에 쓴다.
 */
export function makeRotation(spec) {
  const M = frameMatrix(spec);
  const toWorld = new Float64Array([M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]);
  const isIdentity = Math.abs(M[0] - 1) + Math.abs(M[4] - 1) + Math.abs(M[8] - 1) +
    Math.abs(M[1]) + Math.abs(M[2]) + Math.abs(M[3]) + Math.abs(M[5]) + Math.abs(M[6]) + Math.abs(M[7]) < 1e-12;
  const tmp = [0, 0, 0];
  function forward(lam, phi, out = [0, 0]) {
    if (isIdentity) { out[0] = lam; out[1] = phi; return out; }
    unitVector(lam, phi, tmp);
    const x = M[0] * tmp[0] + M[1] * tmp[1] + M[2] * tmp[2];
    const y = M[3] * tmp[0] + M[4] * tmp[1] + M[5] * tmp[2];
    const z = M[6] * tmp[0] + M[7] * tmp[1] + M[8] * tmp[2];
    out[0] = Math.atan2(x, z);
    out[1] = Math.asin(Math.max(-1, Math.min(1, y)));
    return out;
  }
  function inverse(lamP, phiP, out = [0, 0]) {
    if (isIdentity) { out[0] = lamP; out[1] = phiP; return out; }
    unitVector(lamP, phiP, tmp);
    const x = toWorld[0] * tmp[0] + toWorld[1] * tmp[1] + toWorld[2] * tmp[2];
    const y = toWorld[3] * tmp[0] + toWorld[4] * tmp[1] + toWorld[5] * tmp[2];
    const z = toWorld[6] * tmp[0] + toWorld[7] * tmp[1] + toWorld[8] * tmp[2];
    out[0] = Math.atan2(x, z);
    out[1] = Math.asin(Math.max(-1, Math.min(1, y)));
    return out;
  }
  return { spec, M, toWorld, isIdentity, forward, inverse };
}

export const IDENTITY_ROTATION = makeRotation({ center: [0, 0], azimuth: 0 });
