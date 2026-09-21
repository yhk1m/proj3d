// © 2026 김용현
// geometry/pipeline.js — 6.1 단일 파이프라인의 합성. 모든 지도 정점의 3D 위치는 여기서만 계산한다.
//
//   (λ', φ') ──f──▶ (x, y) ──B_t──▶ (X, Y, Z)      [프레임 좌표]
//   빛 단계(s < 1): lerp( S(λ',φ'), B_1(f(λ',φ')), s_v )
//
// R(aspect 회전)은 선 자료를 프레임 좌표로 보관하는 clip.splitLines 에서 이미 적용돼 있고,
// 종이 그룹에는 역회전을 걸므로 여기서는 프레임 좌표만 다룬다.
//
// s_v: 광원 L 에서 같은 속도로 퍼지는 빛의 앞머리가 P(구면) 를 지나 Q(종이) 에 닿는 진행도.
//      reach = s · rayReach 가 |L−P| 를 넘는 순간부터 정점이 P 에서 Q 로 움직인다.
import { bend, bendNormal } from './bend.js';
import { unitVector } from './rotate.js';
import { lightPosition } from '../projections/perspective.js';

const tmpP = [0, 0, 0], tmpL = [0, 0, 0], tmpN = [0, 0, 0];

export function inDomain(domain, lamP, phiP) {
  if (phiP < domain.phiMin - 1e-6 || phiP > domain.phiMax + 1e-6) return false;
  if (domain.maxAngularDist != null) {
    const cosc = Math.cos(phiP) * Math.cos(lamP);
    const c = Math.acos(Math.max(-1, Math.min(1, cosc)));
    if (c > domain.maxAngularDist + 1e-6) return false;
  }
  return true;
}

function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * ctx = { f, domain, surface, params, light, bendT, s, rayReach }
 * out[0..2] 에 3D 위치(프레임)를 쓴다. 도메인 밖이거나 발산하면 NaN.
 * normal 이 주어지면 종이(또는 구면과 섞은) 법선을 쓴다.
 * 반환값: 정점 진행도 s_v (0 = 구면 위, 1 = 종이 위). 빛 단계가 아니면 1.
 */
export function positionOf(ctx, lamP, phiP, out, normal) {
  if (!inDomain(ctx.domain, lamP, phiP)) { out[0] = out[1] = out[2] = NaN; return 1; }
  const xy = ctx.f(lamP, phiP);
  const x = xy[0], y = xy[1];
  if (!Number.isFinite(x) || !Number.isFinite(y)) { out[0] = out[1] = out[2] = NaN; return 1; }
  bend(ctx.surface, ctx.params, ctx.bendT, x, y, out);
  if (normal) bendNormal(ctx.surface, ctx.params, ctx.bendT, x, y, normal);
  if (ctx.s >= 1) return 1;

  const P = unitVector(lamP, phiP, tmpP);
  const L = lightPosition(ctx.light, ctx.surface, P, tmpL);
  const dQ = dist3(L, out), dP = dist3(L, P);
  const reach = ctx.s * ctx.rayReach;
  let sv;
  if (dQ - dP > 1e-9) sv = Math.max(0, Math.min(1, (reach - dP) / (dQ - dP)));
  else sv = reach >= dQ ? 1 : 0;
  out[0] = P[0] + (out[0] - P[0]) * sv;
  out[1] = P[1] + (out[1] - P[1]) * sv;
  out[2] = P[2] + (out[2] - P[2]) * sv;
  if (normal) {
    tmpN[0] = P[0] + (normal[0] - P[0]) * sv;
    tmpN[1] = P[1] + (normal[1] - P[1]) * sv;
    tmpN[2] = P[2] + (normal[2] - P[2]) * sv;
    const len = Math.hypot(tmpN[0], tmpN[1], tmpN[2]) || 1;
    normal[0] = tmpN[0] / len; normal[1] = tmpN[1] / len; normal[2] = tmpN[2] / len;
  }
  return sv;
}

/**
 * 도메인을 (u, v) ∈ [0,1]² 로 매개화하는 함수. 격자 메시·종이 메시가 쓴다.
 *  rect : λ' = −π + 2πu, φ' = φmin + (φmax − φmin)v
 *  cap  : 각거리 c = v·cmax, 방위 az = −π + 2πu (프레임 중심 +Z 기준)
 */
export function makeGridParam(domain) {
  if (domain.kind === 'cap' && domain.maxAngularDist != null) {
    const cmax = domain.maxAngularDist;
    return {
      kind: 'cap',
      toGeo(u, v, out) {
        const c = v * cmax, az = -Math.PI + 2 * Math.PI * u;
        const sc = Math.sin(c);
        const x = sc * Math.sin(az), y = sc * Math.cos(az), z = Math.cos(c);
        out[0] = Math.atan2(x, z);
        out[1] = Math.asin(Math.max(-1, Math.min(1, y)));
        return out;
      },
    };
  }
  const { phiMin, phiMax } = domain;
  return {
    kind: 'rect',
    toGeo(u, v, out) {
      out[0] = -Math.PI + 2 * Math.PI * u;
      out[1] = phiMin + (phiMax - phiMin) * v;
      return out;
    },
  };
}

/** 종이 위 최종 위치 Q = B_1(f(λ',φ')) 만 구한다(광선 길이·검증용). 도메인 밖이면 NaN. */
export function paperPosition(ctx, lamP, phiP, out) {
  if (!inDomain(ctx.domain, lamP, phiP)) { out[0] = out[1] = out[2] = NaN; return out; }
  const xy = ctx.f(lamP, phiP);
  if (!Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) { out[0] = out[1] = out[2] = NaN; return out; }
  return bend(ctx.surface, ctx.params, 1, xy[0], xy[1], out);
}

/** 광원에서 구면 점까지 거리의 최솟값(도메인 안 표본점). 빛이 구면에 처음 닿는 순간을 잡는 데 쓴다. */
export function minLightDist(ctx, points) {
  let m = Infinity;
  for (const [l, p] of points) {
    if (!inDomain(ctx.domain, l, p)) continue;
    const P = unitVector(l, p, tmpP);
    const L = lightPosition(ctx.light, ctx.surface, P, tmpL);
    const d = dist3(L, P);
    if (d < m) m = d;
  }
  return Number.isFinite(m) ? m : 0;
}

/** 광선 도달 거리의 최댓값: 도메인 안 표본점들의 |Q − L| 최댓값 */
export function maxRayReach(ctx, points) {
  let m = 0;
  const q = [0, 0, 0];
  for (const [l, p] of points) {
    paperPosition(ctx, l, p, q);
    if (!Number.isFinite(q[0])) continue;
    const P = unitVector(l, p, tmpP);
    const L = lightPosition(ctx.light, ctx.surface, P, tmpL);
    const d = dist3(L, q);
    if (d > m) m = d;
  }
  return m || 1;
}
