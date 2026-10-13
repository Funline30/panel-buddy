// Panel layout helpers.
//  two columns: like most US home panels - odd numbers left, even right.
//  one column:  stacked (typical small RV distribution center).
//
//  Numbering (panel.numbering):
//   'space' (default, every panel saved before tandem support): one number per space.
//            A double-pole breaker in space N also covers N+2 (N+1 stacked). A tandem
//            (twin) breaker's two halves share space N and show as NA / NB.
//   'half':  two numbers per space, like tandem-ready label strips (Eaton BR 32-circuit,
//            etc.): the first space on the left is 1 and 3, the next 5 and 7. Each
//            half-size breaker gets its own number; a full-size breaker covers both
//            numbers of its space (labeled with the first); a full-size 2-pole covers two
//            spaces (labeled e.g. 10/14).
//
//  Breakers: size 'full' (default) or 'half' (one half of a tandem or quad);
//            poles '1' or '2'; btype 'single' | 'double' | 'tandem' | 'quad' is what the
//            user picked (older breakers have none - see breakerType()).
//  Internally every panel is a grid of half-space rows per column.
export function layoutOf(panel) {
  if (!panel) return 'two';
  if (panel.layout === 'one' || panel.layout === 'two') return panel.layout;
  return panel.type === 'rv' ? 'one' : 'two';
}

export function numberingOf(panel) {
  return panel && typeof panel === 'object' && panel.numbering === 'half' ? 'half' : 'space';
}

export function panelSpaces(panel) {
  if (!panel) return 20;
  const raw = panel.spaces === 'other' ? panel.spacesOther : panel.spaces;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 84) : 20;
}

export const sizeOf = (b) => (b && b.size === 'half' ? 'half' : 'full');
export const isTwoPole = (b) => String(b && b.poles) === '2';

// What the user picked in the "Breaker type" dropdown. Older breakers: Single or 2-pole.
export function breakerType(b) {
  if (b && ['single', 'double', 'tandem', 'quad'].includes(b.btype)) return b.btype;
  if (sizeOf(b) === 'half') return 'tandem';
  return isTwoPole(b) ? 'double' : 'single';
}

// second arg: a layout string ('one' | 'two', numbering 'space') or a panel object
function ctx(arg) {
  if (arg && typeof arg === 'object') return { layout: layoutOf(arg), numbering: numberingOf(arg) };
  return { layout: arg === 'one' ? 'one' : 'two', numbering: 'space' };
}
const colOf = (n, layout) => (layout === 'one' ? 1 : n % 2 === 1 ? 1 : 2);
const idxOf = (n, layout) => (layout === 'one' ? n - 1 : Math.ceil(n / 2) - 1);
const numAt = (col, idx, layout) => (layout === 'one' ? idx + 1 : idx * 2 + col);
export const stepOf = (layoutOrPanel) => (ctx(layoutOrPanel).layout === 'one' ? 1 : 2);

