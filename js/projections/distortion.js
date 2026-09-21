// © 2026 김용현
// projections/distortion.js — h, k, 면적배율 s, 최대각왜곡 ω (PLAN 8.5). 중심차분 수치 미분.
// f 는 지리좌표 (λ, φ) → 종이 좌표 [x, y] 인 합성 함수 f(R(λ, φ)) 여야 한다.

const HALF_PI = Math.PI / 2;

/**
 * 한 점의 왜곡 수치.
 *  h: 경선 방향 축척, k: 위선 방향 축척, s: 면적배율(|ab|), a·b: 티소 타원 반축, omega: 최대각왜곡(라디안)
 */
export function distortionAt(f, lam, phi, delta = 1e-4) {
  const p = Math.max(-HALF_PI + 2 * delta, Math.min(HALF_PI - 2 * delta, phi));
  const xl = f(lam + delta, p), xr = f(lam - delta, p);
  const yu = f(lam, p + delta), yd = f(lam, p - delta);
  const dxdl = (xl[0] - xr[0]) / (2 * delta), dydl = (xl[1] - xr[1]) / (2 * delta);
  const dxdp = (yu[0] - yd[0]) / (2 * delta), dydp = (yu[1] - yd[1]) / (2 * delta);
  const cosphi = Math.cos(p);
  const h = Math.hypot(dxdp, dydp);
  const k = Math.hypot(dxdl, dydl) / cosphi;
  const s = Math.abs(dxdl * dydp - dxdp * dydl) / cosphi;
  const sum = h * h + k * k;
  const ap = Math.sqrt(Math.max(0, sum + 2 * s));
  const am = Math.sqrt(Math.max(0, sum - 2 * s));
  const a = (ap + am) / 2, b = (ap - am) / 2;
  const ratio = a + b > 0 ? Math.max(-1, Math.min(1, (a - b) / (a + b))) : 0;
  return { h, k, s, a, b, omega: 2 * Math.asin(ratio) };
}

/** 표본 격자 전체에서 면적배율이 1 ± tol 인지 */
export function isEqualArea(f, tol = 0.01, latMax = 80, step = 20) {
  const D = Math.PI / 180;
  for (let lat = -latMax; lat <= latMax; lat += step) {
    for (let lon = -170; lon <= 170; lon += step) {
      const d = distortionAt(f, lon * D, lat * D);
      if (!Number.isFinite(d.s) || Math.abs(d.s - 1) > tol) return false;
    }
  }
  return true;
}
