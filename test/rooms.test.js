import test from 'node:test';
import assert from 'node:assert/strict';
import { swapRooms, movePins, pinsInRoom, roomOfPin, mapPoint, resizeCorner, rotateRoom, overlapping, moveRoom, splitPlaced } from '../src/lib/floorplan.js';

const P = (rooms, w = 16, h = 76) => ({ w, h, rooms, floors: [{ id: 'f1', name: 'Floor 1', rooms }], floor: 'f1' });
const R = (id, x, y, w, h, name = id) => ({ id, name, x, y, w, h });

test('swapRooms: stacked neighbors swap order and keep their own size', () => {
  const a = R('master', 0, 0, 16, 14), b = R('daughter', 0, 14, 16, 10);
  const { a: a1, b: b1 } = swapRooms(a, b, P([a, b]));
  assert.deepEqual([b1.y, b1.h, a1.y, a1.h], [0, 10, 10, 14]);
  assert.equal(a1.w, 16);
  // the pair still fills exactly the same strip, no overlap
  assert.equal(overlapping([a1, b1]).size, 0);
  // and the other order gives the mirror result
  const r2 = swapRooms(b, a, P([a, b]));
  assert.deepEqual([r2.a.y, r2.b.y], [0, 10]);
});

test('swapRooms: side by side neighbors swap order', () => {
  const a = R('a', 0, 20, 6, 10), b = R('b', 6, 20, 10, 10);
  const { a: a1, b: b1 } = swapRooms(a, b, P([a, b]));
  assert.deepEqual([b1.x, b1.w, a1.x, a1.w], [0, 10, 10, 6]);
});

test('swapRooms: far apart, same size = trade spots', () => {
  const a = R('a', 0, 0, 8, 8), b = R('b', 8, 60, 8, 8);
  const { a: a1, b: b1 } = swapRooms(a, b, P([a, b]));
  assert.deepEqual([a1.x, a1.y, b1.x, b1.y], [8, 60, 0, 0]);
});

test('swapRooms: keeps own size when it fits, else trades rectangles; stays in bounds', () => {
  // fits: plenty of space around
  const a = R('a', 0, 0, 6, 6), b = R('b', 0, 40, 8, 10);
  let r = swapRooms(a, b, P([a, b]));
  assert.deepEqual([r.a.x, r.a.y, r.a.w, r.a.h], [0, 40, 6, 6]);
  assert.deepEqual([r.b.x, r.b.y, r.b.w, r.b.h], [0, 0, 8, 10]);
  // doesn't fit: b at a's corner would hang off the outline -> trade rectangles
  const c = R('c', 12, 70, 4, 6), d = R('d', 0, 0, 10, 10);
  r = swapRooms(c, d, P([c, d]));
  assert.deepEqual([r.a.x, r.a.y, r.a.w, r.a.h], [0, 0, 10, 10]);
  assert.deepEqual([r.b.x, r.b.y, r.b.w, r.b.h], [12, 70, 4, 6]);
  for (const x of [r.a, r.b]) assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.w <= 16 && x.y + x.h <= 76);
  // would land on top of a third room -> trade rectangles
  const e = R('e', 0, 0, 16, 12), f = R('f', 0, 30, 16, 6), g = R('g', 0, 36, 16, 10);
  r = swapRooms(e, f, P([e, f, g]));
  assert.deepEqual([r.a.y, r.a.h, r.b.y, r.b.h], [30, 6, 0, 12]);
});

test('roomOfPin: shared wall goes to the room named like the plug, else the smaller', () => {
  const k = R('k', 0, 30, 16, 14, 'Kitchen'), l = R('l', 0, 44, 16, 20, 'Living room');
  const plan = P([k, l]);
  assert.equal(roomOfPin(plan, { pos: { x: 8, y: 44 }, room: 'Living room' }).id, 'l');
  assert.equal(roomOfPin(plan, { pos: { x: 8, y: 44 }, room: '' }).id, 'k');
  assert.equal(roomOfPin(plan, { pos: { x: 8, y: 70 } }), null);
});

test('movePins: pins move with their room (same spot on the same wall)', () => {
  const k = R('k', 0, 30, 16, 14, 'Kitchen'), l = R('l', 0, 44, 16, 20, 'Living room');
  const plan = P([k, l]);
  const devs = [
    { id: 'fridge', room: 'Kitchen', pos: { x: 16, y: 33 } },
    { id: 'tv', room: 'Living room', pos: { x: 0, y: 50 } },
    { id: 'shared', room: 'Kitchen', pos: { x: 8, y: 44 } },
    { id: 'loose', room: '' },
  ];
  assert.deepEqual(pinsInRoom(plan, k, devs).sort(), ['fridge', 'shared']);
  const k1 = moveRoom(k, 0, -20, plan);
  const out = movePins(plan, devs, [{ from: k, to: k1 }]);
  assert.deepEqual(out, { fridge: { x: 16, y: 13 }, shared: { x: 8, y: 24 } });
  // resized room: pins stay inside, on the same walls
  const big = { ...k, h: 28 };
  const o2 = movePins(plan, devs, [{ from: k, to: big }]);
  assert.deepEqual(o2.fridge, { x: 16, y: 36 });
  assert.equal(o2.shared.y, 58);
  // no change = nothing to save
  assert.deepEqual(movePins(plan, devs, [{ from: k, to: { ...k } }]), {});
});

