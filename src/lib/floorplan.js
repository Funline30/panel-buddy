// Floor plan: a top-down 2D plan of the home, in feet. Everything here is optional data:
//   home.floorplan = { w, h, rooms: [{ id, name, x, y, w, h }], outline?, photoId?, photoOpacity?, photoRot? }
//                    or, for 2+ floors, floors: [{ id, name, rooms }] instead of rooms
//   device.pos     = { x, y, floor? }   (feet from the plan's top-left corner; no floor = first floor)
// outline 'box' (default) draws the w x h outline; 'rooms' = the house is just its rooms
// (L-shapes, a garage sticking out), the w x h box is only the drawing area.
// A home with no floorplan gets a default outline; a device with no pos is "not on the plan yet".
// x runs across the width, y along the length (a single-wide reads top to bottom on a phone).

export const MIN_ROOM = 3; // ft
export const WALL_SNAP = 2; // ft: a tap this close to a wall lands on the wall

export const snap = (v, step = 1) => Math.round((Number(v) || 0) / step) * step + 0; // + 0: no -0
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;

export function defaultSize(home) {
  if (home && (home.type === 'mobile' || home.type === 'rv')) return home.type === 'rv' ? { w: 8, h: 30 } : { w: 16, h: 76 };
  return { w: 40, h: 30 };
}

// Normalized plan for a home (never mutates the home). hasPlan = he has saved one.
// floorId picks the floor; plan.rooms is that floor's rooms, plan.floors holds every floor.
export function planOf(home, floorId = '') {
  const fp = (home && home.floorplan) || null;
  const d = defaultSize(home);
  const w = clamp(snap(fp && fp.w ? fp.w : d.w), 6, 200);
  const h = clamp(snap(fp && fp.h ? fp.h : d.h), 6, 200);
  const plan = { w, h, rooms: [], outline: fp && fp.outline === 'rooms' ? 'rooms' : 'box', photoId: (fp && fp.photoId) || '', photoOpacity: fp && fp.photoOpacity != null ? Number(fp.photoOpacity) : 0.45, photoRot: (fp && Number(fp.photoRot)) || 0, hasPlan: !!fp };
  const raw = fp && Array.isArray(fp.floors) && fp.floors.length ? fp.floors : [{ id: 'f1', name: 'Floor 1', rooms: (fp && fp.rooms) || [] }];
  plan.floors = raw.map((f, i) => ({ id: f.id || 'f' + (i + 1), name: f.name || `Floor ${i + 1}`, rooms: (f.rooms || []).filter((r) => r && r.id).map((r) => clampRoom(r, plan)) }));
  const cur = plan.floors.find((f) => f.id === floorId) || plan.floors[0];
  plan.floor = cur.id;
  plan.rooms = cur.rooms;
  return plan;
}

// Put the current floor's rooms back into the floor list.
export function withRooms(plan, rooms) {
  return { ...plan, rooms, floors: plan.floors.map((f) => (f.id === plan.floor ? { ...f, rooms } : f)) };
}

// What gets saved on the home (no derived fields). One floor = { rooms }, more = { floors }.
export function planToSave(plan) {
  const room = ({ id, name, x, y, w, h }) => ({ id, name: name || '', x, y, w, h });
  const floors = (plan.floors || [{ id: 'f1', name: 'Floor 1', rooms: plan.rooms }]).map((f) => (f.id === plan.floor ? { ...f, rooms: plan.rooms } : f));
  const out = { w: plan.w, h: plan.h };
  if (floors.length > 1) out.floors = floors.map((f) => ({ id: f.id, name: f.name, rooms: f.rooms.map(room) }));
  else out.rooms = (floors[0] ? floors[0].rooms : plan.rooms).map(room);
  if (plan.outline === 'rooms') out.outline = 'rooms';
  if (plan.photoId) { out.photoId = plan.photoId; out.photoOpacity = plan.photoOpacity; out.photoRot = plan.photoRot || 0; }
  return out;
}

// Floor a pin is on ('' = first floor).
export const floorOfPos = (pos, plan) => (pos && pos.floor && plan.floors.some((f) => f.id === pos.floor) ? pos.floor : plan.floors[0].id);

