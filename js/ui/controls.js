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
    box.appendChild(toggle({ label: '티소 지표', checked: s.tissot, onChange: (v) => setState({ tissot: v }) }));
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

    // 재생 · 화면
    box.appendChild(toggle({ label: '자동 재생', checked: s.autoplay, onChange: (v) => setState({ autoplay: v }) }));
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