// Where a breaker sits: column, first half-row (0-based) and how many half-rows.
export function cellsFor(b, arg = 'two') {
  const n = parseInt(b && b.slot, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const { layout, numbering } = ctx(arg);
  const half = sizeOf(b) === 'half';
  const poles = isTwoPole(b) ? 2 : 1;
  const len = (half ? 1 : 2) * poles;
  const start = numbering === 'half' ? idxOf(n, layout) : 2 * idxOf(n, layout) + (half && b.half === 'B' ? 1 : 0);
  return { col: colOf(n, layout), start, len, half, poles };
}

// Circuit numbers a breaker touches (search, overlap checks).
export function slotsFor(b, arg = 'two') {
  const c = cellsFor(b, arg);
  if (!c) return [];
  const { layout, numbering } = ctx(arg);
  const out = [];
  for (let h = c.start; h < c.start + c.len; h++) {
    const n = numAt(c.col, numbering === 'half' ? h : Math.floor(h / 2), layout);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

// Half-row keys a breaker fills - two breakers clash only if these overlap.
export function keysFor(b, arg = 'two') {
  const c = cellsFor(b, arg);
  if (!c) return [];
  const out = [];
  for (let h = c.start; h < c.start + c.len; h++) out.push(`${c.col}:${h}`);
  return out;
}

export function overlaps(a, b, arg = 'two') {
  const ka = keysFor(a, arg);
  return keysFor(b, arg).some((k) => ka.includes(k));
}

// The number(s) printed on the label: "7", "5/7", "10/14", "5A", "5B/7A".
export function slotLabel(b, arg = 'two') {
  if (!b) return '';
  const c = cellsFor(b, arg);
  if (!c) return b.slot || '?';
  const { layout, numbering } = ctx(arg);
  const per = c.half ? 1 : 2; // half-rows per pole
  const parts = [];
  for (let p = 0; p < c.poles; p++) {
    const h = c.start + p * per;
    if (numbering === 'half') parts.push(String(numAt(c.col, h, layout)));
    else if (c.half) parts.push(`${numAt(c.col, Math.floor(h / 2), layout)}${h % 2 ? 'B' : 'A'}`);
    else parts.push(String(numAt(c.col, Math.floor(h / 2), layout)));
  }
  return parts.join('/');
}

// Label for an empty position (half-row h in column col).
export function positionLabel(col, h, arg = 'two', halfOnly = false) {
  const { layout, numbering } = ctx(arg);
  if (numbering === 'half') return String(numAt(col, h, layout));
  const n = numAt(col, Math.floor(h / 2), layout);
  return halfOnly ? `${n}${h % 2 ? 'B' : 'A'}` : String(n);
}

// What "add a breaker here" should prefill for half-row h: { slot, half }
export function positionSlot(col, h, arg = 'two') {
  const { layout, numbering } = ctx(arg);
  if (numbering === 'half') return { slot: numAt(col, h, layout), half: h % 2 ? 'B' : 'A' };
  return { slot: numAt(col, Math.floor(h / 2), layout), half: h % 2 ? 'B' : 'A' };
}

// Half-rows per column needed to show `spaces` numbers.
export function halfRows(panel, extraBreakers = []) {
  const { layout, numbering } = ctx(panel);
  const spaces = panelSpaces(panel);
  const perCol = layout === 'one' ? spaces : Math.ceil(spaces / 2);
  let rows = numbering === 'half' ? perCol : perCol * 2;
  for (const b of extraBreakers) {
    const c = cellsFor(b, panel);
    if (c) rows = Math.max(rows, c.start + c.len);
  }
  if (rows % 2) rows += 1; // whole spaces
  return Math.min(rows, 200);
}

// Grid occupancy: Map "col:h" -> { b, first }
export function occupancy(panel, breakers) {
  const m = new Map();
  for (const b of breakers) {
    const c = cellsFor(b, panel);
    if (!c) continue;
    for (let h = c.start; h < c.start + c.len; h++) {
      const k = `${c.col}:${h}`;
      if (!m.has(k)) m.set(k, { b, first: h === c.start });
    }
  }
  return m;
}

// Where the other members of a new tandem / quad go, from the first one's slot.
// Returns position objects { slot, half, size, poles, role } in top-to-bottom order.
export function groupPlan(btype, slot, arg = 'two') {
  const n = parseInt(slot, 10);
  const { numbering } = ctx(arg);
  const st = stepOf(arg);
  if (!Number.isFinite(n)) return [];
  if (btype === 'tandem') {
    return numbering === 'half'
      ? [{ slot: n, half: 'A', size: 'half', poles: '1', role: 'Top half' }, { slot: n + st, half: 'B', size: 'half', poles: '1', role: 'Bottom half' }]
      : [{ slot: n, half: 'A', size: 'half', poles: '1', role: 'Top half' }, { slot: n, half: 'B', size: 'half', poles: '1', role: 'Bottom half' }];
  }
  if (btype === 'quad') {
    return numbering === 'half'
      ? [
          { slot: n, half: 'A', size: 'half', poles: '1', role: 'Top single' },
          { slot: n + st, half: 'B', size: 'half', poles: '2', role: 'Middle 2-pole' },
          { slot: n + 3 * st, half: 'B', size: 'half', poles: '1', role: 'Bottom single' },
        ]
      : [
          { slot: n, half: 'A', size: 'half', poles: '1', role: 'Top single' },
          { slot: n, half: 'B', size: 'half', poles: '2', role: 'Middle 2-pole' },
          { slot: n + st, half: 'B', size: 'half', poles: '1', role: 'Bottom single' },
        ];
  }
  return [];
}

// Rows for the printed / shared directory: [{ cells: [cell, cell] }] where
// cell = { num, items: [{ b, label, cont }] } - a space with tandem halves has 2 items.
export function directoryRows(panel, breakers) {
  const { layout, numbering } = ctx(panel);
  const occ = occupancy(panel, breakers);
  const rows = halfRows(panel, breakers);
  const cols = layout === 'one' ? [1] : [1, 2];
  const out = [];
  const cellAt = (col, hs) => {
    const items = [];
    for (const h of hs) {
      const o = occ.get(`${col}:${h}`);
      if (o && !items.some((i) => i.b === o.b)) items.push({ b: o.b, label: slotLabel(o.b, panel), cont: !o.first });
    }
    return { num: positionLabel(col, hs[0], panel), items };
  };
  if (numbering === 'half') {
    for (let h = 0; h < rows; h++) out.push({ space: Math.floor(h / 2), cells: cols.map((c) => cellAt(c, [h])) });
  } else {
    for (let h = 0; h < rows; h += 2) out.push({ space: h / 2, cells: cols.map((c) => cellAt(c, [h, h + 1])) });
  }
  return out;
}
