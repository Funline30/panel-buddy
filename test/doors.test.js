import test from 'node:test';
import assert from 'node:assert/strict';
import { planOf, planToSave, parseFtIn, fmtFtIn, ftInParts, setRoomSize, clampRoom, moveRoom, rotateRoom, resizeCorner, snapToRooms, outlineFromRooms, clearPlan, planHasDrawing } from '../src/lib/floorplan.js';
import { placeDoor, doorSpot, slideDoor, doorSeg, clampDoor, doorsAfterRoomMove, dedupeDoors, planDoorSegs, doorsOfRooms, doorSvg } from '../src/lib/doors.js';

const R = (id, x, y, w, h, name = id) => ({ id, name, x, y, w, h });
const P = (rooms, extra = {}) => ({ w: 40, h: 30, floors: [{ id: 'f1', name: 'Floor 1', rooms }], floor: 'f1', rooms, outline: 'box', outlinePts: null, doors: [], ...extra });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} != ${b}`);

test('feet + inches: parsing', () => {
  near(parseFtIn(`12' 6"`), 12.5);
  near(parseFtIn(`12'6`), 12.5);
  near(parseFtIn('12 6'), 12.5);
  near(parseFtIn('12-6'), 12.5);
  near(parseFtIn('12ft 6in'), 12.5);
  near(parseFtIn('12 ft'), 12);
  near(parseFtIn('12.5'), 12.5);
  near(parseFtIn('14'), 14);
  near(parseFtIn(`14'`), 14);
  near(parseFtIn('150"'), 12.5);
  near(parseFtIn('6in'), 0.5);
  near(parseFtIn('12\u2019 7\u201d'), 12 + 7 / 12, 'curly quotes');
  near(parseFtIn(`2'8"`), 2 + 8 / 12);
  for (const bad of ['', 'abc', `12' 13"`, '0', '-3', null, undefined, `5' x`]) assert.equal(parseFtIn(bad), null, String(bad));
});

test('feet + inches: formatting and parts', () => {
  assert.equal(fmtFtIn(12.5), `12'6"`);
  assert.equal(fmtFtIn(14), `14'`);
  assert.equal(fmtFtIn(0.5), `6"`);
  assert.equal(fmtFtIn(2 + 8 / 12), `2'8"`);
  assert.equal(fmtFtIn(11.999), `12'`, 'rounds to the inch');
  assert.equal(fmtFtIn(parseFtIn(`9' 11"`)), `9'11"`);
  assert.deepEqual(ftInParts(12.5), { ft: 12, in: 6 });
  assert.deepEqual(ftInParts(3), { ft: 3, in: 0 });
});

test('typed room size: exact to the inch, top-left stays, saved and loaded back', () => {
  const p = P([R('k', 2, 3, 10, 10, 'Kitchen')]);
  const { room, plan } = setRoomSize(p.rooms[0], 12.5, 14, p);
  assert.deepEqual([room.x, room.y, room.w, room.h, room.measured], [2, 3, 12.5, 14, true]);
  assert.equal(plan, p, 'fits: same plan');
  const saved = planToSave({ ...p, rooms: [room] });
  assert.equal(saved.rooms[0].w, 12.5);
  assert.equal(saved.rooms[0].measured, true);
  const back = planOf({ floorplan: saved });
  assert.equal(back.rooms[0].w, 12.5, 'inches survive loading');
  near(planOf({ floorplan: { w: 40, h: 30, rooms: [R('a', 0, 0, 12 + 7 / 12, 10)] } }).rooms[0].w, 12 + 7 / 12);
  // too big for the drawing: the drawing grows
  const big = setRoomSize(p.rooms[0], 45, 10, p);
  assert.ok(big.plan.w >= 47 && big.room.w === 45);
  // dragging still moves in whole feet; a half-foot room stays on its half foot
  const half = { ...room, x: 2.5 };
  assert.equal(moveRoom(half, 1.4, 0, p).x, 3.5);
  assert.equal(clampRoom(R('z', 2.4, 3, 9.6, 8), p).x, 2, 'stray decimals still snap to the foot');
  // corner-drag resize lands on whole feet and replaces the typed size
  assert.equal(resizeCorner(room, 'se', 1.2, 0, p).w, 14, 'right wall snaps to the foot (2 + 12.5 + 1.2 -> 16)');
});

test('a dragged room clicks onto a typed neighbour\'s wall', () => {
  const a = R('a', 0, 0, 12.5, 10), b = R('b', 13, 0, 10, 10);
  const p = P([a, b]);
  assert.equal(snapToRooms(b, p.rooms, p).x, 12.5);
  assert.equal(snapToRooms(R('c', 20, 20, 5, 5), p.rooms, p).x, 20, 'far away: unchanged');
});

