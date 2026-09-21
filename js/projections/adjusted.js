// © 2026 김용현
// projections/adjusted.js — 조정 계열 forward (PLAN 3.1 '조정', 3.2). d3 raw 함수를 감싼다.
// 단위구, 라디안, 프레임 좌표. 원추 3종은 bend.js 관례(기준 위선을 y = 0)에 맞춰 y 를 옮긴다.
import {
  geoConicEquidistantRaw, geoConicConformalRaw, geoConicEqualAreaRaw,
  geoAzimuthalEquidistantRaw, geoAzimuthalEqualAreaRaw, geoEqualEarthRaw,
} from 'd3-geo';
import {
  geoSinusoidalRaw, geoMollweideRaw, geoEckert4Raw, geoRobinsonRaw, geoWinkel3Raw, geoAitoffRaw,
} from 'd3-geo-projection';

const QUARTER_PI = Math.PI / 4;

/** 로빈슨 정의 x = 0.8487·X(φ)·λ 의 축척. d3 raw 는 X(φ)·λ 이므로 이 값을 곱한다. */
export const ROBINSON_SCALE = 0.8487;

// ---- 원통 ----------------------------------------------------------------
export function mercator(lam, phi, params) {
  const r = Math.cos(params.phi0 || 0);
  return [r * lam, r * Math.log(Math.tan(QUARTER_PI + phi / 2))];
}

export function equirectangular(lam, phi, params) {
  return [Math.cos(params.phi0 || 0) * lam, phi];
}

export function miller(lam, phi, params) {
  const r = Math.cos(params.phi0 || 0);
  return [r * lam, r * 1.25 * Math.log(Math.tan(QUARTER_PI + 0.4 * phi))];
}

// ---- 원뿔 ----------------------------------------------------------------
// d3 raw 는 y = ρ(0) − ρ cos θ 관례. 여기서는 y = ρ(α) − ρ cos θ (α = 두 표준위선의 중간).
function conicFactory(rawFactory) {
  let key = null, raw = null, offset = 0;
  const fn = function (lam, phi, params) {
    const phi1 = params.phi1 ?? 0, phi2 = params.phi2 ?? phi1;
    const k = phi1 + ',' + phi2;
    if (k !== key) {
      raw = rawFactory(phi1, phi2);
      offset = raw(0, (phi1 + phi2) / 2)[1];
      key = k;
    }
    const p = raw(lam, phi);
    return [p[0], p[1] - offset];
  };
  /** 검증용: 이 params 에서 d3 raw 와의 y 차이 (mine = d3 − offset) */
  fn.d3Offset = function (params) {
    const phi1 = params.phi1 ?? 0, phi2 = params.phi2 ?? phi1;
    return rawFactory(phi1, phi2)(0, (phi1 + phi2) / 2)[1];
  };
  return fn;
}

export const equidistantConic = conicFactory(geoConicEquidistantRaw);
export const lambertConformalConic = conicFactory(geoConicConformalRaw);
export const albers = conicFactory(geoConicEqualAreaRaw);

// ---- 평면 ----------------------------------------------------------------
export function azimuthalEquidistant(lam, phi) {
  return geoAzimuthalEquidistantRaw(lam, phi);
}

export function lambertAzimuthalEA(lam, phi) {
  return geoAzimuthalEqualAreaRaw(lam, phi);
}

// ---- 의사원통 · 변형 방위 ---------------------------------------------------
export function sinusoidal(lam, phi) { return geoSinusoidalRaw(lam, phi); }
export function mollweide(lam, phi) { return geoMollweideRaw(lam, phi); }
export function eckert4(lam, phi) { return geoEckert4Raw(lam, phi); }
export function equalEarth(lam, phi) { return geoEqualEarthRaw(lam, phi); }

export function robinson(lam, phi) {
  const p = geoRobinsonRaw(lam, phi);
  return [p[0] * ROBINSON_SCALE, p[1] * ROBINSON_SCALE];
}

export function winkelTripel(lam, phi) { return geoWinkel3Raw(lam, phi); }
export function aitoff(lam, phi) { return geoAitoffRaw(lam, phi); }
