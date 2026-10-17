// Doorways (and windows) on the floor plan. Optional data, saved per floor beside the rooms:
//   home.floorplan.doors = [door]   (2+ floors: floors[i].doors)
//   door = { id, roomId, wall: 'n'|'e'|'s'|'w', offsetFt, widthFt, kind, swing, hinge }
//     roomId    the room it's in; it moves / turns with that room and goes when the room goes
//     wall      which side of the room: n top, e right, s bottom, w left (as seen on the plan)
//     offsetFt  from the wall's start (left end of n / s, top end of e / w) to the door's edge
//   outside door on the house outline: { id, roomId: 'outline', x, y, widthFt, ... }
//     x, y = the middle of the door (ft); it sits on the closest outline wall, so it stays put
//     when the outline is redrawn (auto outline, Shape house)
//   kind   'door' (default) | 'double' | 'opening' (no door) | 'window'
//   swing  'in' (into the room / house, default) | 'out'
//   hinge  'start' (default) | 'end': which end of the door the hinge is on
// Old plans have no doors and load unchanged.
import { inch, pointInPoly } from './floorplan.js';

export const DOOR_WIDTHS = [2.5, 2 + 8 / 12, 3, 5]; // 2'6", 2'8", 3', 5' (double)
export const DOOR_KINDS = [
  { v: 'door', t: 'Door' },
  { v: 'double', t: 'Double' },
  { v: 'opening', t: 'Opening' },
  { v: 'window', t: 'Window' },
];
export const DOOR_SNAP = 2; // ft: a tap this close to a wall puts the door on it
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SIDES = ['n', 'e', 's', 'w'];

// A room's wall as { a, b, ux, uy, nx, ny, len }: a = start, u = along, n = into the room.
export function roomWall(r, wall) {
  if (wall === 'n') return { a: { x: r.x, y: r.y }, ux: 1, uy: 0, nx: 0, ny: 1, len: r.w };
  if (wall === 's') return { a: { x: r.x, y: r.y + r.h }, ux: 1, uy: 0, nx: 0, ny: -1, len: r.w };
  if (wall === 'e') return { a: { x: r.x + r.w, y: r.y }, ux: 0, uy: 1, nx: -1, ny: 0, len: r.h };
  return { a: { x: r.x, y: r.y }, ux: 0, uy: 1, nx: 1, ny: 0, len: r.h };
}
export const wallLen = (r, wall) => (wall === 'n' || wall === 's' ? r.w : r.h);
export const isSideways = (wall) => wall === 'e' || wall === 'w';

// Keep a room door on its wall: no wider than the wall, the whole door on it.
export function clampDoor(d, room) {
  if (!room || d.roomId === 'outline') return d;
  const len = wallLen(room, d.wall);
  const widthFt = inch(clamp(Number(d.widthFt) || 3, 1, Math.max(1, len)));
  const offsetFt = inch(clamp(Number(d.offsetFt) || 0, 0, Math.max(0, len - widthFt)));
  return { ...d, widthFt, offsetFt };
}

// Closest point on segment a-b to p -> { t (0..1), x, y, dist }
function proj(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1) : 0;
  const x = a.x + t * dx, y = a.y + t * dy;
  return { t, x, y, dist: Math.hypot(p.x - x, p.y - y) };
}

// The outline wall an outside door sits on, and where -> seg (see doorSeg) or null.
function outlineSeg(d, poly) {
  if (!poly || poly.length < 3) return null;
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const h = proj(d, a, b);
    if (!best || h.dist < best.h.dist - 1e-9) best = { i, a, b, len, h };
  }
  if (!best) return null;
  const { a, b, len, h } = best;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const w = Math.min(Number(d.widthFt) || 3, len);
  const off = clamp(h.t * len - w / 2, 0, len - w);
  // which side is inside the house: a little step to the right of the wall, tested
  let nx = -uy, ny = ux;
  const mid = { x: a.x + ux * (off + w / 2), y: a.y + uy * (off + w / 2) };
  if (!pointInPoly({ x: mid.x + nx * 0.3, y: mid.y + ny * 0.3 }, poly, 0)) { nx = -nx; ny = -ny; }
  return { a: { x: a.x + ux * off, y: a.y + uy * off }, b: { x: a.x + ux * (off + w), y: a.y + uy * (off + w) }, ux, uy, nx, ny, w, edge: best.i, len, off };
}