test('movePins on a swap: each room takes its own pins', () => {
  const a = R('a', 0, 0, 16, 14, 'Master'), b = R('b', 0, 14, 16, 10, 'Daughter');
  const plan = P([a, b]);
  const devs = [{ id: 'm1', room: 'Master', pos: { x: 0, y: 7 } }, { id: 'd1', room: 'Daughter', pos: { x: 16, y: 19 } }];
  const { a: a1, b: b1 } = swapRooms(a, b, plan);
  const out = movePins(plan, devs, [{ from: a, to: a1 }, { from: b, to: b1 }]);
  assert.deepEqual(out.m1, { x: 0, y: 17 });
  assert.deepEqual(out.d1, { x: 16, y: 5 });
  // pins of an upper floor keep their floor
  assert.deepEqual(mapPoint({ x: 1, y: 1, floor: 'f2' }, R('z', 0, 0, 2, 2), R('z', 4, 4, 2, 2), plan), { x: 5, y: 5, floor: 'f2' });
});

test('mapPoint stays in bounds; turning a room turns its pins', () => {
  const plan = P([]);
  assert.deepEqual(mapPoint({ x: 10, y: 10 }, R('r', 0, 0, 10, 10), R('r', 12, 72, 10, 10), plan), { x: 16, y: 76 });
  const r = R('r', 0, 0, 10, 4);
  const t = rotateRoom(r, plan);
  assert.deepEqual([t.w, t.h], [4, 10]);
  // top-left corner of a turned (clockwise) room ends up top-right
  const p = mapPoint({ x: 0, y: 0 }, r, t, plan, { turn: true });
  assert.deepEqual(p, { x: t.x + t.w, y: t.y });
});

test('rotateRoom stays in bounds and snapped', () => {
  const plan = P([]);
  const t = rotateRoom(R('r', 0, 70, 16, 6), plan);
  assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= 16 && t.y + t.h <= 76);
  assert.deepEqual([t.w, t.h], [6, 16]);
  assert.ok(Number.isInteger(t.x) && Number.isInteger(t.y));
  const wide = rotateRoom(R('r', 0, 0, 4, 30), plan);
  assert.equal(wide.w, 16, 'longer than the house is wide: clipped to the outline');
});

test('resizeCorner: any corner, opposite corner fixed, 1-ft snap, min 3 ft, in bounds', () => {
  const plan = P([]);
  const r = R('r', 4, 10, 8, 8);
  assert.deepEqual(resizeCorner(r, 'se', 2.4, 1.6, plan), { ...r, w: 10, h: 10 });
  assert.deepEqual(resizeCorner(r, 'nw', -2.2, -3, plan), { ...r, x: 2, y: 7, w: 10, h: 11 });
  assert.deepEqual(resizeCorner(r, 'ne', 99, 0, plan), { ...r, w: 12 }, 'stops at the outline');
  assert.deepEqual(resizeCorner(r, 'sw', 50, 0, plan), { ...r, x: 9, w: 3 }, 'min 3 ft');
  assert.deepEqual(resizeCorner(r, 'nw', -99, -99, plan), { ...r, x: 0, y: 0, w: 12, h: 18 });
});

test('overlapping: touching walls are fine, real overlap is flagged', () => {
  assert.equal(overlapping([R('a', 0, 0, 8, 8), R('b', 8, 0, 8, 8), R('c', 0, 8, 8, 8)]).size, 0);
  assert.deepEqual([...overlapping([R('a', 0, 0, 8, 8), R('b', 7, 7, 4, 4), R('c', 20, 20, 2, 2)])].sort(), ['a', 'b']);
});

test('moved pins stay on the plan (splitPlaced still sees them)', () => {
  const k = R('k', 0, 60, 16, 16, 'Kitchen');
  const plan = P([k]);
  const devs = [{ id: 'p', room: 'Kitchen', pos: { x: 16, y: 76 } }];
  const k1 = moveRoom(k, 0, 99, plan);
  assert.deepEqual(k1, k, 'already at the end');
  const k2 = moveRoom(k, 0, -60, plan);
  const out = movePins(plan, devs, [{ from: k, to: k2 }]);
  const moved = devs.map((d) => ({ ...d, pos: out[d.id] }));
  assert.equal(splitPlaced(moved, plan).placed.length, 1);
  assert.deepEqual(out.p, { x: 16, y: 16 });
});
