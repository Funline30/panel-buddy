// Floor plan: a top-down 2D plan of the home, in feet. Everything here is optional data:
//   home.floorplan = { w, h, rooms: [{ id, name, x, y, w, h }], outline?, photoId?, photoOpacity?, photoRot? }
//                    or, for 2+ floors, floors: [{ id, name, rooms }] instead of rooms
//                    outlinePts?: [{ x, y }] = the house outline drawn by eye (per floor; see shapeOf)
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
  const single = !(fp && Array.isArray(fp.floors) && fp.floors.length);
  plan.floors = raw.map((f, i) => {
    const pts = okPts(single ? fp && fp.outlinePts : f.outlinePts);
    return { id: f.id || 'f' + (i + 1), name: f.name || `Floor ${i + 1}`, rooms: (f.rooms || []).filter((r) => r && r.id).map((r) => clampRoom(r, plan)), ...(pts ? { outlinePts: pts } : {}) };
  });
  const cur = plan.floors.find((f) => f.id === floorId) || plan.floors[0];
  plan.floor = cur.id;
  plan.rooms = cur.rooms;
  plan.outlinePts = cur.outlinePts || null;
  return plan;
}

// A saved outline, checked: 3+ finite points (snapped to 0.1 ft), else null.
function okPts(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  const out = pts.filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))).map((p) => ({ x: r1(Number(p.x)), y: r1(Number(p.y)) }));
  return out.length >= 3 ? out : null;
}

// Put the current floor's rooms back into the floor list.
export function withRooms(plan, rooms) {
  return { ...plan, rooms, floors: plan.floors.map((f) => (f.id === plan.floor ? { ...f, rooms } : f)) };
}

// What gets saved on the home (no derived fields). One floor = { rooms }, more = { floors }.
export function planToSave(plan) {
  const room = ({ id, name, x, y, w, h }) => ({ id, name: name || '', x, y, w, h });
  const floors = (plan.floors || [{ id: 'f1', name: 'Floor 1', rooms: plan.rooms }]).map((f) => (f.id === plan.floor ? { ...f, rooms: plan.rooms, outlinePts: plan.outlinePts } : f));
  const out = { w: plan.w, h: plan.h };
  // the outline is only saved when it isn't just the w x h box
  const pts = (f) => (f.outlinePts && f.outlinePts.length >= 3 && !isBox(f.outlinePts, plan.w, plan.h) ? { outlinePts: f.outlinePts.map(({ x, y }) => ({ x, y })) } : {});
  if (floors.length > 1) out.floors = floors.map((f) => ({ id: f.id, name: f.name, rooms: f.rooms.map(room), ...pts(f) }));
  else { out.rooms = (floors[0] ? floors[0].rooms : plan.rooms).map(room); Object.assign(out, pts(floors[0] || plan)); }
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
  const pts = plan.outlinePts && plan.outlinePts.length >= 3 ? plan.outlinePts : null;
  const outer = pts ? pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return [p.x, p.y, q.x, q.y]; }) : plan.outline === 'rooms' ? [] : rect(0, 0, plan.w, plan.h);
  return [...outer, ...plan.rooms.flatMap((r) => rect(r.x, r.y, r.w, r.h))];
}

// Closest point on any wall -> { x, y, dist }.
export function nearestWall(plan, x, y) {
  let best = null;
  for (const [x1, y1, x2, y2] of walls(plan)) {
    const hit = segDist({ x, y }, { x: x1, y: y1 }, { x: x2, y: y2 });
    if (!best || hit.dist < best.dist) best = hit;
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

// ---- moving / swapping / rotating rooms (pins go with their room)

// Rooms that overlap another room (by area, touching walls don't count) -> Set of ids.
export function overlapping(rooms) {
  const out = new Set();
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) { out.add(a.id); out.add(b.id); }
    }
  return out;
}

const inside = (p, r) => p.x >= r.x - 1e-6 && p.x <= r.x + r.w + 1e-6 && p.y >= r.y - 1e-6 && p.y <= r.y + r.h + 1e-6;

// The room a placed pin belongs to (for moving it with the room): a pin on a shared wall
// touches two rooms, so the one named like the plug's room wins, else the smaller one.
export function roomOfPin(plan, d) {
  if (!d || !d.pos) return null;
  const hits = plan.rooms.filter((r) => inside(d.pos, r));
  if (!hits.length) return null;
  const named = hits.find((r) => r.name && d.room && r.name.toLowerCase() === d.room.toLowerCase());
  return named || hits.reduce((a, b) => (b.w * b.h < a.w * a.h ? b : a));
}