// Where a door is drawn: { id, a, b (its two ends), ux, uy (a -> b), nx, ny (the "in" side),
// w, kind, swing, hinge, outside } or null (its room is gone / no outline).
export function doorSeg(d, plan, poly = null) {
  if (!d) return null;
  const base = { id: d.id, kind: d.kind || 'door', swing: d.swing === 'out' ? 'out' : 'in', hinge: d.hinge === 'end' ? 'end' : 'start' };
  if (d.roomId === 'outline') {
    const s = outlineSeg(d, poly);
    return s ? { ...base, ...s, outside: true, roomId: 'outline' } : null;
  }
  const r = (plan.rooms || []).find((x) => x.id === d.roomId);
  if (!r || !SIDES.includes(d.wall)) return null;
  const c = clampDoor(d, r), W = roomWall(r, d.wall);
  const a = { x: W.a.x + W.ux * c.offsetFt, y: W.a.y + W.uy * c.offsetFt };
  return { ...base, a, b: { x: a.x + W.ux * c.widthFt, y: a.y + W.uy * c.widthFt }, ux: W.ux, uy: W.uy, nx: W.nx, ny: W.ny, w: c.widthFt, roomId: r.id, wall: d.wall, len: W.len, off: c.offsetFt };
}

// Two doors on the same wall line that overlap (a door on a shared wall, added from each
// room) are one door: the first one stays. -> the segs to draw.
export function dedupeDoors(segs) {
  const out = [];
  for (const s of segs) {
    if (!s) continue;
    const dup = out.some((o) => {
      if (Math.abs(o.ux * s.uy - o.uy * s.ux) > 1e-6) return false; // not parallel
      const across = Math.abs((s.a.x - o.a.x) * o.uy - (s.a.y - o.a.y) * o.ux);
      if (across > 0.25) return false; // not on the same line
      const t = (p) => (p.x - o.a.x) * o.ux + (p.y - o.a.y) * o.uy;
      const s0 = Math.min(t(s.a), t(s.b)), s1 = Math.max(t(s.a), t(s.b));
      const overlap = Math.min(o.w, s1) - Math.max(0, s0);
      return overlap > Math.min(o.w, s.w) * 0.5;
    });
    if (!dup) out.push(s);
  }
  return out;
}

// Every door of the plan as drawn (deduped). poly = the outline as drawn (for outside doors).
export function planDoorSegs(plan, poly = null) {
  return dedupeDoors((plan.doors || []).map((d) => doorSeg(d, plan, poly)));
}

// A tap at (x, y) -> where a new door would go: { roomId, wall, offsetFt } on the closest room
// wall (on a wall two rooms share, the room the tap is in), else { roomId: 'outline', x, y } on
// the closest outline wall, else null (too far from any wall).
export function doorSpot(plan, x, y, { poly = null, widthFt = 3, max = DOOR_SNAP } = {}) {
  let best = null;
  const p = { x, y };
  for (const r of plan.rooms || []) {
    const inside = x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
    for (const wall of SIDES) {
      const W = roomWall(r, wall);
      const h = proj(p, W.a, { x: W.a.x + W.ux * W.len, y: W.a.y + W.uy * W.len });
      if (h.dist > max) continue;
      const score = h.dist - (inside ? 0.01 : 0);
      if (!best || score < best.score) best = { score, r, wall, t: h.t * W.len, len: W.len };
    }
  }
  if (best) {
    const w = Math.min(widthFt, best.len);
    return { roomId: best.r.id, wall: best.wall, offsetFt: inch(clamp(best.t - w / 2, 0, best.len - w)), widthFt: inch(w) };
  }
  if (poly && poly.length >= 3) {
    const s = outlineSeg({ x, y, widthFt }, poly);
    if (s) {
      const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      if (Math.hypot(mid.x - x, mid.y - y) <= max + widthFt / 2) return { roomId: 'outline', x: r1(mid.x), y: r1(mid.y), widthFt: inch(s.w) };
    }
  }
  return null;
}

// A new door at a tap -> the door, or null. Defaults: 3 ft, swings into the room, hinge at the start.
export function placeDoor(plan, x, y, { id, poly = null, widthFt = 3, kind = 'door', swing = 'in', hinge = 'start' } = {}) {
  const spot = doorSpot(plan, x, y, { poly, widthFt });
  if (!spot) return null;
  return { id: id || 'dr' + Math.random().toString(36).slice(2, 8), kind, swing, hinge, ...spot };
}

// Drag a door along its wall: its middle follows the finger (projected on the wall), the whole
// door stays on the wall. Outside doors follow the outline wall they're on.
export function slideDoor(d, plan, x, y, poly = null) {
  if (d.roomId === 'outline') {
    const s = outlineSeg(d, poly);
    if (!s) return d;
    const a0 = { x: s.a.x - s.ux * s.off, y: s.a.y - s.uy * s.off }; // the wall's start
    const t = clamp((x - a0.x) * s.ux + (y - a0.y) * s.uy, s.w / 2, s.len - s.w / 2);
    return { ...d, x: r1(a0.x + s.ux * t), y: r1(a0.y + s.uy * t) };
  }
  const r = (plan.rooms || []).find((q) => q.id === d.roomId);
  if (!r) return d;
  const W = roomWall(r, d.wall);
  const t = (x - W.a.x) * W.ux + (y - W.a.y) * W.uy;
  return clampDoor({ ...d, offsetFt: inch(t - d.widthFt / 2) }, r);
}

