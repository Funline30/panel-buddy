// Quick panel: map a panel fast, breaker by breaker, without drawing rooms.
// Each "Save & next" makes one breaker (single or 2-pole) with what it feeds, amps and
// optional wire, then jumps to the next open space. Same slot math and overlap rules as
// the other breaker forms (bulk.js planBulk -> panel.js planFor / findClash).
import { planBulk } from './bulk.js';
import { planFor, findClash, panelSpaces, slotLabel, slotsFor, layoutOf } from './panel.js';
import { cleanWire } from './wire.js';

export const QUICK_AMPS = ['15', '20', '30', '40', '50', '60'];
// Common cable callouts: tag -> { size, cond }
export const QUICK_WIRES = [
  { tag: '14/2', size: '14', cond: '2g' },
  { tag: '12/2', size: '12', cond: '2g' },
  { tag: '14/3', size: '14', cond: '3g' },
  { tag: '12/3', size: '12', cond: '3g' },
  { tag: '10/2', size: '10', cond: '2g' },
  { tag: '10/3', size: '10', cond: '3g' },
  { tag: '8/3', size: '8', cond: '3g' },
  { tag: '6/3', size: '6', cond: '3g' },
];
export const quickWire = (tag, type = '') => {
  const w = QUICK_WIRES.find((x) => x.tag === tag);
  return w ? cleanWire({ size: w.size, cond: w.cond, type }) : null;
};
// What electricians usually write on a panel schedule.
export const FEEDS_SUGGESTIONS = [
  'Kitchen counters', 'Kitchen counters / dishwasher', 'Dishwasher', 'Disposal', 'Refrigerator', 'Microwave', 'Range / oven', 'Cooktop',
  'Bathroom outlets', 'Bathroom lights / fan', 'Laundry', 'Washer', 'Dryer', 'Water heater', 'Furnace', 'AC condenser', 'Heat pump', 'Air handler',
  'Living room outlets', 'Living room lights', 'Dining room', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Master bedroom', 'Hall / stairs lights',
  'Garage outlets', 'Garage door opener', 'Outside outlets', 'Exterior lights', 'Smoke detectors', 'Well pump', 'Sump pump', 'Pool pump', 'Hot tub',
  'EV charger', 'Sub-panel', 'Spare',
];

// First open space (by sticker number, from `from` up) that fits a breaker of btype.
// 0 = panel is full.
export function nextFreeSlot(panel, breakers, btype = 'single', from = 1) {
  const max = panelSpaces(panel);
  const others = (breakers || []).filter((b) => !panel || !panel.id || b.panelId === panel.id);
  const fits = (n) => {
    const plan = planFor(btype, n, panel);
    if (!plan.length || Number(plan[0].slot) !== n) return false;
    if (plan.some((p) => slotsFor(p, panel).some((s) => s > max))) return false;
    return !findClash(plan, others, panel);
  };
  for (let n = Math.max(1, from); n <= max; n++) if (fits(n)) return n;
  for (let n = 1; n < Math.min(from, max + 1); n++) if (fits(n)) return n;
  return 0;
}

// One quick row -> { error, breakers } ready to save (wire attached when given).
// row = { slot, btype: 'single'|'double', amps, label, wire }
export function quickBreaker(row, panel, existing, { homeId = '', makeId, now } = {}) {
  const btype = row.btype === 'double' ? 'double' : 'single';
  const r = { slot: row.slot, btype, amps: row.amps, label: row.label, rooms: '' };
  if (!String(r.slot ?? '').trim()) return { error: 'Enter the slot number from the panel sticker', breakers: [] };
  const res = planBulk([r], panel, existing, { homeId, ...(makeId ? { makeId } : {}), ...(now ? { now } : {}) });
  const one = res.rows[0];
  if (one.error) return { error: one.error, breakers: [] };
  const wire = cleanWire(row.wire);
  return { error: '', covers: one.covers, breakers: one.breakers.map((b) => (wire ? { ...b, wire } : b)) };
}

// "9 of 24 spaces used"
export function spacesUsed(panel, breakers) {
  const max = panelSpaces(panel) || 0;
  const used = new Set();
  for (const b of breakers || []) {
    if (panel && panel.id && b.panelId && b.panelId !== panel.id) continue;
    const n = parseInt(b.slot, 10);
    if (!Number.isFinite(n)) continue;
    used.add(n);
    if (String(b.poles) === '2' && b.size !== 'half') used.add(n + (layoutOf(panel) === 'one' ? 1 : 2));
  }
  return { used: [...used].filter((n) => !max || n <= max).length, max };
}
export const slotName = (n, panel) => slotLabel({ slot: String(n), poles: '1', size: 'full' }, panel || 'two');