// Ids of the pins (on this floor) that belong to a room.
export function pinsInRoom(plan, room, devices) {
  if (!room) return [];
  return splitPlaced(devices, plan).placed.filter((d) => { const r = roomOfPin(plan, d); return r && r.id === room.id; }).map((d) => d.id);
}

// A point in room `from` -> the same spot in room `to` (same place along each wall, so a plug
// on the left wall stays on the left wall when the room moves, grows or shrinks).
// turn = true: the room was turned a quarter (w and h swapped), the point turns with it.
export function mapPoint(p, from, to, plan, { turn = false } = {}) {
  let u = from.w ? (p.x - from.x) / from.w : 0.5;
  let v = from.h ? (p.y - from.y) / from.h : 0.5;
  if (turn) [u, v] = [1 - v, u]; // clockwise
  const out = clampPoint({ x: to.x + u * to.w, y: to.y + v * to.h }, plan);
  return p.floor ? { ...out, floor: p.floor } : out;
}

// New positions for the pins of rooms that moved: { [deviceId]: pos }.
// moves = [{ from: room, to: room, turn? }]; ownership is read from the plan BEFORE the move.
export function movePins(plan, devices, moves) {
  const out = {};
  for (const mv of moves) {
    if (!mv.from || !mv.to) continue;
    const same = mv.from.x === mv.to.x && mv.from.y === mv.to.y && mv.from.w === mv.to.w && mv.from.h === mv.to.h && !mv.turn;
    if (same) continue;
    for (const id of pinsInRoom(plan, mv.from, devices)) {
      const d = devices.find((x) => x.id === id);
      out[id] = mapPoint(d.pos, mv.from, mv.to, plan, { turn: mv.turn });
    }
  }
  return out;
}

// Resize from any corner ('nw' | 'ne' | 'sw' | 'se'): the opposite corner stays put.
// dx/dy are how far the dragged corner moved (ft). Snaps to 1 ft, stays >= MIN_ROOM and in bounds.
export function resizeCorner(r, corner, dx, dy, plan) {
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  if (corner.includes('w')) x0 = clamp(snap(x0 + dx), 0, x1 - MIN_ROOM); else x1 = clamp(snap(x1 + dx), x0 + MIN_ROOM, plan.w);
  if (corner.includes('n')) y0 = clamp(snap(y0 + dy), 0, y1 - MIN_ROOM); else y1 = clamp(snap(y1 + dy), y0 + MIN_ROOM, plan.h);
  return { ...r, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Turn a room a quarter: w and h swap around its middle, then it's pulled back inside.
export function rotateRoom(r, plan) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return clampRoom({ ...r, w: r.h, h: r.w, x: cx - r.h / 2, y: cy - r.w / 2 }, plan);
}

// Two rooms trade places -> { a, b } (the new rectangles).
//  - side by side (same row or column, touching): they swap order and each keeps its size;
//  - otherwise each keeps its own size at the other's corner if it fits there (in bounds and
//    not on top of another room); if either doesn't fit, they trade rectangles.
export function swapRooms(a, b, plan) {
  const sameCol = a.x === b.x && a.w === b.w, sameRow = a.y === b.y && a.h === b.h;
  if (sameCol && (a.y + a.h === b.y || b.y + b.h === a.y)) {
    const top = Math.min(a.y, b.y), [first] = a.y < b.y ? [a] : [b];
    const second = first === a ? b : a;
    const s = { ...second, y: top }, f = { ...first, y: top + second.h };
    return first === a ? { a: f, b: s } : { a: s, b: f };
  }
  if (sameRow && (a.x + a.w === b.x || b.x + b.w === a.x)) {
    const left = Math.min(a.x, b.x), first = a.x < b.x ? a : b;
    const second = first === a ? b : a;
    const s = { ...second, x: left }, f = { ...first, x: left + second.w };
    return first === a ? { a: f, b: s } : { a: s, b: f };
  }
  const others = plan.rooms.filter((r) => r.id !== a.id && r.id !== b.id);
  const fits = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= plan.w && r.y + r.h <= plan.h && !overlapping([r, ...others]).has(r.id);
  const a1 = { ...a, x: b.x, y: b.y }, b1 = { ...b, x: a.x, y: a.y };
  if (a.w === b.w && a.h === b.h) return { a: a1, b: b1 };
  if (fits(a1) && fits(b1) && !overlapping([a1, b1]).size) return { a: a1, b: b1 };
  return { a: { ...a, x: b.x, y: b.y, w: b.w, h: b.h }, b: { ...b, x: a.x, y: a.y, w: a.w, h: a.h } };
}


// ---- house shape: the outline as a polygon he drags by eye (no measuring)
// home.floorplan.outlinePts = [{ x, y }] (one floor) or floors[i].outlinePts (2+ floors), feet,
// clockwise on screen. Optional: with none the outline is the w x h box (or the rooms, for
// outline 'rooms'), exactly as before. A shape that is just the w x h box isn't saved.

export const rectPts = (w, h, x = 0, y = 0) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

// The points of a plan's outline (its polygon, else the box, else the rooms' outline).
export function shapeOf(plan) {
  if (Array.isArray(plan.outlinePts) && plan.outlinePts.length >= 3) return plan.outlinePts.map((p) => ({ x: p.x, y: p.y }));
  if (plan.outline === 'rooms' && plan.rooms && plan.rooms.length) { const o = roomsOutline(plan.rooms); if (o.length >= 3) return o; }
  return rectPts(plan.w, plan.h);
}

export function bboxOf(pts) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export const isBox = (pts, w, h) => {
  if (!pts || pts.length !== 4) return false;
  const k = (p) => `${p.x},${p.y}`, want = new Set(rectPts(w, h).map(k));
  return pts.every((p) => want.has(k(p)));
};

export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}