// A room changed from `from` to `to` (moved, resized, swapped, or turned a quarter clockwise):
// its doors stay on the same wall. Moving: nothing to do (doors are kept relative to the room).
// Resizing: a door keeps its spot on the plan while it still fits, else slides to fit.
// Turning: each door goes round with the room (top wall -> right wall, and so on).
export function doorsAfterRoomMove(doors, from, to, { turn = false } = {}) {
  if (!from || !to) return doors;
  return (doors || []).map((d) => {
    if (d.roomId !== from.id) return d;
    if (turn) {
      const wall = { n: 'e', e: 's', s: 'w', w: 'n' }[d.wall];
      const len0 = wallLen(from, d.wall);
      const flip = d.wall === 'e' || d.wall === 'w'; // these walls' start ends up at the far end
      const offsetFt = flip ? len0 - d.offsetFt - d.widthFt : d.offsetFt;
      const hinge = flip ? (d.hinge === 'end' ? 'start' : 'end') : d.hinge || 'start';
      return clampDoor({ ...d, wall, offsetFt: inch(offsetFt), hinge }, to);
    }
    if (from.w === to.w && from.h === to.h) return d; // moved: doors go along as they are
    // resized: along this wall, the end that stayed put keeps the door where it was on the plan
    const along = d.wall === 'n' || d.wall === 's' ? ['x', 'w'] : ['y', 'h'];
    const s0 = from[along[0]], e0 = s0 + from[along[1]], s1 = to[along[0]], e1 = s1 + to[along[1]];
    let offsetFt;
    if (Math.abs(s0 - s1) < 1e-9) offsetFt = d.offsetFt;
    else if (Math.abs(e0 - e1) < 1e-9) offsetFt = d.offsetFt + (s0 - s1);
    else { const mid = (d.offsetFt + d.widthFt / 2) / (from[along[1]] || 1); offsetFt = mid * to[along[1]] - d.widthFt / 2; } // traded places: same spot along the wall
    return clampDoor({ ...d, offsetFt: inch(offsetFt) }, to);
  });
}

// Doors of the rooms that are left (a deleted room takes its doors with it).
export const doorsOfRooms = (doors, rooms) => (doors || []).filter((d) => d.roomId === 'outline' || rooms.some((r) => r.id === d.roomId));

// ---- drawing (SVG, in feet; px = screen px -> ft)
const pt = (p) => `${r3(p.x)} ${r3(p.y)}`;
const r3 = (v) => Math.round(v * 1000) / 1000;
function leaf(h, o, nx, ny, w) {
  // hinge h, closed end o, opens to the n side: the door drawn open (90°) + its swing arc
  const tip = { x: h.x + nx * w, y: h.y + ny * w };
  const cross = (tip.x - h.x) * (o.y - h.y) - (tip.y - h.y) * (o.x - h.x);
  return `<path class="dr-leaf" d="M${pt(h)}L${pt(tip)}"/><path class="dr-arc" d="M${pt(tip)}A${r3(w)} ${r3(w)} 0 0 ${cross > 0 ? 1 : 0} ${pt(o)}"/>`;
}
// One door as SVG: the gap in the wall, the jambs, and the door leaf with its quarter-circle
// swing (two for a double door), a plain gap for an opening, a thin double line for a window.
export function doorSvg(s, px, { sel = false } = {}) {
  const sgn = s.swing === 'out' ? -1 : 1, nx = s.nx * sgn, ny = s.ny * sgn;
  const j = px(6); // jamb tick, each side of the wall
  const jamb = (p) => `<path class="dr-jamb" d="M${pt({ x: p.x - s.nx * j, y: p.y - s.ny * j })}L${pt({ x: p.x + s.nx * j, y: p.y + s.ny * j })}"/>`;
  let g = `<path class="dr-gap" d="M${pt(s.a)}L${pt(s.b)}" stroke-width="${r3(px(sel ? 9 : 7))}"/>${jamb(s.a)}${jamb(s.b)}`;
  if (s.kind === 'window') {
    const o = px(2.4);
    for (const k of [-1, 1]) g += `<path class="dr-win" d="M${pt({ x: s.a.x + s.nx * o * k, y: s.a.y + s.ny * o * k })}L${pt({ x: s.b.x + s.nx * o * k, y: s.b.y + s.ny * o * k })}"/>`;
  } else if (s.kind === 'double') {
    const m = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
    g += leaf(s.a, m, nx, ny, s.w / 2) + leaf(s.b, m, nx, ny, s.w / 2);
  } else if (s.kind !== 'opening') {
    const [h, o] = s.hinge === 'end' ? [s.b, s.a] : [s.a, s.b];
    g += leaf(h, o, nx, ny, s.w);
  }
  return g;
}
