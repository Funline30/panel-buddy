// Open walls ("no wall here"): stretches of a room's wall that aren't really there, like a
// kitchen open to the living room. The rooms stay separate rooms (names, circuits, plugs);
// the missing stretch is drawn as a faint dashed line. Optional data, saved per floor beside
// the rooms and doors:
//   home.floorplan.openWalls = [ow]   (2+ floors: floors[i].openWalls)
//   ow = { id, roomId, wall: 'n'|'e'|'s'|'w', fromFt, toFt }
//     roomId / wall  the room and side it's on (like doors); it moves / turns with that room
//     fromFt, toFt   the open stretch, measured from the wall's start (left end of n / s, top
//                    end of e / w), so one side can have several open sections
// A shared wall (two rooms touching) is one wall: a section saved on either room opens it for
// both. Old plans have no openWalls and load unchanged.
import { roomWall, wallLen, doorSeg } from './doors.js';

export const SIDES = ['n', 'e', 's', 'w'];
export const SIDE_WORDS = { n: 'Top', e: 'Right', s: 'Bottom', w: 'Left' };
export const WALL_SNAP = 1.2; // ft: how close a tap has to be to a wall
export const OPEN_STEP = 0.5; // ft: section ends snap to 6"
const LINE = 0.3; // ft: two walls this close (across) are the same wall
const MIN = 0.5; // ft: shortest open section kept
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r2 = (v) => Math.round(v * 100) / 100;
const inch = (v) => Math.round(v * 12) / 12;
const snapStep = (v, len) => {
  // to 6", but the wall's own ends (typed sizes can be 12' 7") stay reachable
  if (Math.abs(v) < OPEN_STEP / 2) return 0;
  if (Math.abs(len - v) < OPEN_STEP / 2) return r2(len);
  return Math.round(v / OPEN_STEP) * OPEN_STEP;
};

// One section in plan feet -> { id, roomId, wall, a, b, ux, uy, from, to, len } or null.
export function openSeg(o, rooms) {
  const r = (rooms || []).find((q) => q.id === o.roomId);
  if (!r || !SIDES.includes(o.wall)) return null;
  const W = roomWall(r, o.wall);
  const from = clamp(Math.min(o.fromFt, o.toFt), 0, W.len), to = clamp(Math.max(o.fromFt, o.toFt), 0, W.len);
  if (to - from < 0.05) return null;
  return { id: o.id, roomId: r.id, wall: o.wall, from, to, len: W.len, ux: W.ux, uy: W.uy, a: { x: W.a.x + W.ux * from, y: W.a.y + W.uy * from }, b: { x: W.a.x + W.ux * to, y: W.a.y + W.uy * to } };
}
export const planOpenSegs = (plan) => (plan.openWalls || []).map((o) => openSeg(o, plan.rooms)).filter(Boolean);

// Where a plan segment (a..b) falls on a room wall -> [t0, t1] along it, or null (not on it).
function onWall(seg, W) {
  if (Math.abs(seg.ux * W.uy - seg.uy * W.ux) > 1e-6) return null; // not parallel
  const across = Math.abs((seg.a.x - W.a.x) * W.uy - (seg.a.y - W.a.y) * W.ux);
  if (across > LINE) return null;
  const t = (p) => (p.x - W.a.x) * W.ux + (p.y - W.a.y) * W.uy;
  const t0 = clamp(Math.min(t(seg.a), t(seg.b)), 0, W.len), t1 = clamp(Math.max(t(seg.a), t(seg.b)), 0, W.len);
  return t1 - t0 > 0.05 ? [t0, t1] : null;
}
const merge = (list) => {
  const s = [...list].sort((p, q) => p[0] - q[0]), out = [];
  for (const iv of s) { const last = out[out.length - 1]; if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1]); else out.push([...iv]); }
  return out;
};

