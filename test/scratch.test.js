import test from 'node:test';
import assert from 'node:assert/strict';
import { planOf, planToSave, outlineFromRooms, withAutoOutline, growArea, clearPlan, planHasDrawing, polyArea, roomsOutside, shapeOf } from '../src/lib/floorplan.js';

const R = (id, x, y, w, h, name = id) => ({ id, name, x, y, w, h });
// corners as [x, y], starting at the top-left-most corner (the walk can start anywhere)
const xy = (pts) => {
  const a = pts.map((p) => [p.x, p.y]);
  let k = 0;
  a.forEach((p, i) => { if (p[1] < a[k][1] || (p[1] === a[k][1] && p[0] < a[k][0])) k = i; });
  return [...a.slice(k), ...a.slice(0, k)];
};

test('rooms -> outline: one room is its rectangle (clockwise)', () => {
  const o = outlineFromRooms([R('a', 2, 3, 10, 8)]);
  assert.deepEqual(xy(o), [[2, 3], [12, 3], [12, 11], [2, 11]]);
  assert.ok(polyArea(o) > 0, 'clockwise on screen');
});

test('rooms -> outline: side-by-side rooms make one box (shared wall gone)', () => {
  assert.deepEqual(xy(outlineFromRooms([R('a', 0, 0, 10, 10), R('b', 10, 0, 6, 10)])), [[0, 0], [16, 0], [16, 10], [0, 10]]);
});

test('rooms -> outline: L shape (house + garage)', () => {
  const rooms = [R('garage', 0, 0, 22, 24), R('house', 22, 0, 38, 46)];
  assert.deepEqual(xy(outlineFromRooms(rooms)), [[0, 0], [60, 0], [60, 46], [22, 46], [22, 24], [0, 24]]);
});

test('rooms -> outline: T shape', () => {
  const rooms = [R('top', 0, 0, 30, 10), R('stem', 10, 10, 10, 20)];
  assert.deepEqual(xy(outlineFromRooms(rooms)), [[0, 0], [30, 0], [30, 10], [20, 10], [20, 30], [10, 30], [10, 10], [0, 10]]);
});

test('rooms -> outline: U shape keeps its notch (wider than the gap)', () => {
  const rooms = [R('left', 0, 0, 10, 30), R('bottom', 10, 20, 10, 10), R('right', 20, 0, 10, 30)];
  assert.deepEqual(xy(outlineFromRooms(rooms)), [[0, 0], [10, 0], [10, 20], [20, 20], [20, 0], [30, 0], [30, 30], [0, 30]]);
});

test('rooms -> outline: rooms touching only at a corner are joined', () => {
  const o = outlineFromRooms([R('a', 0, 0, 10, 10), R('b', 10, 10, 10, 10)]);
  assert.ok(o.length >= 6);
  assert.equal(roomsOutside([R('a', 0, 0, 10, 10), R('b', 10, 10, 10, 10)], o).size, 0, 'both rooms inside');
});

test('rooms -> outline: small gaps (1-2 ft) snap closed, bigger gaps do not', () => {
  const box = [[0, 0], [22, 0], [22, 10], [0, 10]];
  assert.deepEqual(xy(outlineFromRooms([R('a', 0, 0, 10, 10), R('b', 11, 0, 11, 10)])), box, '1 ft gap');
  assert.deepEqual(xy(outlineFromRooms([R('a', 0, 0, 10, 10), R('b', 12, 0, 10, 10)])), box, '2 ft gap');
  // 6 ft apart: the bigger block is the house
  assert.deepEqual(xy(outlineFromRooms([R('a', 0, 0, 10, 10), R('b', 16, 0, 12, 10)])), [[16, 0], [28, 0], [28, 10], [16, 10]]);
  // gap: 0 = no closing
  const two = outlineFromRooms([R('a', 0, 0, 10, 10), R('b', 11, 0, 12, 10)], { gap: 0 });
  assert.deepEqual(xy(two), [[11, 0], [23, 0], [23, 10], [11, 10]]);
});

test('rooms -> outline: small gap between an L of rooms', () => {
  // living room, kitchen 1 ft lower, a bedroom wing 1 ft to the right: one L
  const rooms = [R('living', 0, 0, 20, 14), R('kitchen', 0, 15, 20, 10), R('bed', 21, 0, 12, 12)];
  assert.deepEqual(xy(outlineFromRooms(rooms)), [[0, 0], [33, 0], [33, 12], [20, 12], [20, 25], [0, 25]]);
});

test('rooms -> outline: overlapping rooms and a hole inside (courtyard filled)', () => {
  assert.deepEqual(xy(outlineFromRooms([R('a', 0, 0, 12, 10), R('b', 8, 4, 10, 10)])), [[0, 0], [12, 0], [12, 4], [18, 4], [18, 14], [8, 14], [8, 10], [0, 10]]);
  const ring = [R('n', 0, 0, 30, 6), R('s', 0, 24, 30, 6), R('w', 0, 6, 6, 18), R('e', 24, 6, 6, 18)];
  assert.deepEqual(xy(outlineFromRooms(ring)), [[0, 0], [30, 0], [30, 30], [0, 30]]);
});

