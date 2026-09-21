// © 2026 김용현
// ui/controls.js — 표준위선·aspect·광원 슬라이더, 티소·비교·프로젝터 토글 (PLAN 2장, 8.2, 8.3)
import { PROJECTIONS } from '../projections/registry.js';
import { ASPECT_LABELS } from '../geometry/rotate.js';
import { getState, subscribe, setParam, setAspect, setState, rootEntry, entry, surfaceType, toQuery } from '../state.js';

const D = Math.PI / 180;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function slider({ label, min, max, step, value, format, onInput }) {
  const wrap = el('label', 'ctl ctl-slider');
  const name = el('span', 'ctl-label', label);
  const out = el('span', 'ctl-value', format(value));
  const input = el('input');
  input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
  input.addEventListener('input', () => { out.textContent = format(parseFloat(input.value)); onInput(parseFloat(input.value)); });
  wrap.append(name, input, out);
  wrap.input = input; wrap.out = out;
  return wrap;
}

const ICON_INFO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.8" r="0.6" fill="currentColor"/></svg>';

const TISSOT_INFO_HTML = `
  <h3>티소 지표 (Tissot's indicatrix)</h3>
  <p>지구 위에 같은 크기의 작은 원(각반경 4°)을 30° 간격으로 그린 뒤, 지도에서 어떻게 변형되는지 보는 도구. 원 하나가 그 지점의 왜곡을 그대로 보여줌.</p>
  <ul>
    <li><b>원이 그대로 원</b> → 모양(각) 보존 = 정각도법 (메르카토르, 평사, 람베르트 정각원추)</li>
    <li><b>타원이지만 넓이가 모두 같음</b> → 면적 보존 = 정적도법 (Equal Earth, 몰바이데, 알베르스)</li>
    <li><b>길쭉할수록</b> 각 왜곡이 큼, <b>클수록</b> 면적 과장이 큼 (메르카토르의 고위도)</li>
    <li>정각이면서 정적인 평면 지도는 불가능 — 모든 도법은 무엇을 포기할지 고른 결과</li>
  </ul>
  <p class="pop-sub">원 위에 마우스를 올리면 나오는 값</p>
  <dl>
    <dt>h</dt><dd>경선 방향 축척</dd>
    <dt>k</dt><dd>위선 방향 축척</dd>
    <dt>s</dt><dd>면적배율 — 1.00 이면 실제와 같은 넓이</dd>
    <dt>ω</dt><dd>최대각왜곡 — 0° 이면 정각</dd>
  </dl>`;