// Snap to the grid and drop repeated points (and a closing point equal to the first).
export function cleanPts(pts, step = 1) {
  const out = [];
  for (const p of pts) {
    const q = { x: snap(p.x, step), y: snap(p.y, step) };
    const last = out[out.length - 1];
    if (!last || last.x !== q.x || last.y !== q.y) out.push(q);
  }
  while (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop();
  return out;
}

const segHit = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const on = (p, q, r) => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4 && o1 && o2 && o3 && o4) return true;
  return (!o1 && on(a, b, c)) || (!o2 && on(a, b, d)) || (!o3 && on(c, d, a)) || (!o4 && on(c, d, b));
};

// A usable outline: 3+ corners, some area, walls that don't cross each other.
export function validShape(pts) {
  const n = pts.length;
  if (n < 3 || Math.abs(polyArea(pts)) < 9) return false;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // neighbours share a corner
      if (segHit(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  return true;
}

// Drag a corner to (x, y): snaps to 1 ft, and lines up with a neighbour's wall when it is
// within `align` ft of it (so walls come out straight by eye).
export function moveCorner(pts, i, x, y, { align = 1.5 } = {}) {
  const n = pts.length, a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
  let nx = snap(x), ny = snap(y);
  for (const q of [a, b]) {
    if (Math.abs(x - q.x) <= align) nx = q.x;
    if (Math.abs(y - q.y) <= align) ny = q.y;
  }
  return pts.map((p, k) => (k === i ? { x: nx, y: ny } : p));
}

// "+ Corner": a new corner in the middle of wall i (from corner i to i+1). Returns the same
// points when the wall is too short to split.
export function addCorner(pts, i, t = 0.5) {
  const n = pts.length, a = pts[i], b = pts[(i + 1) % n];
  const p = { x: snap(a.x + (b.x - a.x) * t), y: snap(a.y + (b.y - a.y) * t) };
  if ((p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y)) return pts;
  return [...pts.slice(0, i + 1), p, ...pts.slice(i + 1)];
}

export function removeCorner(pts, i) {
  if (pts.length <= 3) return pts;
  const out = pts.filter((_, k) => k !== i);
  return validShape(out) ? out : pts;
}

// Drag wall i (corner i to i+1) by (dx, dy): it slides straight out or in, staying parallel.
// When the wall next to an end runs the same way (a wall split by + Corner), a new short wall
// is made there, so pulling half a wall out makes an L, a T or a bump-out with square corners.
// Returns { pts, i } (i = the dragged wall's index in the new points).
export function moveEdge(pts, i, dx, dy) {
  const n = pts.length, j = (i + 1) % n;
  const a = pts[i], b = pts[j];
  const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey) || 1;
  let mx, my;
  if (ey === 0) { mx = 0; my = snap(dy); } else if (ex === 0) { mx = snap(dx); my = 0; } else {
    const nx = -ey / len, ny = ex / len, d = dx * nx + dy * ny;
    mx = snap(nx * d); my = snap(ny * d);
  }
  const perp = (p, q) => (q.x - p.x) * ex + (q.y - p.y) * ey === 0;
  const prev = pts[(i - 1 + n) % n], next = pts[(j + 1) % n];
  const keepA = !perp(prev, a), keepB = !perp(b, next);
  const out = [];
  let at = -1;
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    if (k === i) {
      if (keepA) out.push({ ...p });
      at = out.length;
      out.push({ x: p.x + mx, y: p.y + my });
    } else if (k === j) {
      out.push({ x: p.x + mx, y: p.y + my });
      if (keepB) out.push({ ...p });
    } else out.push({ ...p });
  }
  return { pts: out, i: at };
}