// A room side split into what's open (any section on this wall line, from any room) and what's
// solid -> { len, open: [[t0, t1]], solid: [[t0, t1]] } (feet along the wall).
export function wallParts(plan, room, wall, segs = planOpenSegs(plan)) {
  const W = roomWall(room, wall);
  const open = merge(segs.map((s) => onWall(s, W)).filter(Boolean));
  const solid = [];
  let at = 0;
  for (const [a, b] of open) { if (a - at > 0.05) solid.push([at, a]); at = Math.max(at, b); }
  if (W.len - at > 0.05) solid.push([at, W.len]);
  return { len: W.len, open, solid };
}
// 'open' (the whole side), 'part' (some of it) or 'wall' (all there).
export function sideState(plan, room, wall, segs) {
  const p = wallParts(plan, room, wall, segs);
  if (!p.open.length) return 'wall';
  return p.solid.length ? 'part' : 'open';
}

// The room wall closest to a tap (within max ft) -> { room, wall, t, len } or null. On a wall
// two rooms share, the room the tap is in wins.
export function wallAt(plan, x, y, { max = WALL_SNAP, rooms = plan.rooms } = {}) {
  let best = null;
  for (const r of rooms || []) {
    const inside = x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
    for (const wall of SIDES) {
      const W = roomWall(r, wall);
      const t = clamp((x - W.a.x) * W.ux + (y - W.a.y) * W.uy, 0, W.len);
      const dist = Math.hypot(x - (W.a.x + W.ux * t), y - (W.a.y + W.uy * t));
      if (dist > max) continue;
      const score = dist - (inside ? 0.01 : 0);
      if (!best || score < best.score) best = { score, room: r, wall, t, len: W.len };
    }
  }
  return best && { room: best.room, wall: best.wall, t: best.t, len: best.len };
}

// The stretch of this room's wall that another room's wall lies on, around t -> { t0, t1, other }
// or null (nobody on the other side there).
export function sharedSpan(plan, room, wall, t) {
  const W = roomWall(room, wall);
  const opp = { n: 's', s: 'n', e: 'w', w: 'e' }[wall];
  for (const o of plan.rooms || []) {
    if (o.id === room.id) continue;
    const O = roomWall(o, opp);
    const iv = onWall({ a: O.a, b: { x: O.a.x + O.ux * O.len, y: O.a.y + O.uy * O.len }, ux: O.ux, uy: O.uy }, W);
    if (iv && t >= iv[0] - 1e-6 && t <= iv[1] + 1e-6) return { t0: iv[0], t1: iv[1], other: o };
  }
  return null;
}

// The open section under a tap (any room's, on that wall line) -> the section, or null.
export function openAt(plan, x, y, { max = WALL_SNAP, segs = planOpenSegs(plan) } = {}) {
  let best = null;
  for (const s of segs) {
    const t = (x - s.a.x) * s.ux + (y - s.a.y) * s.uy, L = s.to - s.from;
    if (t < -0.3 || t > L + 0.3) continue;
    const tt = clamp(t, 0, L);
    const dist = Math.hypot(x - (s.a.x + s.ux * tt), y - (s.a.y + s.uy * tt));
    if (dist <= max && (!best || dist < best.dist)) best = { dist, s };
  }
  return best ? (plan.openWalls || []).find((o) => o.id === best.s.id) || null : null;
}

// Tap a solid wall -> a new open section: the part two rooms share when the tap is on a shared
// wall (only that part, not the rest of the side), else the whole side, minus whatever is already
// open (a side with an open section gets the solid piece that was tapped).
// -> { section, list } or null (no wall there / nothing left to open).
export function openWallAt(plan, x, y, { id, max = WALL_SNAP } = {}) {
  const hit = wallAt(plan, x, y, { max });
  if (!hit) return null;
  const sh = sharedSpan(plan, hit.room, hit.wall, hit.t);
  let t0 = sh ? sh.t0 : 0, t1 = sh ? sh.t1 : hit.len;
  const parts = wallParts(plan, hit.room, hit.wall);
  const piece = parts.solid.find(([a, b]) => hit.t >= a - 0.05 && hit.t <= b + 0.05);
  if (!piece) return null;
  t0 = Math.max(t0, piece[0]); t1 = Math.min(t1, piece[1]);
  if (t1 - t0 < 0.05) return null;
  const section = { id: id || 'ow' + Math.random().toString(36).slice(2, 8), roomId: hit.room.id, wall: hit.wall, fromFt: r2(t0), toFt: r2(t1) };
  return { section, list: [...(plan.openWalls || []), section], shared: sh ? sh.other : null, room: hit.room };
}

