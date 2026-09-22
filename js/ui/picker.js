// © 2026 김용현
// ui/picker.js — 도법 선택기 (PLAN 3장 그룹 + "요즘 세계지도에 쓰이는 도법" 바로가기).
// 네이티브 <select> 는 배지를 못 넣으므로 버튼 + 목록으로 만든다. 성질(정각·정적·정거·절충)은 색 배지, 빛 투영 도법은 "빛 투영" 배지.
import { PROJECTIONS, PICKER_GROUPS, PROPERTY_LABELS } from '../projections/registry.js';
import { subscribe, selectProjection, getState } from '../state.js';

const PROP_CLASS = { conformal: 'pbadge-conformal', equalArea: 'pbadge-equal', equidistant: 'pbadge-equidistant', compromise: 'pbadge-compromise' };
const CHEVRON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** 성질 배지(없으면 null). 다른 UI(측면 패널)에서도 쓴다. */
export function propertyBadge(entry) {
  if (!entry.property || entry.property === 'none') return null;
  return el('span', 'pbadge ' + (PROP_CLASS[entry.property] || ''), PROPERTY_LABELS[entry.property]);
}

/** "빛 투영" 배지(빛으로 직접 만들 수 있는 도법에만) */
export function lightBadge(entry) {
  if (!entry.light) return null;
  const b = el('span', 'pbadge pbadge-light', '빛 투영');
  b.title = '광원의 빛만으로 직접 만들 수 있는 도법 (수학적 조정 없음)';
  return b;
}

function badges(entry) {
  const frag = document.createDocumentFragment();
  const p = propertyBadge(entry), l = lightBadge(entry);
  if (p) frag.appendChild(p);
  if (l) frag.appendChild(l);
  return frag;
}

/**
 * 도법 선택기와 같은 모양의 범용 드롭다운(버튼 + 목록). 비교(겹쳐 보기) 선택에 쓴다.
 *  groups: [{ labelKo, items: [{ value, labelKo, badges?: () => Node[] }] }]
 *  반환 { el, setValue(v) }
 */
export function createDropdown({ groups, value, onChange, title, menuClass = '' }) {
  const wrap = el('div', 'picker picker-compact');
  const btn = el('button', 'picker-btn');
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (title) btn.title = title;
  const btnName = el('span', 'picker-name');
  const btnBadges = el('span', 'picker-badges');
  const caret = el('span', 'picker-caret');
  caret.innerHTML = CHEVRON;
  btn.append(btnName, btnBadges, caret);
  const menu = el('div', 'picker-menu ' + menuClass);
  menu.setAttribute('role', 'listbox');
  menu.style.display = 'none';
  const items = new Map();
  const lookup = new Map();
  for (const g of groups) {
    if (g.labelKo) menu.appendChild(el('div', 'picker-group', g.labelKo));
    for (const it of g.items) {
      const item = el('button', 'picker-item');
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.append(el('span', 'picker-item-name', it.labelKo));
      if (it.badges) for (const b of it.badges()) if (b) item.appendChild(b);
      item.addEventListener('click', () => { close(); onChange(it.value); });
      menu.appendChild(item);
      if (!items.has(it.value)) items.set(it.value, []);
      items.get(it.value).push(item);
      lookup.set(it.value, it);
    }
  }
  let openState = false;
  // 컨트롤 줄(.controls)은 overflow 가 잘리므로 목록은 화면 고정 좌표로 버튼 아래에 띄운다
  function open() {
    const r = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 24 - 300))}px`;
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.minWidth = `${r.width}px`;
    openState = true; menu.style.display = ''; btn.setAttribute('aria-expanded', 'true');
  }
  function close() { openState = false; menu.style.display = 'none'; btn.setAttribute('aria-expanded', 'false'); }
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); if (openState) close(); else open(); });
  document.addEventListener('pointerdown', (ev) => { if (openState && !wrap.contains(ev.target)) close(); });
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && openState) close(); });
  window.addEventListener('resize', () => { if (openState) close(); });
  function setValue(v) {
    const it = lookup.get(v) || lookup.get(null) || groups[0].items[0];
    btnName.textContent = it.labelKo;
    btnBadges.innerHTML = '';
    if (it.badges) for (const b of it.badges()) if (b) btnBadges.appendChild(b);
    for (const [k, list] of items) for (const node of list) node.classList.toggle('on', k === v);
  }
  setValue(value);
  wrap.append(btn, menu);
  return { el: wrap, setValue };
}

export function mountPicker(container) {
  const wrap = el('div', 'picker');
  const btn = el('button', 'picker-btn');
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.title = '도법 선택';
  const btnName = el('span', 'picker-name');
  const btnBadges = el('span', 'picker-badges');
  const caret = el('span', 'picker-caret');
  caret.innerHTML = CHEVRON;
  btn.append(btnName, btnBadges, caret);

  const menu = el('div', 'picker-menu');
  menu.setAttribute('role', 'listbox');
  menu.style.display = 'none';
  const items = new Map();
  for (const g of PICKER_GROUPS) {
    menu.appendChild(el('div', 'picker-group', g.labelKo));
    for (const id of g.ids) {
      const e = PROJECTIONS[id];
      if (!e || e.hidden) continue;
      const item = el('button', 'picker-item');
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.dataset.id = id;
      item.append(el('span', 'picker-item-name', e.nameKo), badges(e));
      item.addEventListener('click', () => { selectProjection(id); close(); });
      menu.appendChild(item);
      if (!items.has(id)) items.set(id, []);
      items.get(id).push(item);
    }
  }
  const legend = el('div', 'picker-legend');
  legend.append(
    el('span', 'pbadge pbadge-light', '빛 투영'), el('span', null, '광원의 빛만으로 직접 만들 수 있는 도법. 나머지는 빛으로는 만들 수 없는 수학적 도법 — 이 앱에서는 빛 투영 결과에서 출발해 조정 단계로 이끌어 냄(실제 고안 순서와는 다를 수 있음)'),
  );
  menu.appendChild(legend);

  let openState = false;
  function open() { openState = true; menu.style.display = ''; btn.setAttribute('aria-expanded', 'true'); }
  function close() { openState = false; menu.style.display = 'none'; btn.setAttribute('aria-expanded', 'false'); }
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); if (openState) close(); else open(); });
  document.addEventListener('pointerdown', (ev) => { if (openState && !wrap.contains(ev.target)) close(); });
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && openState) close(); });

  function sync(s) {
    const e = PROJECTIONS[s.projection];
    if (!e) return;
    btnName.textContent = e.nameKo;
    btnBadges.innerHTML = '';
    btnBadges.appendChild(badges(e));
    for (const [id, list] of items) for (const it of list) it.classList.toggle('on', id === s.projection);
  }
  subscribe(sync);
  sync(getState());
  wrap.append(btn, menu);
  container.appendChild(wrap);
  return wrap;
}