// Snap a room to the 1-ft grid, keep it at least MIN_ROOM and inside the outline.
export function clampRoom(r, plan) {
  const w = clamp(snap(r.w), MIN_ROOM, plan.w);
  const h = clamp(snap(r.h), MIN_ROOM, plan.h);
  const x = clamp(snap(r.x), 0, plan.w - w);
  const y = clamp(snap(r.y), 0, plan.h - h);
  return { ...r, x, y, w, h };
}

export const moveRoom = (r, dx, dy, plan) => clampRoom({ ...r, x: r.x + dx, y: r.y + dy }, plan);

// Resize from the bottom-right corner; the top-left stays put.
export function resizeRoom(r, dw, dh, plan) {
  const w = clamp(snap(r.w + dw), MIN_ROOM, plan.w - r.x);
  const h = clamp(snap(r.h + dh), MIN_ROOM, plan.h - r.y);
  return { ...r, w, h };
}

// New outline size: rooms that no longer fit are pulled back inside (and shrunk if needed).
export function resizePlan(plan, w, h) {
  const next = { ...plan, w: clamp(snap(w), 6, 200), h: clamp(snap(h), 6, 200) };
  next.floors = (plan.floors || []).map((f) => ({ ...f, rooms: f.rooms.map((r) => clampRoom(r, next)) }));
  next.rooms = plan.rooms.map((r) => clampRoom(r, next));
  return next;
}

export const inBounds = (p, plan) => !!p && p.x >= 0 && p.y >= 0 && p.x <= plan.w && p.y <= plan.h;
export const clampPoint = (p, plan) => ({ x: r1(clamp(p.x, 0, plan.w)), y: r1(clamp(p.y, 0, plan.h)) });

// The smallest room a point is in (or null).
export function roomAt(plan, x, y) {
  let best = null;
  for (const r of plan.rooms) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && (!best || r.w * r.h < best.w * best.h)) best = r;
  return best;
}

// Every wall segment: the outline plus each room's four sides.
export function walls(plan) {
  const rect = (x, y, w, h) => [[x, y, x + w, y], [x + w, y, x + w, y + h], [x, y + h, x + w, y + h], [x, y, x, y + h]];
  return [...(plan.outline === 'rooms' ? [] : rect(0, 0, plan.w, plan.h)), ...plan.rooms.flatMap((r) => rect(r.x, r.y, r.w, r.h))];
}

// Closest point on any wall -> { x, y, dist }.
export function nearestWall(plan, x, y) {
  let best = null;
  for (const [x1, y1, x2, y2] of walls(plan)) {
    const px = x1 === x2 ? x1 : clamp(x, Math.min(x1, x2), Math.max(x1, x2));
    const py = y1 === y2 ? y1 : clamp(y, Math.min(y1, y2), Math.max(y1, y2));
    const dist = Math.hypot(px - x, py - y);
    if (!best || dist < best.dist) best = { x: px, y: py, dist };
  }
  return best;
}

// Where a pin dropped at (x, y) lands: on the nearest wall when it is within WALL_SNAP ft
// (plugs and switches live on walls), otherwise where it was dropped (a ceiling light).
// Positions are kept to 0.1 ft.
export function snapPin(plan, x, y, { max = WALL_SNAP, wall = true } = {}) {
  const p = clampPoint({ x, y }, plan);
  if (!wall) return p;
  const w = nearestWall(plan, p.x, p.y);
  const at = w && w.dist <= max ? { x: r1(w.x), y: r1(w.y) } : p;
  // pins on an upper floor remember it; the first floor stays plain { x, y }
  return plan.floors && plan.floor && plan.floors[0].id !== plan.floor ? { ...at, floor: plan.floor } : at;
}

// Which icon a pin gets.
export function pinKind(d) {
  if (!d) return 'other';
  if (d.type === 'outlet') return d.gfci === 'gfci_outlet' || d.style === 'gfci' ? 'gfci' : 'outlet';
  return ['switch', 'light', 'fan', 'appliance'].includes(d.type) ? d.type : 'other';
}
export const PIN_KINDS = [
  { v: 'outlet', t: 'Outlet' },
  { v: 'gfci', t: 'GFCI' },
  { v: 'switch', t: 'Switch' },
  { v: 'light', t: 'Light' },
  { v: 'appliance', t: 'Appliance' },
];
// device fields for a new pin of a kind
export const kindFields = (k) => (k === 'gfci' ? { type: 'outlet', gfci: 'gfci_outlet' } : { type: ['outlet', 'switch', 'light', 'fan', 'appliance'].includes(k) ? k : 'other', gfci: 'unknown' });

