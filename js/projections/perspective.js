// © 2026 김용현
// projections/perspective.js — 빛 투영 계열 forward (PLAN 3.1 '빛'). 단위구, 라디안, 프레임 좌표.
// 모두 실제 원근 투영이므로 광원 L, 구면 점 P, 도착점 Q 가 한 직선 위에 놓인다(tests/verify 2번).
import { coneGeometry } from '../geometry/bend.js';

const HALF_PI = Math.PI / 2;

/** 중심원통도법: 중심 점광원 → 반지름 r = cos φ₀ 인 원통. y = r·tan φ */
export function centralCylindrical(lam, phi, params) {
  const r = Math.cos(params.phi0 || 0);
  return [r * lam, r * Math.tan(phi)];
}

/** 람베르트 정적원통도법: 축에서 수평으로 나가는 평행광 → 접선 원통(r = 1). y = sin φ */
export function lambertCylindricalEA(lam, phi) {
  return [lam, Math.sin(phi)];
}

/**
 * 중심원추도법: 중심 점광원 → 표준위선 φ₁(, φ₂) 을 지나는 원뿔.
 *  ρ = y_A·cos φ / cos(φ − α),  θ = n·λ,  종이 좌표 x = ρ sin θ, y = ρ_A − ρ cos θ
 *  접선(φ₂ = φ₁ = φ₀)이면 ρ = cot φ₀ − tan(φ − φ₀), n = sin φ₀ 과 같다.
 *  n < N_CYLINDER 이면 원통 공식으로 넘어간다(φ₀ 슬라이더 연속 변형).
 */
export function centralConic(lam, phi, params) {
  const g = coneGeometry({ type: 'cone' }, params);
  if (g.kind === 'cylinder') return [g.r * lam, g.r * Math.tan(phi)];
  const rho = g.yA * Math.cos(phi) / Math.cos(phi - g.alpha);
  const theta = g.n * lam;
  return [rho * Math.sin(theta), g.rhoA - rho * Math.cos(theta)];
}

/**
 * 방위 원근 투영(평면). 광원은 축(프레임 Z) 위 (0, 0, −d), 종이는 z = 1 접평면.
 *  ρ = (1 + d)·sin c / (d + cos c),  c = 접점에서의 각거리
 *  d = 0 심사, d = 1 평사(ρ = 2 tan(c/2)), d = ∞ 정사(ρ = sin c)
 */
export function azimuthalPerspective(lam, phi, params) {
  const d = params.d ?? 0;
  const cp = Math.cos(phi), cosc = cp * Math.cos(lam);
  const k = d === Infinity ? 1 : (1 + d) / (d + cosc);
  return [k * cp * Math.sin(lam), k * Math.sin(phi)];
}

/** 방위 원근 투영의 허용 각거리(라디안): d=0 → 60°, d=1 → 120°, d=∞ → 90° */
export function perspectiveMaxAngularDist(d) {
  if (d === Infinity) return HALF_PI;
  return Math.acos(-Math.min(d, 1)) * (2 / 3);
}

/**
 * 광원 위치(프레임 좌표). light = { type:'point', d } | { type:'axisOrthogonal' }
 *  point : 원통·원뿔은 원점(d = 0), 평면은 (0, 0, −d)
 *  axisOrthogonal : 구면 점 P 와 같은 높이의 축 위 점 (0, P_y, 0)
 */
export function lightPosition(light, surface, P, out = [0, 0, 0]) {
  out[0] = out[1] = out[2] = 0;
  if (!light) return out;
  if (light.type === 'axisOrthogonal') { out[1] = P[1]; return out; }
  if (surface && surface.type === 'plane') {
    out[2] = -(light.d === Infinity ? 1e6 : light.d);
  }
  return out;
}