// Quick shapes on a w x h footprint (one tap, then drag): rect, L, T, U.
export function presetShape(kind, w, h, x = 0, y = 0) {
  const X = (f) => x + snap(w * f), Y = (f) => y + snap(h * f);
  const P = (arr) => arr.map(([px, py]) => ({ x: px, y: py }));
  if (kind === 'L') return P([[x, y], [X(1), y], [X(1), Y(0.55)], [X(0.55), Y(0.55)], [X(0.55), Y(1)], [x, Y(1)]]);
  if (kind === 'T') return P([[x, y], [X(1), y], [X(1), Y(0.4)], [X(0.68), Y(0.4)], [X(0.68), Y(1)], [X(0.32), Y(1)], [X(0.32), Y(0.4)], [x, Y(0.4)]]);
  if (kind === 'U') return P([[x, y], [X(0.32), y], [X(0.32), Y(0.5)], [X(0.68), Y(0.5)], [X(0.68), y], [X(1), y], [X(1), Y(1)], [x, Y(1)]]);
  return rectPts(snap(w), snap(h), x, y);
}

// Distance from a point to wall a-b.
function segDist(p, a, b) {
  const ex = b.x - a.x, ey = b.y - a.y, l2 = ex * ex + ey * ey;
  const t = l2 ? clamp(((p.x - a.x) * ex + (p.y - a.y) * ey) / l2, 0, 1) : 0;
  const x = a.x + t * ex, y = a.y + t * ey;
  return { x, y, dist: Math.hypot(p.x - x, p.y - y) };
}

// Inside the outline (a point on a wall counts as inside: plugs live on walls).
export function pointInPoly(p, pts, tol = 0.15) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (segDist(p, a, b).dist <= tol) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// How much of a room is outside the outline (0..1), sampled on a grid.
export function roomOutside(r, pts) {
  const nx = Math.min(40, Math.max(1, Math.round(r.w))), ny = Math.min(40, Math.max(1, Math.round(r.h)));
  let out = 0;
  for (let i = 0; i < nx; i++) for (let k = 0; k < ny; k++) if (!pointInPoly({ x: r.x + ((i + 0.5) * r.w) / nx, y: r.y + ((k + 0.5) * r.h) / ny }, pts, 0)) out++;
  return out / (nx * ny);
}

// Rooms that stick out of the house outline -> Set of ids (a sliver under 3% doesn't count).
export function roomsOutside(rooms, pts) {
  const s = new Set();
  if (!pts || pts.length < 3) return s;
  for (const r of rooms) if (roomOutside(r, pts) > 0.03) s.add(r.id);
  return s;
}

// The outside line of a set of rooms (the biggest connected block), as corners.
export function roomsOutline(rooms) {
  if (!rooms.length) return [];
  const W = Math.min(400, Math.max(...rooms.map((r) => Math.ceil(r.x + r.w)))), H = Math.min(400, Math.max(...rooms.map((r) => Math.ceil(r.y + r.h))));
  const fill = new Uint8Array(W * H);
  for (const r of rooms) for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(H, Math.ceil(r.y + r.h)); y++) for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(W, Math.ceil(r.x + r.w)); x++) fill[y * W + x] = 1;
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && fill[y * W + x];
  const edges = new Map(); // "x,y" -> [[x2,y2]]
  const add = (x1, y1, x2, y2) => { const k = x1 + ',' + y1; if (!edges.has(k)) edges.set(k, []); edges.get(k).push([x2, y2]); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on(x, y)) continue;
    if (!on(x, y - 1)) add(x, y, x + 1, y);
    if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!on(x - 1, y)) add(x, y + 1, x, y);
  }
  let best = [];
  while (edges.size) {
    const [k0] = edges.keys();
    let [x, y] = k0.split(',').map(Number);
    const loop = [];
    for (let guard = 0; guard < 200000; guard++) {
      const k = x + ',' + y, list = edges.get(k);
      if (!list) break;
      const [nx, ny] = list.pop();
      if (!list.length) edges.delete(k);
      loop.push({ x, y });
      x = nx; y = ny;
    }
    if (polyArea(loop) > polyArea(best.length ? best : [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])) best = loop;
  }
  return dropStraight(best);
}

// Remove corners that sit in the middle of a straight wall.
export function dropStraight(pts) {
  let out = cleanPts(pts);
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], p = out[i], b = out[(i + 1) % out.length];
      if ((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) === 0) { out = out.filter((_, k) => k !== i); changed = true; break; }
    }
  }
  return out;
}

