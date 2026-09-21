// © 2026 김용현
// util/tween.js — 자체 트윈/이징 (gsap 대신). 시각 연출 담당이 자유롭게 고쳐도 되는 파일 (PLAN 0.3).

export const ease = {
  linear: (t) => t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

const active = new Set();

/**
 * 값 트윈. from/to 는 숫자 또는 숫자 배열. onUpdate(value) 를 매 프레임 호출.
 * 반환된 객체의 cancel() 로 중단.
 */
export function tween({ from, to, duration = 1, easing = ease.inOutCubic, onUpdate, onComplete }) {
  const isArr = Array.isArray(from);
  const state = { elapsed: 0, done: false, cancel() { active.delete(state); state.done = true; } };
  state.step = (dt) => {
    state.elapsed += dt;
    const p = Math.min(1, state.elapsed / duration);
    const e = easing(p);
    const v = isArr ? from.map((a, i) => a + (to[i] - a) * e) : from + (to - from) * e;
    onUpdate(v, p);
    if (p >= 1) { state.cancel(); if (onComplete) onComplete(); }
  };
  active.add(state);
  return state;
}

/** 렌더 루프에서 매 프레임 호출 */
export function updateTweens(dt) {
  for (const t of Array.from(active)) t.step(dt);
}

/** 프레임 독립 감쇠 보간 (카메라 추적 등) */
export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