test('outline from rooms follows typed inches exactly', () => {
  const o = outlineFromRooms([R('a', 0, 0, 12.5, 10), R('b', 12.5, 0, 8, 14)]);
  const xs = [...new Set(o.map((q) => q.x))].sort((m, n) => m - n), ys = [...new Set(o.map((q) => q.y))].sort((m, n) => m - n);
  assert.deepEqual(xs, [0, 12.5, 20.5]);
  assert.deepEqual(ys, [0, 10, 14]);
});

test('doors: a tap near a wall puts a 3 ft door on it, centred and clamped', () => {
  const p = P([R('k', 0, 0, 12, 10)]);
  const d = placeDoor(p, 6, 0.4, { id: 'd1' });
  assert.deepEqual([d.roomId, d.wall, d.offsetFt, d.widthFt, d.swing, d.hinge, d.kind], ['k', 'n', 4.5, 3, 'in', 'start', 'door']);
  const end = placeDoor(p, 11.8, 9.9, { id: 'd2' }); // bottom-right corner: bottom wall wins (closest), pushed back on
  assert.equal(end.wall, 's');
  assert.equal(end.offsetFt, 9, 'the whole door stays on the wall');
  assert.equal(placeDoor(p, 6, 5), null, 'middle of the room: too far from a wall');
  const right = placeDoor(p, 11.7, 5, { id: 'd3' });
  assert.deepEqual([right.wall, right.offsetFt], ['e', 3.5]);
});

test('doors: shared wall goes to the room tapped in; outside door on the outline', () => {
  const p = P([R('a', 0, 0, 10, 10), R('b', 10, 0, 10, 10)]);
  assert.equal(doorSpot(p, 9.6, 5).roomId, 'a');
  assert.equal(doorSpot(p, 10.4, 5).roomId, 'b');
  const poly = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }];
  const ext = placeDoor(P([R('a', 0, 0, 10, 10)]), 20, 19.5, { poly, id: 'x' });
  assert.deepEqual([ext.roomId, ext.x, ext.y], ['outline', 20, 20]);
  const s = doorSeg(ext, P([]), poly);
  assert.ok(s.outside);
  assert.deepEqual([Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x), s.a.y], [18.5, 21.5, 20]);
  assert.equal(s.ny, -1, 'opens into the house (up)');
  assert.equal(Math.abs(s.nx), 0);
});

test('doors: sliding along the wall stays on the wall', () => {
  const p = P([R('k', 0, 0, 12, 10)]);
  const d = placeDoor(p, 6, 0, { id: 'd' });
  assert.equal(slideDoor(d, p, 3, 2).offsetFt, 1.5, 'middle follows the finger');
  assert.equal(slideDoor(d, p, -5, 0).offsetFt, 0, 'clamped at the start');
  assert.equal(slideDoor(d, p, 50, 0).offsetFt, 9, 'clamped at the end');
  const wide = clampDoor({ ...d, widthFt: 20 }, p.rooms[0]);
  assert.deepEqual([wide.widthFt, wide.offsetFt], [12, 0], 'never wider than the wall');
  const poly = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }];
  const ext = { id: 'x', roomId: 'outline', x: 20, y: 20, widthFt: 3 };
  assert.deepEqual(slideDoor(ext, p, 29.9, 25, poly), { ...ext, x: 28.5, y: 20 });
});

test('doors follow their room: move, resize, turn, delete', () => {
  const from = R('k', 0, 0, 12, 8);
  const d = { id: 'd', roomId: 'k', wall: 'n', offsetFt: 2, widthFt: 3, swing: 'in', hinge: 'start', kind: 'door' };
  const other = { id: 'o', roomId: 'z', wall: 's', offsetFt: 1, widthFt: 3 };
  const doors = [d, other];
  // moved: kept relative, so it is drawn moved
  const to = R('k', 5, 6, 12, 8);
  assert.deepEqual(doorsAfterRoomMove(doors, from, to), doors);
  const seg = doorSeg(d, P([to]));
  assert.deepEqual([seg.a.x, seg.a.y, seg.b.x], [7, 6, 10]);
  // resized from the left: the door keeps its spot on the plan
  const fromLeft = R('k', 1, 0, 11, 8);
  assert.equal(doorsAfterRoomMove(doors, from, fromLeft)[0].offsetFt, 1);
  // shrunk from the right past the door: it slides to fit
  assert.equal(doorsAfterRoomMove(doors, from, R('k', 0, 0, 4, 8))[0].offsetFt, 1);
  // turned a quarter clockwise: top wall -> right wall, same distance from the start
  const turned = rotateRoom(from, P([from]));
  const t1 = doorsAfterRoomMove(doors, from, turned, { turn: true });
  assert.deepEqual([t1[0].wall, t1[0].offsetFt, t1[0].hinge], ['e', 2, 'start']);
  assert.deepEqual(t1[1], other, 'other rooms\' doors untouched');
  // right wall -> bottom wall: measured from the other end, hinge flips
  const t2 = doorsAfterRoomMove(t1, turned, rotateRoom(turned, P([turned])), { turn: true });
  assert.deepEqual([t2[0].wall, t2[0].offsetFt, t2[0].hinge], ['s', 12 - 2 - 3, 'end']);
  // four turns = back where it started
  let r = from, ds = doors;
  for (let i = 0; i < 4; i++) { const n = rotateRoom(r, P([r])); ds = doorsAfterRoomMove(ds, r, n, { turn: true }); r = n; }
  assert.deepEqual([ds[0].wall, ds[0].offsetFt, ds[0].hinge], ['n', 2, 'start']);
  // the door's middle turns with the room (same spot as a plug would)
  const s0 = doorSeg(d, P([from])), s1 = doorSeg(t1[0], P([turned]));
  const mid = (s) => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 });
  const u = (mid(s0).x - from.x) / from.w, v = (mid(s0).y - from.y) / from.h;
  near(mid(s1).x, turned.x + (1 - v) * turned.w); near(mid(s1).y, turned.y + u * turned.h);
  // deleted room: its doors go too
  assert.deepEqual(doorsOfRooms(doors, [R('z', 0, 0, 5, 5)]), [other]);
});