let popover = null;
function togglePopover(anchor) {
  if (!popover) {
    popover = el('div', 'popover');
    popover.innerHTML = TISSOT_INFO_HTML;
    popover.style.display = 'none';
    const close = el('button', 'popover-close', '닫기');
    close.type = 'button';
    close.addEventListener('click', () => { popover.style.display = 'none'; });
    popover.appendChild(close);
    document.body.appendChild(popover);
    document.addEventListener('pointerdown', (e) => {
      if (popover.style.display === 'none') return;
      if (popover.contains(e.target) || e.target.closest('.ibtn')) return;
      popover.style.display = 'none';
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') popover.style.display = 'none'; });
  }
  if (popover.style.display === 'block') { popover.style.display = 'none'; return; }
  const r = anchor.getBoundingClientRect();
  popover.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 356))}px`;
  popover.style.top = `${r.bottom + 8}px`;
  popover.style.display = 'block';
}

function toggle({ label, checked, onChange, cls = '' }) {
  const wrap = el('label', 'ctl ctl-toggle ' + cls);
  const input = el('input'); input.type = 'checkbox'; input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, el('span', 'ctl-label', label));
  wrap.input = input;
  return wrap;
}

export function mountControls(container, { onFullscreen } = {}) {
  let renderedKey = null;
  const box = el('div', 'controls');
  container.appendChild(box);

  function render(s) {
    const e = entry(), root = rootEntry(e), type = surfaceType();
    const locks = new Set([...(e.lockParams || []), ...(root.lockParams || [])]);
    const key = [s.projection, type, s.aspect, s.compare, s.tissot, s.autoplay, s.lowPower, s.projector, JSON.stringify(s.params, (k, v) => (v === Infinity ? 'inf' : v))].join('|');
    if (key === renderedKey) return;
    renderedKey = key;
    box.innerHTML = '';

    // aspect
    const asp = el('div', 'ctl ctl-group');
    asp.append(el('span', 'ctl-label', '축'));
    for (const a of ['normal', 'transverse', 'oblique']) {
      const b = el('button', 'chip' + (s.aspect === a ? ' on' : ''), ASPECT_LABELS[type][a]);
      b.type = 'button';
      b.addEventListener('click', () => setAspect(a));
      asp.appendChild(b);
    }
    box.appendChild(asp);

    // 표준위선 / 광원
    if (type === 'cylinder' && !locks.has('phi0')) {
      const sl = slider({ label: '표준위선 φ₀', min: 0, max: 80, step: 1, value: Math.round((s.params.phi0 || 0) / D), format: (v) => `${v}°${v === 0 ? ' (접선)' : ' (할선)'}`, onInput: (v) => setParam('phi0', v * D) });
      box.appendChild(sl);
    }
    if (type === 'cone') {
      const secant = s.params.phi2 != null;
      const phi1 = Math.round((s.params.phi1 ?? 40 * D) / D);
      const tg = toggle({ label: secant ? '할선 (표준위선 2개)' : '접선 (표준위선 1개)', checked: secant, onChange: (on) => setParam('phi2', on ? Math.min(85, phi1 + 20) * D : null) });
      box.appendChild(tg);
      const s1 = slider({ label: secant ? '표준위선 φ₁' : '표준위선 φ₀', min: 0, max: 90, step: 1, value: phi1, format: (v) => `${v}°`, onInput: (v) => {
        setParam('phi1', v * D);
        if (s.params.phi2 != null && s.params.phi2 / D < v + 1) setParam('phi2', Math.min(90, v + 1) * D);
      } });
      box.appendChild(s1);
      if (secant) {
        const s2 = slider({ label: '표준위선 φ₂', min: 1, max: 90, step: 1, value: Math.round(s.params.phi2 / D), format: (v) => `${v}°`, onInput: (v) => setParam('phi2', Math.max(v, phi1 + 1) * D) });
        box.appendChild(s2);
      }
      box.appendChild(el('span', 'ctl-hint', '90° = 평면, 0° = 원통'));
    }
    if (type === 'plane' && !locks.has('d')) {
      const d = s.params.d ?? 0;
      const sl = slider({ label: '광원 위치 d', min: 0, max: 1, step: 0.01, value: d === Infinity ? 1 : d, format: (v) => (d === Infinity ? '∞ (정사)' : v === 0 ? '0 (심사)' : v >= 0.995 ? '1 (평사)' : v.toFixed(2)), onInput: (v) => setParam('d', v) });
      if (d === Infinity) sl.input.disabled = true;
      const inf = el('button', 'chip' + (d === Infinity ? ' on' : ''), '무한대');
      inf.type = 'button';
      inf.addEventListener('click', () => setParam('d', d === Infinity ? 1 : Infinity));
      sl.appendChild(inf);
      box.appendChild(sl);
    }

    // 티소 · 비교
    const tisWrap = el('span', 'ctl ctl-tissot');
    tisWrap.appendChild(toggle({ label: '티소 지표', checked: s.tissot, onChange: (v) => setState({ tissot: v }) }));
    const info = el('button', 'ibtn');
    info.type = 'button';
    info.title = '티소 지표란?';
    info.setAttribute('aria-label', '티소 지표 설명');
    info.innerHTML = ICON_INFO;
    info.addEventListener('click', (ev) => { ev.stopPropagation(); togglePopover(info); });
    tisWrap.appendChild(info);
    box.appendChild(tisWrap);
    const cmp = el('label', 'ctl');
    cmp.append(el('span', 'ctl-label', '비교'));
    const sel = el('select', 'compare-select');
    const none = el('option', null, '겹쳐 보기 없음'); none.value = '';
    sel.appendChild(none);
    for (const p of Object.values(PROJECTIONS)) {
      if (p.hidden || p.id === s.projection) continue;
      const op = el('option', null, p.nameKo); op.value = p.id;
      sel.appendChild(op);
    }
    sel.value = s.compare || '';
    sel.addEventListener('change', () => setState({ compare: sel.value || null }));
    cmp.appendChild(sel);
    box.appendChild(cmp);

    // 화면 (자동 재생은 하단 재생 버튼 옆, stepper.js)
    box.appendChild(toggle({ label: '저사양', checked: s.lowPower, onChange: (v) => setState({ lowPower: v }), cls: 'ctl-minor' }));
    const proj = el('button', 'chip' + (s.projector ? ' on' : ''), '프로젝터');
    proj.type = 'button';
    proj.title = '큰 글씨·고대비 (전체화면)';
    proj.addEventListener('click', () => { setState({ projector: !s.projector }); if (!s.projector && onFullscreen) onFullscreen(); });
    box.appendChild(proj);
    const share = el('button', 'chip', '링크 복사');
    share.type = 'button';
    share.addEventListener('click', async () => {
      const url = location.origin + location.pathname + '?' + toQuery();
      try { await navigator.clipboard.writeText(url); share.textContent = '복사됨'; setTimeout(() => (share.textContent = '링크 복사'), 1200); } catch { prompt('URL', url); }
    });
    box.appendChild(share);
  }

  subscribe(render);
  render(getState());
}
