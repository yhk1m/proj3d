// © 2026 김용현
// ui/picker.js — 도법 선택기 (PLAN 3장 그룹 + "요즘 세계지도에 쓰이는 도법" 바로가기)
import { PROJECTIONS, PICKER_GROUPS, PROPERTY_LABELS } from '../projections/registry.js';
import { subscribe, selectProjection, getState } from '../state.js';

export function mountPicker(el) {
  const sel = document.createElement('select');
  sel.className = 'picker';
  sel.setAttribute('aria-label', '도법 선택');
  for (const g of PICKER_GROUPS) {
    const og = document.createElement('optgroup');
    og.label = g.labelKo;
    for (const id of g.ids) {
      const e = PROJECTIONS[id];
      if (!e || e.hidden) continue;
      const op = document.createElement('option');
      op.value = id;
      op.textContent = `${e.nameKo} · ${PROPERTY_LABELS[e.property]}${e.light ? ' · 빛' : ''}`;
      og.appendChild(op);
    }
    sel.appendChild(og);
  }
  sel.addEventListener('change', () => selectProjection(sel.value));
  const sync = (s) => { if (sel.value !== s.projection) sel.value = s.projection; };
  subscribe(sync);
  sync(getState());
  el.appendChild(sel);
  return sel;
}
