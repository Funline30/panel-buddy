// Shopping list: totals of outlets / switches / boxes / wall plates for one home.
// Older items with no style or qty count as 1, style "not set".
import { DEVICE_TYPES, BOX_OPTIONS, NEW_BOX_VALUES, PLATE_LABELS, styleOf, qtyOf, labelOf } from './options.js';

export function plural(n, name) {
  if (n === 1) return name;
  const m = name.match(/^(.*?)( \([^)]*\))?$/);
  let w = m[1];
  w = /(box|switch)$/.test(w) ? w + 'es' : /s$/.test(w) ? w : w + 's';
  return w + (m[2] || '');
}

// scope: 'all' = every item; 'replace' = only items marked "needs replacing"
export function shoppingList(devices = [], scope = 'all') {
  const list = (devices || []).filter((d) => d && (scope !== 'replace' || d.replace === 'yes'));
  const parts = new Map();
  const boxes = new Map();
  const plates = new Map();
  let gangs = 0;
  for (const d of list) {
    const q = qtyOf(d);
    const st = styleOf(d);
    const typeLabel = labelOf(DEVICE_TYPES, d.type || 'other');
    const key = `${d.type || 'other'}|${st ? st.value : ''}`;
    const name = st ? st.short : d.type === 'outlet' || d.type === 'switch' ? `${typeLabel.toLowerCase()} (style not set)` : typeLabel.toLowerCase();
    const cur = parts.get(key) || { key, type: d.type || 'other', style: st ? st.value : '', name, qty: 0 };
    cur.qty += q;
    parts.set(key, cur);
    if (NEW_BOX_VALUES.includes(d.box)) {
      const b = BOX_OPTIONS.find((x) => x.value === d.box);
      boxes.set(d.box, { key: d.box, name: b.short, qty: ((boxes.get(d.box) || {}).qty || 0) + q });
    }
    if (d.type === 'outlet' || d.type === 'switch') {
      const g = (st && st.gangs) || 1;
      const plate = st ? st.plate : 'other';
      gangs += q * g;
      plates.set(plate, { key: plate, name: PLATE_LABELS[plate], qty: ((plates.get(plate) || {}).qty || 0) + q * g });
    }
  }
  const order = (t) => ['outlet', 'switch'].indexOf(t) === -1 ? 9 : ['outlet', 'switch'].indexOf(t);
  const items = [...parts.values()].sort((a, b) => order(a.type) - order(b.type) || b.qty - a.qty || a.name.localeCompare(b.name));
  return {
    scope,
    count: list.length,
    items,
    boxes: [...boxes.values()].sort((a, b) => b.qty - a.qty),
    boxesNeeded: [...boxes.values()].reduce((s, b) => s + b.qty, 0),
    plates: [...plates.values()].sort((a, b) => b.qty - a.qty),
    platesNeeded: gangs,
  };
}

export function lineText(item) {
  return `${item.qty} ${plural(item.qty, item.name)}`;
}

export function shoppingCsv(devices, scope = 'all', homeName = '') {
  const s = shoppingList(devices, scope);
  const cell = (v) => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const rows = [['Home', 'Group', 'Item', 'Quantity']];
  for (const i of s.items) rows.push([homeName, i.type === 'outlet' ? 'Outlets' : i.type === 'switch' ? 'Switches' : 'Other', i.name, i.qty]);
  for (const b of s.boxes) rows.push([homeName, 'Boxes', b.name, b.qty]);
  for (const p of s.plates) rows.push([homeName, 'Wall plates (1 per gang)', p.name, p.qty]);
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}
