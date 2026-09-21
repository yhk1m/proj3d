// © 2026 김용현
// geometry/bend.js — 종이 굽힘 B_t (PLAN 8.2). 길이가 보존되는 등장 변형만 한다.
//
// 종이 좌표 (x, y) 는 registry 의 forward 가 돌려주는 평면 좌표(단위구, 라디안)이다.
//  - 원통 : x ∈ [−πr, πr], r = cos φ₀ (접선이면 1). 축 = Y.
//  - 원뿔 : 꼭짓점이 종이 좌표 (0, ρ_A) 에 있고 ρ = |(x, ρ_A − y)|, θ = atan2(x, ρ_A − y).
//           ρ_A 는 '기준 위선(접선 위선, 할선이면 두 표준위선의 중간)'까지의 거리 = c·cot α.
//           (d3 의 ρ₀ = ρ(0) 관례와 달리 기준 위선을 y = 0 에 두어 φ₀ → 90°(평면)·0°(원통)
//            극한이 모두 연속이 되게 했다. adjusted.js 의 원추 forward 도 같은 관례를 따른다.)
//  - 평면 : 굽힘 없음. 프레임 +Z 에 접하는 평면 z = 1 에 놓는다.
//
// 원통과 원뿔은 하나의 원뿔 가족으로 다룬다(coneGeometry). n = sin α < N_CYLINDER 이면 원통 공식.

export const N_CYLINDER = 0.02;
const HALF_PI = Math.PI / 2;

/**
 * 가전면을 원뿔 하나로 통일해 기하 상수를 구한다.
 *  cylinder: φ₁ = −φ₀, φ₂ = φ₀ (r = cos φ₀)   cone: φ₁, φ₂(없으면 접선)   plane: φ₁ = φ₂ = 90°
 *  반환: { kind, alpha(반꼭지각), n(원뿔상수 = sin α), c(원점에서 모선까지 거리),
 *          r(원통 반지름 = c), yA(3D 꼭짓점 높이 = c/n), rhoA(종이 꼭짓점 y = c·cot α) }
 */
export function coneGeometry(surface, params) {
  const type = surface ? surface.type : 'cylinder';
  if (type === 'plane') return { kind: 'plane', alpha: HALF_PI, n: 1, c: 1, r: 1, yA: 1, rhoA: 0 };
  let phi1, phi2;
  if (type === 'cylinder') { phi1 = -(params.phi0 || 0); phi2 = (params.phi0 || 0); }
  else { phi1 = params.phi1 ?? 0; phi2 = params.phi2 ?? phi1; }
  if (phi2 < phi1) { const t = phi1; phi1 = phi2; phi2 = t; }
  const alpha = (phi1 + phi2) / 2;
  const n = Math.sin(alpha);
  const c = Math.cos((phi2 - phi1) / 2);
  if (n < N_CYLINDER) return { kind: 'cylinder', alpha, n, c, r: c, yA: Infinity, rhoA: Infinity };
  return { kind: 'cone', alpha, n, c, r: c, yA: c / n, rhoA: c * Math.cos(alpha) / n };
}

/**
 * B_t: 종이 좌표 (x, y) → 프레임 3D 좌표 out[0..2].
 * t ∈ [0,1]: 0 = 펼침, 1 = 완전히 씌움. 모든 t 에서 등장 변형.
 */
export function bend(surface, params, t, x, y, out = [0, 0, 0]) {
  const g = coneGeometry(surface, params);
  if (g.kind === 'plane') { out[0] = x; out[1] = y; out[2] = 1; return out; }
  if (g.kind === 'cylinder') {
    const r = g.r, kappa = t / r;
    if (kappa < 1e-6) { out[0] = x; out[1] = y; out[2] = r; return out; }
    out[0] = Math.sin(kappa * x) / kappa;
    out[1] = y;
    out[2] = r + (Math.cos(kappa * x) - 1) / kappa;
    return out;
  }
  // cone
  const dy = g.rhoA - y;
  const rho = Math.hypot(x, dy);
  const theta = Math.atan2(x, dy);
  const alphaT = HALF_PI + (g.alpha - HALF_PI) * t;
  const sa = Math.sin(alphaT), ca = Math.cos(alphaT);
  const psi = theta / sa;
  out[0] = rho * sa * Math.sin(psi);
  out[1] = g.yA - rho * ca;
  out[2] = rho * sa * Math.cos(psi);
  return out;
}

/** B_t 에서 종이의 바깥쪽 법선(단위 벡터). 지도 레이어를 종이 위로 띄울 때 쓴다. */
export function bendNormal(surface, params, t, x, y, out = [0, 0, 0]) {
  const g = coneGeometry(surface, params);
  if (g.kind === 'plane') { out[0] = 0; out[1] = 0; out[2] = 1; return out; }
  if (g.kind === 'cylinder') {
    const kappa = t / g.r;
    out[0] = Math.sin(kappa * x); out[1] = 0; out[2] = Math.cos(kappa * x);
    return out;
  }
  const dy = g.rhoA - y;
  const theta = Math.atan2(x, dy);
  const alphaT = HALF_PI + (g.alpha - HALF_PI) * t;
  const sa = Math.sin(alphaT), ca = Math.cos(alphaT);
  const psi = theta / sa;
  out[0] = ca * Math.sin(psi); out[1] = sa; out[2] = ca * Math.cos(psi);
  return out;
}

/**
 * FLAT 단계에서 종이가 떠 있는 위치(프레임 좌표 오프셋). 강체 이동으로 접선 위치(0)까지 온다.
 * 원통·평면 종이는 지구본 오른쪽(반폭 halfWidth 만큼 비켜서), 원뿔 부채꼴은 꼭짓점 높이 위쪽에서 내려온다.
 */
export function flatOffset(surface, params, halfWidth, out = [0, 0, 0]) {
  const g = coneGeometry(surface, params);
  if (g.kind === 'cone') { out[0] = 0; out[1] = 0.9; out[2] = 0; }
  else { out[0] = (halfWidth || 0) + 1.3; out[1] = 0; out[2] = 0; }
  return out;
}