// Put the wall back: drop the section (and any other room's section on the same stretch, so a
// shared wall comes back for both rooms).
export function closeWall(plan, sectionId) {
  const list = plan.openWalls || [];
  const s = openSeg(list.find((o) => o.id === sectionId) || {}, plan.rooms);
  if (!s) return list.filter((o) => o.id !== sectionId);
  return list.filter((o) => {
    if (o.id === sectionId) return false;
    const q = openSeg(o, plan.rooms);
    if (!q || Math.abs(q.ux * s.uy - q.uy * s.ux) > 1e-6) return true;
    const across = Math.abs((q.a.x - s.a.x) * s.uy - (q.a.y - s.a.y) * s.ux);
    if (across > LINE) return true;
    const t = (p) => (p.x - s.a.x) * s.ux + (p.y - s.a.y) * s.uy;
    const lo = Math.min(t(q.a), t(q.b)), hi = Math.max(t(q.a), t(q.b));
    return Math.min(hi, s.to - s.from) - Math.max(lo, 0) <= 0.05; // overlaps: same opening, goes too
  });
}

// Room sheet toggles: a whole side open (true) or all there (false). Putting a side back also
// puts back other rooms' sections on that stretch (it's one wall).
export function setSideOpen(plan, roomId, wall, open, { id } = {}) {
  const room = (plan.rooms || []).find((r) => r.id === roomId);
  if (!room) return plan.openWalls || [];
  const W = roomWall(room, wall);
  const full = { a: W.a, b: { x: W.a.x + W.ux * W.len, y: W.a.y + W.uy * W.len }, ux: W.ux, uy: W.uy };
  const keep = (plan.openWalls || []).filter((o) => {
    if (o.roomId === roomId && o.wall === wall) return false;
    if (open) return true;
    const q = openSeg(o, plan.rooms);
    return !q || !onWall(q, W);
  });
  void full;
  return open ? [...keep, { id: id || 'ow' + Math.random().toString(36).slice(2, 8), roomId, wall, fromFt: 0, toFt: r2(W.len) }] : keep;
}

// Drag one end of a section along its wall (snaps to 6"; never shorter than 6", never past the
// wall's ends or into the next open section). end: 'from' | 'to'. -> the section.
export function moveOpenEnd(o, plan, end, x, y) {
  const r = (plan.rooms || []).find((q) => q.id === o.roomId);
  if (!r) return o;
  const W = roomWall(r, o.wall);
  let t = snapStep(clamp((x - W.a.x) * W.ux + (y - W.a.y) * W.uy, 0, W.len), W.len);
  // the other sections of this side are walls in the way
  const others = (plan.openWalls || []).filter((q) => q.id !== o.id && q.roomId === o.roomId && q.wall === o.wall);
  if (end === 'from') {
    const lo = Math.max(0, ...others.map((q) => q.toFt).filter((v) => v <= o.fromFt + 1e-6));
    t = clamp(t, lo, o.toFt - MIN);
    return { ...o, fromFt: r2(t) };
  }
  const hi = Math.min(W.len, ...others.map((q) => q.fromFt).filter((v) => v >= o.toFt - 1e-6));
  t = clamp(t, o.fromFt + MIN, hi);
  return { ...o, toFt: r2(t) };
}
// Typed: from (ft) and length (ft) -> the section, kept on the wall.
export function setOpenSpan(o, plan, fromFt, lenFt) {
  const r = (plan.rooms || []).find((q) => q.id === o.roomId);
  if (!r) return o;
  const len = wallLen(r, o.wall);
  const f = clamp(inch(Number(fromFt) || 0), 0, Math.max(0, len - MIN));
  const l = clamp(inch(Number(lenFt) || 0), MIN, len - f);
  return { ...o, fromFt: r2(f), toFt: r2(f + l) };
}