// Devices split into: on this floor of the plan, not placed yet (bad/missing pos), and on
// another floor.
export function splitPlaced(devices, plan) {
  const placed = [], unplaced = [], elsewhere = [];
  const floors = plan.floors || [{ id: plan.floor || 'f1' }];
  const here = plan.floor || floors[0].id;
  for (const d of devices) {
    const ok = d.pos && Number.isFinite(d.pos.x) && Number.isFinite(d.pos.y) && inBounds(d.pos, plan);
    if (!ok) unplaced.push(d);
    else if ((d.pos.floor && floors.some((f) => f.id === d.pos.floor) ? d.pos.floor : floors[0].id) === here) placed.push(d);
    else elsewhere.push(d);
  }
  return { placed, unplaced, elsewhere };
}

// Placed pins grouped by breaker: { [breakerId | '']: [deviceId] }
export function pinsByBreaker(devices, plan) {
  const out = {};
  for (const d of splitPlaced(devices, plan).placed) (out[d.breakerId || ''] = out[d.breakerId || ''] || []).push(d.id);
  return out;
}

// Plan rooms a breaker feeds: by its own room list or by a room holding one of its pins.
export function roomsOnBreaker(plan, breaker, devices) {
  if (!breaker) return [];
  const names = new Set((breaker.rooms || []).map((n) => n.toLowerCase()));
  const ids = new Set();
  for (const r of plan.rooms) if (names.has((r.name || '').toLowerCase())) ids.add(r.id);
  for (const d of splitPlaced(devices, plan).placed) {
    if (d.breakerId !== breaker.id) continue;
    // a pin on a wall touches two rooms: count the one named like the plug's room, else the smaller
    const named = plan.rooms.find((r) => (r.name || '').toLowerCase() === (d.room || '').toLowerCase() && d.pos.x >= r.x && d.pos.x <= r.x + r.w && d.pos.y >= r.y && d.pos.y <= r.y + r.h);
    const r = named || roomAt(plan, d.pos.x, d.pos.y);
    if (r) ids.add(r.id);
  }
  return [...ids];
}

// Starters. Each is drawn at a typical size; the plan's own size stretches it (except
// 'Blank'). Spare bedroom names come from rooms he already uses (e.g. "Boys room").
// [name, x, y, w, h]
const SINGLE_WIDE = { w: 16, h: 76, rooms: [
  ['Master bedroom', 0, 0, 16, 13], ['Master bath', 0, 13, 9, 8], ['Master closet', 9, 13, 7, 8],
  ['Living room', 0, 21, 16, 17], ['Kitchen', 0, 38, 16, 14],
  ['Guest bath', 0, 52, 8, 6], ['Laundry / utility', 8, 52, 8, 6], ['Bedroom 2', 0, 58, 16, 9], ['Bedroom 3', 0, 67, 16, 9],
] };
const DOUBLE_WIDE = { w: 28, h: 60, rooms: [
  ['Master bedroom', 0, 0, 16, 14], ['Master bath', 16, 0, 12, 8], ['Master closet', 16, 8, 12, 6],
  ['Living room', 0, 14, 16, 18], ['Dining room', 16, 14, 12, 8], ['Kitchen', 16, 22, 12, 14], ['Laundry / utility', 0, 32, 8, 6], ['Hall', 8, 32, 8, 6],
  ['Bedroom 2', 0, 38, 16, 12], ['Guest bath', 16, 36, 12, 8], ['Bedroom 3', 16, 44, 12, 16], ['Bedroom 4', 0, 50, 16, 10],
] };
// L-shaped: the garage sticks out, so the outline is the rooms themselves
const RANCH = { w: 60, h: 46, outline: 'rooms', rooms: [
  ['Garage', 0, 0, 22, 24], ['Laundry / utility', 22, 0, 8, 10], ['Kitchen', 22, 10, 14, 14], ['Dining room', 36, 10, 10, 14],
  ['Living room', 22, 24, 20, 22], ['Hall', 42, 24, 4, 22], ['Guest bath', 30, 0, 8, 10],
  ['Master bedroom', 46, 0, 14, 14], ['Master bath', 46, 14, 14, 6], ['Master closet', 38, 0, 8, 10],
  ['Bedroom 2', 46, 20, 14, 13], ['Bedroom 3', 46, 33, 14, 13],
] };
const TWO_STORY = { w: 36, h: 30, floors: [
  { id: 'f1', name: 'Floor 1', rooms: [['Living room', 0, 0, 20, 16], ['Kitchen', 20, 0, 16, 14], ['Dining room', 20, 14, 16, 10], ['Entry / stairs', 0, 16, 10, 14], ['Half bath', 10, 16, 10, 6], ['Laundry / utility', 10, 22, 10, 8], ['Office', 20, 24, 16, 6]] },
  { id: 'f2', name: 'Floor 2', rooms: [['Master bedroom', 0, 0, 18, 15], ['Master bath', 18, 0, 10, 9], ['Master closet', 28, 0, 8, 9], ['Hall / stairs', 0, 15, 10, 15], ['Bath', 18, 9, 18, 6], ['Bedroom 2', 10, 15, 13, 15], ['Bedroom 3', 23, 15, 13, 15]] },
] };
export const TEMPLATES = [
  { v: 'single', t: 'Single-wide', sub: 'Mobile home, 16 × 76 ft', ...SINGLE_WIDE },
  { v: 'double', t: 'Double-wide', sub: 'Mobile home, 28 × 60 ft', ...DOUBLE_WIDE },
  { v: 'ranch', t: 'Ranch (1 story)', sub: 'House + garage, L-shaped', ...RANCH },
  { v: 'two', t: '2-story house', sub: 'Floor 1 / Floor 2', ...TWO_STORY },
  { v: 'blank', t: 'Blank', sub: 'Draw my own', w: 0, h: 0, rooms: [] },
];
const NOT_BEDROOM = /living|kitchen|dining|bath|closet|laundry|utility|garage|porch|exterior|outside|hall|entry|stairs|attic|basement|shed|yard|office|galley|storage|master/i;