test('rooms -> outline: nothing to draw around', () => {
  assert.deepEqual(outlineFromRooms([]), []);
  assert.deepEqual(outlineFromRooms(null), []);
});

test('Auto outline: follows the rooms, is saved and loads back; off keeps the last outline', () => {
  const home = { type: 'house', floorplan: { w: 60, h: 50, autoOutline: true, rooms: [R('a', 0, 0, 20, 20), R('b', 20, 0, 10, 10)] } };
  let p = withAutoOutline(planOf(home));
  assert.deepEqual(xy(p.outlinePts), [[0, 0], [30, 0], [30, 10], [20, 10], [20, 20], [0, 20]]);
  const saved = planToSave(p);
  assert.equal(saved.autoOutline, true);
  assert.equal(saved.outlinePts.length, 6);
  // move room b down: outline follows
  p = withAutoOutline({ ...p, rooms: [p.rooms[0], { ...p.rooms[1], y: 10 }] });
  assert.deepEqual(xy(p.outlinePts), [[0, 0], [20, 0], [20, 10], [30, 10], [30, 20], [0, 20]]);
  // turn it off: the outline stays as it was
  const off = { ...p, autoOutline: false };
  const moved = withAutoOutline({ ...off, rooms: [off.rooms[0]] });
  assert.deepEqual(moved.outlinePts, p.outlinePts);
  assert.equal(planToSave(off).autoOutline, undefined);
  // no rooms: no outline
  assert.equal(withAutoOutline({ ...p, rooms: [] }).outlinePts, null);
});

test('old plans load unchanged (no autoOutline field added on save)', () => {
  const fp = { w: 16, h: 76, rooms: [R('a', 0, 0, 16, 10)] };
  const p = planOf({ type: 'mobile', floorplan: fp });
  assert.equal(p.autoOutline, false);
  assert.deepEqual(planToSave(p), fp);
  assert.equal(withAutoOutline(p), p);
});

test('growArea: room at the edge makes room to grow, otherwise unchanged', () => {
  const p = { w: 40, h: 30, rooms: [R('a', 0, 0, 10, 10)] };
  assert.equal(growArea(p), p);
  assert.deepEqual([growArea({ ...p, rooms: [R('a', 30, 22, 10, 8)] }).w, growArea({ ...p, rooms: [R('a', 30, 22, 10, 8)] }).h], [48, 38]);
  assert.equal(growArea({ w: 199, h: 30, rooms: [R('a', 189, 0, 10, 10)] }).w, 200);
});

test('Start from scratch clears rooms + outline on every floor; undo (saved copy) restores it', () => {
  const fp = { w: 40, h: 30, floors: [
    { id: 'f1', name: 'Floor 1', rooms: [R('a', 0, 0, 20, 15), R('b', 20, 0, 20, 15)], outlinePts: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 15 }, { x: 0, y: 15 }] },
    { id: 'f2', name: 'Floor 2', rooms: [R('c', 0, 0, 10, 10)] },
  ], photoId: 'ph1', photoOpacity: 0.5, photoRot: 0 };
  const home = { type: 'house', floorplan: fp };
  const p = planOf(home, 'f2');
  assert.equal(planHasDrawing(p), true);
  const undoCopy = planToSave(p);
  const c = clearPlan(p);
  assert.equal(planHasDrawing(c), false);
  assert.deepEqual(c.rooms, []);
  assert.equal(c.outlinePts, null);
  assert.equal(c.floor, 'f2');
  const s = planToSave(c);
  assert.deepEqual(s.floors.map((f) => [f.id, f.rooms.length, f.outlinePts]), [['f1', 0, undefined], ['f2', 0, undefined]]);
  assert.equal(s.photoId, 'ph1', 'photo kept');
  assert.equal(s.w, 40);
  // the cleared plan reloads empty, and drawn as the plain box
  const re = planOf({ ...home, floorplan: s }, 'f1');
  assert.deepEqual(re.rooms, []);
  assert.equal(re.outlinePts, null);
  assert.equal(shapeOf(re).length, 4);
  // undo: put the saved copy back -> exactly what was there
  const back = planOf({ ...home, floorplan: undoCopy }, 'f1');
  assert.deepEqual(back.rooms.map((r) => r.id), ['a', 'b']);
  assert.equal(back.outlinePts.length, 4);
  assert.deepEqual(planToSave(back), planToSave(planOf(home, 'f1')));
  // rooms first after a clear
  const rf = clearPlan(p, { autoOutline: true });
  assert.equal(planToSave(rf).autoOutline, true);
  // one-floor plan
  const one = clearPlan(planOf({ type: 'mobile', floorplan: { w: 16, h: 76, rooms: [R('a', 0, 0, 16, 10)], outline: 'rooms' } }));
  assert.deepEqual(planToSave(one), { w: 16, h: 76, rooms: [] });
});