// ---- rooms follow the house: when the outline is stretched, rooms and plugs scale with it
const mapV = (v, a0, al, b0, bl) => (al ? b0 + ((v - a0) * bl) / al : b0 + (v - a0));

// A room in box `from` -> the same spot in box `to` (each wall snapped to 1 ft, so rooms that
// touched still touch).
export function scaleRoom(r, from, to) {
  const x0 = snap(mapV(r.x, from.x, from.w, to.x, to.w)), x1 = snap(mapV(r.x + r.w, from.x, from.w, to.x, to.w));
  const y0 = snap(mapV(r.y, from.y, from.h, to.y, to.h)), y1 = snap(mapV(r.y + r.h, from.y, from.h, to.y, to.h));
  return { ...r, x: x0, y: y0, w: Math.max(MIN_ROOM, x1 - x0), h: Math.max(MIN_ROOM, y1 - y0) };
}

export function scalePoint(p, from, to) {
  const out = { x: r1(mapV(p.x, from.x, from.w, to.x, to.w)), y: r1(mapV(p.y, from.y, from.h, to.y, to.h)) };
  return p.floor ? { ...out, floor: p.floor } : out;
}

// Rooms (this floor) and their plugs, stretched from the old house box to the new one.
// -> { rooms, pins: { [deviceId]: pos } }
export function fitRoomsToShape(plan, devices, from, to) {
  const rooms = plan.rooms.map((r) => scaleRoom(r, from, to));
  const pins = {};
  for (const d of splitPlaced(devices, plan).placed) pins[d.id] = scalePoint(d.pos, from, to);
  return { rooms, pins };
}

// After a shape change: slide everything so nothing is left of / above 0, and make w x h the
// box around the outline(s), rooms and plugs. -> { plan, pins: { [deviceId]: pos } }
// devices: every device of the home (plugs on any floor shift together).
export function normalizeShape(plan, devices = []) {
  const floors = plan.floors.map((f) => (f.id === plan.floor ? { ...f, rooms: plan.rooms, outlinePts: plan.outlinePts } : f));
  const xs = [], ys = [];
  for (const f of floors) {
    const pts = f.outlinePts && f.outlinePts.length >= 3 ? f.outlinePts : f.id === plan.floor ? null : rectPts(plan.w, plan.h);
    for (const p of pts || []) { xs.push(p.x); ys.push(p.y); }
    for (const r of f.rooms) { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h); }
  }
  // plugs on the plan (in its box, or inside the new outline's box); ones already off the plan stay off
  const ob = plan.outlinePts && plan.outlinePts.length >= 3 ? bboxOf(plan.outlinePts) : { x: 0, y: 0, w: plan.w, h: plan.h };
  const onPlan = (p) => inBounds(p, plan) || (p.x >= ob.x && p.y >= ob.y && p.x <= ob.x + ob.w && p.y <= ob.y + ob.h);
  const placed = devices.filter((d) => d.pos && Number.isFinite(d.pos.x) && Number.isFinite(d.pos.y) && onPlan(d.pos));
  for (const d of placed) { xs.push(d.pos.x); ys.push(d.pos.y); }
  if (!xs.length) return { plan, pins: {} };
  const dx = -Math.min(0, Math.floor(Math.min(...xs))), dy = -Math.min(0, Math.floor(Math.min(...ys)));
  // shrink from the left / top too, when the house moved away from 0 (keeps the plan snug)
  const sx = Math.max(0, Math.floor(Math.min(...xs))), sy = Math.max(0, Math.floor(Math.min(...ys)));
  const ox = dx - sx, oy = dy - sy;
  const mv = (p) => ({ ...p, x: snap(p.x + ox), y: snap(p.y + oy) });
  const nf = floors.map((f) => ({ ...f, rooms: f.rooms.map((r) => ({ ...r, x: r.x + ox, y: r.y + oy })), ...(f.outlinePts ? { outlinePts: f.outlinePts.map(mv) } : {}) }));
  const w = clamp(Math.ceil(Math.max(...xs) + ox), 6, 200), h = clamp(Math.ceil(Math.max(...ys) + oy), 6, 200);
  const cur = nf.find((f) => f.id === plan.floor);
  const next = { ...plan, w, h, floors: nf, rooms: cur.rooms, outlinePts: cur.outlinePts || null };
  const pins = {};
  if (ox || oy) for (const d of placed) pins[d.id] = { ...d.pos, x: r1(d.pos.x + ox), y: r1(d.pos.y + oy) };
  return { plan: next, pins };
}
