// Add several breakers at once (one screen, one Save).
// A row = { slot, btype: 'single'|'tandem'|'double'|'quad', amps, label, rooms,
//           labels?: [2nd, 3rd], ampsList?: [2nd, 3rd] }  (extra parts of a tandem / quad)
// Same slot math and overlap rules as the one-breaker form (panel.js planFor / findClash),
// plus a check against the other rows in the same batch.
import { planFor, findClash, slotLabel, overlaps, coversText } from './panel.js';

export const BULK_TYPES = [
  { v: 'single', t: 'Single' },
  { v: 'tandem', t: 'Tandem' },
  { v: 'double', t: 'Double 240V' },
  { v: 'quad', t: 'Quad' },
];

// how many circuits (names) a row of this type makes
export const partsOf = (btype) => (btype === 'tandem' ? 2 : btype === 'quad' ? 3 : 1);

export const isBlankRow = (r) => !r || (!String(r.slot ?? '').trim() && !String(r.label ?? '').trim() && !String(r.rooms ?? '').trim() && !(r.labels || []).some((x) => String(x || '').trim()));

export function splitRooms(rooms) {
  if (Array.isArray(rooms)) return rooms.map((s) => String(s).trim()).filter(Boolean);
  return String(rooms || '').split(',').map((s) => s.trim()).filter(Boolean);
}

const cleanAmps = (a) => {
  const n = parseInt(a, 10);
  return Number.isFinite(n) && n > 0 ? String(n) : '';
};

// -> { ok, count, rows: [{ index, blank, error, covers, breakers }] }
// breakers are full breaker objects ready to save (ids from makeId). Errors are per row
// so the screen can show them inline; nothing is saved unless ok.
export function planBulk(rows, panel, existing = [], { homeId = '', makeId = () => 'b_' + Math.random().toString(36).slice(2, 10), now = Date.now() } = {}) {
  const P = panel || 'two';
  const panelId = panel && panel.id;
  const others = (existing || []).filter((b) => !panelId || b.panelId === panelId);
  const taken = []; // { pos, row } from earlier rows in this batch
  const out = (rows || []).map((r, index) => {
    if (isBlankRow(r)) return { index, blank: true, error: '', covers: '', breakers: [] };
    const btype = ['single', 'tandem', 'double', 'quad'].includes(r.btype) ? r.btype : 'single';
    const n = parseInt(r.slot, 10);
    if (!Number.isFinite(n) || n < 1) return { index, error: 'Enter the slot number from the panel sticker', covers: '', breakers: [] };
    if (n > 84) return { index, error: 'Slot numbers go up to 84', covers: '', breakers: [] };
    const amps = cleanAmps(r.amps);
    if (!amps) return { index, error: 'Pick the amps (the number on the switch)', covers: '', breakers: [] };
    const plan = planFor(btype, n, P);
    if (!plan.length) return { index, error: 'Enter the slot number from the panel sticker', covers: '', breakers: [] };
    const clash = findClash(plan, others, P);
    if (clash) {
      const o = clash.other;
      return { index, error: `Already used by ${slotLabel(o, P)} ${(o.label || 'a breaker').toUpperCase()}. Pick another number, or edit that breaker first.`, covers: coversText(btype, n, P), breakers: [] };
    }
    for (const pos of plan) {
      const hit = taken.find((t) => overlaps(t.pos, pos, P));
      if (hit) return { index, error: `${slotLabel(pos, P)} runs into row ${hit.row + 1} (${slotLabel(hit.pos, P)})`, covers: coversText(btype, n, P), breakers: [] };
    }
    for (const pos of plan) taken.push({ pos, row: index });
    const groupId = plan.length > 1 ? 'g_' + makeId() : '';
    const labels = [r.label, ...(r.labels || [])];
    const ampsList = [amps, ...(r.ampsList || []).map(cleanAmps)];
    const rooms = splitRooms(r.rooms);
    const breakers = plan.map((p, i) => ({
      id: makeId(),
      createdAt: now,
      homeId,
      panelId,
      slot: String(p.slot),
      poles: p.poles,
      size: p.size,
      half: p.half || '',
      btype,
      groupId,
      amps: i === 0 ? amps : ampsList[i] || amps,
      ampsOther: '',
      label: String(labels[i] || '').trim(),
      leg: '',
      rooms: i === 0 ? rooms : [],
      kind: 'standard',
      notes: '',
      loads: [],
    }));
    return { index, error: '', covers: coversText(btype, n, P), breakers };
  });
  const live = out.filter((r) => !r.blank);
  const ok = live.length > 0 && live.every((r) => !r.error);
  return { ok, count: live.reduce((s, r) => s + r.breakers.length, 0), rows: out };
}
