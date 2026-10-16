// On / off, "Move to..." and portable devices.
// Loads are { name, watts, qty, note } on breakers.loads or devices.loads (an outlet's own
// list). Optional fields added here (no schema break, old data reads the same):
//   on: false      -> listed but switched off / unplugged right now (missing = on)
//   portable: true -> moves around (vacuum, hair dryer...). Shows a "portable" badge.
// Portables that are not plugged in anywhere live on the home: homes.portables[]
// ({ name, watts, qty, note, portable: true }). They count on no breaker.
import { isOn, totalWatts } from './load.js';

// A load's address: "b:<breakerId>:<index>", "d:<deviceId>:<index>" or
// "p:<homeId>:<index>" (a home's unplugged portables).
const COL = { b: 'breakers', d: 'devices', p: 'homes' };
const FIELD = { b: 'loads', d: 'loads', p: 'portables' };

export function loadRef(kind, id, i) {
  return `${kind}:${id}:${i}`;
}

export function parseRef(ref) {
  const m = /^([bdp]):(.+):(\d+)$/.exec(String(ref || ''));
  if (!m) return null;
  return { kind: m[1], col: COL[m[1]], field: FIELD[m[1]], id: m[2], index: Number(m[3]) };
}

// data = { breakers, devices, homes }
function containerOf(data, r) {
  return r ? (data[r.col] || []).find((x) => x.id === r.id) || null : null;
}

export function loadAt(data, ref) {
  const r = parseRef(ref);
  const c = containerOf(data, r);
  return c ? (c[r.field] || [])[r.index] || null : null;
}

// Returns the updated container object ({ col, obj }) or null.
export function toggleLoad(data, ref, on) {
  const r = parseRef(ref);
  const c = containerOf(data, r);
  if (!c || r.kind === 'p') return null;
  const list = [...(c[r.field] || [])];
  const l = list[r.index];
  if (!l) return null;
  const next = on === undefined ? !isOn(l) : !!on;
  list[r.index] = { ...l, on: next };
  return { col: r.col, obj: { ...c, [r.field]: list } };
}

// Every load on a breaker AND on its outlets, switched on or off. Returns updates.
export function setAllOn(data, breakerId, on) {
  const out = [];
  const b = (data.breakers || []).find((x) => x.id === breakerId);
  if (!b) return out;
  const flip = (loads) => (loads || []).map((l) => ({ ...l, on: !!on }));
  if ((b.loads || []).length) out.push({ col: 'breakers', obj: { ...b, loads: flip(b.loads) } });
  for (const d of data.devices || []) {
    if (d.breakerId === breakerId && (d.loads || []).length) out.push({ col: 'devices', obj: { ...d, loads: flip(d.loads) } });
  }
  return out;
}

// Move one load. to = { kind: 'b' | 'd', id } (a breaker or an outlet) or { kind: 'p', id: homeId }
// (unplug a portable back to the home's list). Keeps every field, including on/off.
// opts.on: force on/off (plug in = on). Returns the updates to save (1 or 2 objects).
export function moveLoad(data, ref, to, opts = {}) {
  const r = parseRef(ref);
  const src = containerOf(data, r);
  if (!src || !to) return [];
  const list = [...(src[r.field] || [])];
  const item = list[r.index];
  if (!item) return [];
  const tr = { kind: to.kind, col: COL[to.kind], field: FIELD[to.kind], id: to.id };
  if (!tr.col) return [];
  if (tr.kind === r.kind && tr.id === r.id) return [];
  const dst = containerOf(data, tr);
  if (!dst) return [];
  let moved = { ...item };
  if (tr.kind === 'p') {
    moved.portable = true;
    delete moved.on; // unplugged: counts nowhere
  } else if (opts.on !== undefined) moved.on = !!opts.on;
  else if (r.kind === 'p') moved.on = true; // plugging a portable in = it's on
  if (opts.portable) moved.portable = true;
  list.splice(r.index, 1);
  return [
    { col: r.col, obj: { ...src, [r.field]: list } },
    { col: tr.col, obj: { ...dst, [tr.field]: [...(dst[tr.field] || []), moved] } },
  ];
}

// Mark / unmark a load as portable (badge). Returns { col, obj } or null.
export function setPortable(data, ref, portable) {
  const r = parseRef(ref);
  const c = containerOf(data, r);
  if (!c) return null;
  const list = [...(c[r.field] || [])];
  const l = list[r.index];
  if (!l) return null;
  const n = { ...l };
  if (portable) n.portable = true;
  else delete n.portable;
  list[r.index] = n;
  return { col: r.col, obj: { ...c, [r.field]: list } };
}

// Every portable device of a home: unplugged ones (home list) + ones placed on a breaker
// or an outlet of this home. [{ ref, load, where: null | { kind, breaker, device } }]
export function portablesOf(data, homeId) {
  const out = [];
  const home = (data.homes || []).find((h) => h.id === homeId);
  (home && home.portables ? home.portables : []).forEach((l, i) => out.push({ ref: loadRef('p', homeId, i), load: l, where: null }));
  for (const b of data.breakers || []) {
    if (b.homeId !== homeId) continue;
    (b.loads || []).forEach((l, i) => l && l.portable && out.push({ ref: loadRef('b', b.id, i), load: l, where: { kind: 'b', breaker: b, device: null } }));
  }
  for (const d of data.devices || []) {
    if (d.homeId !== homeId) continue;
    const b = (data.breakers || []).find((x) => x.id === d.breakerId) || null;
    (d.loads || []).forEach((l, i) => l && l.portable && out.push({ ref: loadRef('d', d.id, i), load: l, where: { kind: 'd', breaker: b, device: d } }));
  }
  return out;
}

// Watts this load adds to a circuit if it is on.
export function loadWatts(l) {
  return totalWatts([l]);
}

// Suggested portables (catalog ids) for the "Portable devices" list. Typical estimates.
export const PORTABLE_SUGGESTIONS = [
  'vacuum-upright',
  'carpet-cleaner',
  'hair-dryer',
  'flat-iron-hair-straightener',
  'curling-iron',
  'space-heater',
  'clothes-iron',
  'steam-mop-steam-cleaner',
];