// Lay a starter out on a plan -> { w, h, outline, floors: [{ id, name, rooms }] }.
// keepSize: stretch to the plan's current w x h (mobile homes); otherwise the starter's size.
export function applyTemplate(v, plan, known = [], { keepSize = false } = {}) {
  const tpl = TEMPLATES.find((x) => x.v === v) || TEMPLATES[0];
  const w = keepSize || !tpl.w ? plan.w : tpl.w;
  const h = keepSize || !tpl.h ? plan.h : tpl.h;
  const sx = tpl.w ? w / tpl.w : 1, sy = tpl.h ? h / tpl.h : 1;
  const used = new Set();
  const all = tpl.floors ? tpl.floors.flatMap((f) => f.rooms) : tpl.rooms;
  for (const r of all) used.add(r[0].toLowerCase());
  const spare = known.filter((n, i) => n && !NOT_BEDROOM.test(n) && !used.has(n.toLowerCase()) && known.indexOf(n) === i);
  const size = { w, h };
  let k = 0;
  const lay = (rooms) => rooms.map(([name, x, y, rw, rh]) => {
    const x0 = snap(x * sx), y0 = snap(y * sy), x1 = snap((x + rw) * sx), y1 = snap((y + rh) * sy);
    if (/^Bedroom \d/.test(name) && spare.length) name = spare.shift();
    return clampRoom({ id: 'fr' + ++k, name, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, size);
  });
  const floors = tpl.floors ? tpl.floors.map((f) => ({ id: f.id, name: f.name, rooms: lay(f.rooms) })) : [{ id: 'f1', name: 'Floor 1', rooms: lay(tpl.rooms) }];
  return { w, h, outline: tpl.outline || 'box', floors };
}

// The single-wide starter on this plan's outline (kept for the example house and tests).
export function mobileHomeTemplate(plan, known = []) {
  return applyTemplate('single', plan, known, { keepSize: true }).floors[0].rooms;
}

// A free spot for a new room (first 10x10 gap scanning down the plan), else the top-left.
export function newRoomSpot(plan, w = 10, h = 10) {
  w = Math.min(w, plan.w); h = Math.min(h, plan.h);
  const hit = (x, y) => plan.rooms.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
  for (let y = 0; y + h <= plan.h; y++) for (let x = 0; x + w <= plan.w; x++) if (!hit(x, y)) return { x, y, w, h };
  return { x: 0, y: 0, w, h };
}