test('a door on a shared wall shows once', () => {
  const p = P([R('a', 0, 0, 10, 10), R('b', 10, 0, 10, 10)]);
  p.doors = [
    { id: 'd1', roomId: 'a', wall: 'e', offsetFt: 3, widthFt: 3 },
    { id: 'd2', roomId: 'b', wall: 'w', offsetFt: 3.5, widthFt: 3 }, // same doorway, added from the other room
    { id: 'd3', roomId: 'b', wall: 'w', offsetFt: 7, widthFt: 2.5 }, // a different door further down
    { id: 'd4', roomId: 'a', wall: 'w', offsetFt: 3, widthFt: 3 }, // other wall
  ];
  assert.deepEqual(planDoorSegs(p).map((s) => s.id), ['d1', 'd3', 'd4']);
  assert.deepEqual(dedupeDoors([null]), []);
});

test('doors are saved per floor, old plans load with none, clear removes them', () => {
  assert.deepEqual(planOf({ floorplan: { w: 20, h: 20, rooms: [R('a', 0, 0, 10, 10)] } }).doors, []);
  assert.deepEqual(planOf({}).doors, []);
  const p = P([R('a', 0, 0, 10, 10)]);
  p.doors = [{ id: 'd', roomId: 'a', wall: 'n', offsetFt: 2, widthFt: 3, kind: 'door', swing: 'out', hinge: 'end' }, { id: 'x', roomId: 'outline', x: 5, y: 0, widthFt: 3, kind: 'window' }];
  const saved = planToSave(p);
  assert.equal(saved.doors.length, 2);
  assert.ok(!('doors' in planToSave(P([R('a', 0, 0, 10, 10)]))), 'no doors: nothing extra saved');
  const back = planOf({ floorplan: saved });
  assert.deepEqual(back.doors, p.doors);
  // a door whose room is gone is dropped on load
  assert.deepEqual(planOf({ floorplan: { ...saved, rooms: [] } }).doors.map((d) => d.id), ['x']);
  // two floors: each keeps its own
  const two = planToSave({ ...p, floors: [{ id: 'f1', name: 'Floor 1', rooms: p.rooms }, { id: 'f2', name: 'Floor 2', rooms: [], doors: [] }] });
  assert.equal(two.floors[0].doors.length, 2);
  assert.ok(!('doors' in two.floors[1]));
  assert.ok(planHasDrawing({ ...P([]), doors: [p.doors[1]] }));
  assert.deepEqual(clearPlan(p).doors, []);
});

test('door drawing: gap, jambs, leaf + swing arc; double; opening; window', () => {
  const px = (n) => n / 16;
  const p = P([R('k', 0, 0, 12, 10)]);
  const base = { id: 'd', roomId: 'k', wall: 'n', offsetFt: 2, widthFt: 3 };
  const svg = doorSvg(doorSeg({ ...base, kind: 'door' }, p), px);
  assert.match(svg, /dr-gap/); assert.match(svg, /dr-leaf/); assert.match(svg, /A3 3 0 0 [01] 5 0/);
  assert.match(svg, /M2 0L2 3/, 'opens into the room (down) from the hinge at the start');
  assert.match(doorSvg(doorSeg({ ...base, swing: 'out' }, p), px), /M2 0L2 -3/, 'opens out (up)');
  assert.match(doorSvg(doorSeg({ ...base, hinge: 'end' }, p), px), /M5 0L5 3/, 'hinge at the other end');
  assert.equal((doorSvg(doorSeg({ ...base, kind: 'double', widthFt: 5 }, p), px).match(/dr-arc/g) || []).length, 2);
  const op = doorSvg(doorSeg({ ...base, kind: 'opening' }, p), px);
  assert.ok(!/dr-leaf|dr-arc/.test(op) && /dr-gap/.test(op));
  assert.equal((doorSvg(doorSeg({ ...base, kind: 'window' }, p), px).match(/dr-win/g) || []).length, 2);
});