// A room changed from `from` to `to` (moved, resized, swapped, turned a quarter clockwise):
// its open sections go with it, like doors.
export function openWallsAfterRoomMove(list, from, to, { turn = false } = {}) {
  if (!from || !to) return list;
  return (list || []).map((o) => {
    if (o.roomId !== from.id) return o;
    const len0 = wallLen(from, o.wall);
    if (turn) {
      const wall = { n: 'e', e: 's', s: 'w', w: 'n' }[o.wall];
      const flip = o.wall === 'e' || o.wall === 'w'; // these walls' start ends up at the far end
      const f = flip ? len0 - o.toFt : o.fromFt, t = flip ? len0 - o.fromFt : o.toFt;
      return fit({ ...o, wall, fromFt: f, toFt: t }, to);
    }
    if (from.w === to.w && from.h === to.h) return o;
    const along = o.wall === 'n' || o.wall === 's' ? ['x', 'w'] : ['y', 'h'];
    const s0 = from[along[0]], e0 = s0 + from[along[1]], s1 = to[along[0]], e1 = s1 + to[along[1]];
    let d = 0, k = 1;
    if (Math.abs(s0 - s1) < 1e-9) d = 0;
    else if (Math.abs(e0 - e1) < 1e-9) d = s0 - s1;
    else k = (to[along[1]] || 1) / (from[along[1]] || 1);
    const whole = o.fromFt <= 0.01 && o.toFt >= len0 - 0.01; // a whole open side stays whole
    if (whole) return fit({ ...o, fromFt: 0, toFt: wallLen(to, o.wall) }, to);
    return fit({ ...o, fromFt: o.fromFt * k + d, toFt: o.toFt * k + d }, to);
  }).filter(Boolean);
}
function fit(o, room) {
  const len = wallLen(room, o.wall);
  const f = clamp(o.fromFt, 0, len), t = clamp(o.toFt, 0, len);
  return t - f < 0.05 ? null : { ...o, fromFt: r2(f), toFt: r2(t) };
}

// Sections of the rooms that are left (a deleted room takes its sections with it).
export const openWallsOfRooms = (list, rooms) => (list || []).filter((o) => (rooms || []).some((r) => r.id === o.roomId));

// Saved data, checked (room gone or bad numbers = dropped).
export function okOpenWalls(list, rooms) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((o) => o && typeof o === 'object' && o.id && SIDES.includes(o.wall) && Number.isFinite(Number(o.fromFt)) && Number.isFinite(Number(o.toFt)) && (rooms || []).some((r) => r.id === o.roomId))
    .map((o) => ({ id: String(o.id), roomId: o.roomId, wall: o.wall, fromFt: r2(Math.min(Number(o.fromFt), Number(o.toFt))), toFt: r2(Math.max(Number(o.fromFt), Number(o.toFt))) }))
    .filter((o) => o.toFt - o.fromFt >= 0.05);
}

// Does a door (its drawn seg: a, b) sit on an open stretch? (overlap > 2")
export function segOnOpen(seg, segs) {
  if (!seg) return false;
  for (const s of segs) {
    const W = { a: s.a, ux: s.ux, uy: s.uy, len: s.to - s.from };
    const iv = onWall({ a: seg.a, b: seg.b, ux: seg.ux, uy: seg.uy }, W);
    if (iv && iv[1] - iv[0] > 0.17) return true;
  }
  return false;
}

// Doors / windows sitting on an open stretch -> their ids (a removed wall takes them off).
export function doorsOnOpen(doors, plan, poly = null, segs = planOpenSegs(plan)) {
  if (!segs.length) return [];
  return (doors || []).filter((d) => segOnOpen(doorSeg(d, plan, poly), segs)).map((d) => d.id);
}
