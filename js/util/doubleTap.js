// © 2026 김용현
// util/doubleTap.js — 두 번 탭 판정(터치). 앞 탭 a, 이번 탭 b: { t(ms), x, y(px) }
export function isDoubleTap(a, b, { ms = 320, px = 32 } = {}) {
  if (!a || !b) return false;
  const dt = b.t - a.t;
  return dt >= 0 && dt <= ms && Math.hypot(b.x - a.x, b.y - a.y) <= px;
}
