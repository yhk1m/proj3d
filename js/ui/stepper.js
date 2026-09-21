// © 2026 김용현
// ui/stepper.js — 단계 버튼 + 스크러버 + 재생 (PLAN 7장). 모든 단계는 버튼 재생과 슬라이더 스크럽 둘 다 지원한다.
import { getState, subscribe, timeline, timelineIndex, goTo, next, prev, setT, togglePlay, play, setState, stageLabel, derivation, canAdjust } from '../state.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const ICON = {
  prev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>',
  rewind: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>',
};

export function mountStepper(container) {
  const bar = el('div', 'stepper');
  const stages = el('div', 'stages');
  const transport = el('div', 'transport');
  const bPrev = el('button', 'tbtn'); bPrev.innerHTML = ICON.prev; bPrev.title = '이전 단계 (←)';
  const bRew = el('button', 'tbtn'); bRew.innerHTML = ICON.rewind; bRew.title = '맨 처음으로 (펼친 종이)';
  const bPlay = el('button', 'tbtn tbtn-play'); bPlay.innerHTML = ICON.play; bPlay.title = '재생/일시정지 (스페이스)';
  const bNext = el('button', 'tbtn'); bNext.innerHTML = ICON.next; bNext.title = '다음 단계 (→)';
  const scrub = el('input', 'scrub'); scrub.type = 'range'; scrub.min = 0; scrub.max = 1000; scrub.step = 1; scrub.value = 0;
  scrub.setAttribute('aria-label', '진행도');
  const tval = el('span', 'tval', '0%');
  const auto = el('label', 'ctl ctl-toggle ctl-auto');
  const autoInput = el('input'); autoInput.type = 'checkbox';
  autoInput.title = '한 단계가 끝나면 다음 단계를 이어서 재생';
  autoInput.addEventListener('change', () => setState({ autoplay: autoInput.checked }));
  auto.append(autoInput, el('span', 'ctl-label', '자동 재생'));
  const skip = el('button', 'chip chip-skip', '조정 단계부터 보기'); skip.type = 'button';
  const utilSlot = el('span', 'util-slot');
  transport.append(bRew, bPrev, bPlay, bNext, auto, scrub, tval, skip, utilSlot);
  bar.append(stages, transport);
  container.appendChild(bar);

  bPrev.addEventListener('click', () => prev());
  bNext.addEventListener('click', () => next(true));
  bPlay.addEventListener('click', () => togglePlay());
  bRew.addEventListener('click', () => goTo('flat', 0, 0, false));
  scrub.addEventListener('input', () => setT(parseInt(scrub.value, 10) / 1000));
  skip.addEventListener('click', () => goTo('adjust', 0, 0, false));

  window.addEventListener('keydown', (ev) => {
    if (ev.target && /input|select|textarea/i.test(ev.target.tagName) && ev.target.type !== 'range') return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); next(true); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); prev(); }
    else if (ev.key === ' ') { ev.preventDefault(); togglePlay(); }
  });

  let stageKey = null;
  function render(s) {
    const tl = timeline();
    const d = derivation();
    const key = s.projection + '|' + tl.length;
    if (key !== stageKey) {
      stageKey = key;
      stages.innerHTML = '';
      tl.forEach((x, i) => {
        let label = stageLabel(x.stage);
        if (x.stage === 'adjust') label = `조정 ${x.step + 1}${d && d.steps.length > 1 ? '/' + d.steps.length : ''}`;
        const b = el('button', 'stage', label);
        b.type = 'button';
        b.dataset.i = i;
        if (x.stage === 'adjust' && d) b.title = d.steps[x.step].titleKo;
        b.addEventListener('click', () => goTo(x.stage, x.step, 0, x.stage !== 'flat'));
        stages.appendChild(b);
      });
    }
    const idx = timelineIndex();
    Array.from(stages.children).forEach((b, i) => {
      b.classList.toggle('on', i === idx);
      b.classList.toggle('done', i < idx || (i === idx && s.t >= 1 && s.stage !== 'flat'));
    });
    const v = Math.round(s.t * 1000);
    if (parseInt(scrub.value, 10) !== v) scrub.value = v;
    scrub.disabled = s.stage === 'flat';
    tval.textContent = s.stage === 'flat' ? '—' : `${Math.round(s.t * 100)}%`;
    bPlay.innerHTML = s.playing ? ICON.pause : ICON.play;
    if (autoInput.checked !== !!s.autoplay) autoInput.checked = !!s.autoplay;
    skip.style.display = canAdjust() && s.stage !== 'adjust' ? '' : 'none';
  }
  subscribe(render);
  render(getState());
  return { utilSlot };
}
