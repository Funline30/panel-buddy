import test from 'node:test';
import assert from 'node:assert/strict';
import { planOf, planToSave, rotateRoom, clearPlan, outlineFromRooms } from '../src/lib/floorplan.js';
import { placeDoor, doorSeg } from '../src/lib/doors.js';
import { openSeg, planOpenSegs, wallParts, sideState, wallAt, sharedSpan, openAt, openWallAt, closeWall, setSideOpen, moveOpenEnd, setOpenSpan, openWallsAfterRoomMove, openWallsOfRooms, okOpenWalls, segOnOpen, doorsOnOpen } from '../src/lib/walls.js';

const R = (id, x, y, w, h, name = id) => ({ id, name, x, y, w, h });
const P = (rooms, extra = {}) => ({ w: 40, h: 30, floors: [{ id: 'f1', name: 'Floor 1', rooms }], floor: 'f1', rooms, outline: 'box', outlinePts: null, doors: [], openWalls: [], ...extra });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} != ${b}`);
// kitchen 12 wide on top of a 20-wide living room: they share 12 ft of wall at y = 10
const kitchen = R('k', 0, 0, 12, 10, 'Kitchen');
const living = R('l', 0, 10, 20, 14, 'Living room');

test('open walls: tap a lone wall -> the whole side opens; tap the dashed line -> wall back', () => {
  const pl = P([R('a', 0, 0, 10, 8)]);
  const r = openWallAt(pl, 5, 0.2, { id: 'o1' });
  assert.deepEqual(r.section, { id: 'o1', roomId: 'a', wall: 'n', fromFt: 0, toFt: 10 });
  const pl2 = { ...pl, openWalls: r.list };
  assert.equal(sideState(pl2, pl.rooms[0], 'n'), 'open');
  assert.equal(sideState(pl2, pl.rooms[0], 's'), 'wall');
  const hit = openAt(pl2, 3, 0.4);
  assert.equal(hit.id, 'o1');
  assert.deepEqual(closeWall(pl2, 'o1'), []);
  assert.equal(openWallAt(pl, 5, 4), null, 'middle of the room is not a wall');
});

test('open walls: a shared wall opens only where the two rooms touch, once for both', () => {
  const pl = P([kitchen, living]);
  // tap the shared wall from the living-room side
  const r = openWallAt(pl, 6, 10.2, { id: 'o1' });
  assert.equal(r.section.roomId, 'l');
  assert.equal(r.section.wall, 'n');
  near(r.section.fromFt, 0); near(r.section.toFt, 12, 'only the 12 ft they share, not the 20 ft side');
  assert.equal(r.shared.id, 'k');
  const pl2 = { ...pl, openWalls: r.list };
  // the kitchen's bottom wall is open too (same wall), the living room's top is only part open
  assert.equal(sideState(pl2, kitchen, 's'), 'open');
  assert.equal(sideState(pl2, living, 'n'), 'part');
  assert.deepEqual(wallParts(pl2, living, 'n').solid, [[12, 20]]);
  // drawn once
  assert.equal(planOpenSegs(pl2).length, 1);
  // the kitchen's view: tapping the dashed line from the kitchen side picks the same section
  assert.equal(openAt(pl2, 6, 9.8).id, 'o1');
  // the rest of the living-room top wall (past the kitchen) is still a wall: tapping it opens that piece
  const r2 = openWallAt(pl2, 16, 10.1, { id: 'o2' });
  near(r2.section.fromFt, 12); near(r2.section.toFt, 20);
  // putting it back from the kitchen side (its own section on the same stretch) clears both
  const both = [...r.list, { id: 'o3', roomId: 'k', wall: 's', fromFt: 0, toFt: 12 }];
  assert.deepEqual(closeWall({ ...pl, openWalls: both }, 'o3'), []);
});

test('open walls: sections of a wall (partial), drag ends snap to 6", typed span', () => {
  const pl = P([R('a', 0, 0, 14, 10)]);
  const o = { id: 'o1', roomId: 'a', wall: 'n', fromFt: 0, toFt: 14 };
  const pl2 = { ...pl, openWalls: [o] };
  const a = moveOpenEnd(o, pl2, 'from', 4.2, 0);
  near(a.fromFt, 4); near(a.toFt, 14);
  const b = moveOpenEnd(a, { ...pl, openWalls: [a] }, 'to', 9.8, 3);
  near(b.toFt, 10);
  // never shorter than 6", never past the wall
  near(moveOpenEnd(b, pl2, 'from', 20, 0).fromFt, 9.5);
  near(moveOpenEnd(b, pl2, 'to', 50, 0).toFt, 14);
  const pl3 = { ...pl, openWalls: [b] };
  assert.equal(sideState(pl3, pl.rooms[0], 'n'), 'part');
  assert.deepEqual(wallParts(pl3, pl.rooms[0], 'n'), { len: 14, open: [[4, 10]], solid: [[0, 4], [10, 14]] });
  // a second section on the same side
  const r = openWallAt(pl3, 12, 0, { id: 'o2' });
  near(r.section.fromFt, 10); near(r.section.toFt, 14);
  // and an end can't be dragged into the next section
  const two = { ...pl, openWalls: [b, r.section] };
  near(moveOpenEnd(b, two, 'to', 13, 0).toFt, 10);
  // typed: from 2'6", open 5'
  const t = setOpenSpan(o, pl, 2.5, 5);
  near(t.fromFt, 2.5); near(t.toFt, 7.5);
  near(setOpenSpan(o, pl, 12, 30).toFt, 14, 'clamped to the wall');
});

test('open walls: room sheet side toggles', () => {
  const pl = P([kitchen, living]);
  const list = setSideOpen(pl, 'k', 's', true, { id: 'o1' });
  assert.deepEqual(list, [{ id: 'o1', roomId: 'k', wall: 's', fromFt: 0, toFt: 12 }]);
  // putting the living-room top back also puts back the kitchen's section on that stretch
  assert.deepEqual(setSideOpen({ ...pl, openWalls: list }, 'l', 'n', false), []);
  // an unrelated section stays
  const other = { id: 'o9', roomId: 'l', wall: 's', fromFt: 0, toFt: 5 };
  assert.deepEqual(setSideOpen({ ...pl, openWalls: [...list, other] }, 'k', 's', false), [other]);
});

test('open walls follow their room: move, resize, turn, delete', () => {
  const r0 = R('a', 0, 0, 10, 6);
  const list = [{ id: 'o1', roomId: 'a', wall: 'n', fromFt: 2, toFt: 5 }, { id: 'o2', roomId: 'a', wall: 'e', fromFt: 0, toFt: 6 }, { id: 'o3', roomId: 'b', wall: 'n', fromFt: 0, toFt: 3 }];
  // moved: same offsets (they're on the room), so the drawn line moves with it
  const moved = { ...r0, x: 7, y: 3 };
  const m = openWallsAfterRoomMove(list, r0, moved);
  assert.deepEqual(m, list);
  const seg = openSeg(m[0], [moved]);
  near(seg.a.x, 9); near(seg.a.y, 3); near(seg.b.x, 12);
  // resized from the right: the left end stayed, so the section stays put; a whole open side stays whole
  const wide = { ...r0, w: 14, h: 8 };
  const rz = openWallsAfterRoomMove(list, r0, wide);
  near(rz[0].fromFt, 2); near(rz[0].toFt, 5);
  near(rz[1].fromFt, 0); near(rz[1].toFt, 8, 'whole right side stays whole');
  // shrunk past a section: clamped, and dropped when nothing is left
  const tiny = { ...r0, w: 3 };
  const sh = openWallsAfterRoomMove([list[0]], r0, tiny);
  near(sh[0].fromFt, 2); near(sh[0].toFt, 3);
  assert.deepEqual(openWallsAfterRoomMove([{ id: 'x', roomId: 'a', wall: 'n', fromFt: 6, toFt: 9 }], r0, { ...r0, w: 5 }), []);
  // turned a quarter clockwise: top -> right (same offsets), right -> bottom (flipped)
  const turned = rotateRoom(r0, { w: 40, h: 30, rooms: [r0] });
  const t = openWallsAfterRoomMove(list, r0, turned, { turn: true });
  assert.equal(t[0].wall, 'e'); near(t[0].fromFt, 2); near(t[0].toFt, 5);
  assert.equal(t[1].wall, 's'); near(t[1].fromFt, 0); near(t[1].toFt, 6);
  assert.equal(t[2].roomId, 'b', 'other rooms untouched');
  // same spot on the plan after the turn: the top wall's section (x 2..5 at the top) is now on the right side
  const ts = openSeg(t[0], [turned]);
  near(ts.a.x, turned.x + turned.w);
  // a deleted room takes its sections with it
  assert.deepEqual(openWallsOfRooms(list, [R('b', 20, 0, 5, 5)]).map((o) => o.id), ['o3']);
});

test('open walls and doors: no door on an open wall; opening a wall takes its doors off', () => {
  const pl = P([kitchen, living]);
  const door = placeDoor(pl, 6, 10, { id: 'd1' });
  const win = placeDoor(pl, 0, 18, { id: 'd2', kind: 'window' });
  const pl1 = { ...pl, doors: [door, win] };
  const r = openWallAt(pl1, 6, 10.2, { id: 'o1' });
  const pl2 = { ...pl1, openWalls: r.list };
  assert.deepEqual(doorsOnOpen(pl2.doors, pl2), ['d1'], 'the door on the shared wall comes off, the window elsewhere stays');
  // a new door can't go on the open stretch, but can on the part of the wall still there
  const segs = planOpenSegs(pl2);
  assert.equal(segOnOpen(doorSeg(placeDoor(pl2, 5, 10.1, { id: 'n1' }), pl2), segs), true);
  assert.equal(segOnOpen(doorSeg(placeDoor(pl2, 16, 10.1, { id: 'n2' }), pl2), segs), false);
  assert.deepEqual(doorsOnOpen([], pl2), []);
  assert.deepEqual(doorsOnOpen(pl1.doors, pl1), [], 'no open walls, nothing comes off');
});

test('open walls: save / load round trip; old plans load unchanged; bad data dropped', () => {
  const pl = P([kitchen, living], { openWalls: [{ id: 'o1', roomId: 'l', wall: 'n', fromFt: 0, toFt: 12 }] });
  const saved = planToSave(pl);
  assert.deepEqual(saved.openWalls, [{ id: 'o1', roomId: 'l', wall: 'n', fromFt: 0, toFt: 12 }]);
  const back = planOf({ floorplan: saved });
  assert.deepEqual(back.openWalls, saved.openWalls);
  // nothing open: nothing saved (old plans stay byte-for-byte the same shape)
  const plain = planToSave(P([kitchen, living]));
  assert.equal('openWalls' in plain, false);
  const old = planOf({ floorplan: { w: 30, h: 24, rooms: [kitchen, living] } });
  assert.deepEqual(old.openWalls, []);
  // 2 floors: per floor
  const two = { ...pl, floors: [{ id: 'f1', name: 'Floor 1', rooms: pl.rooms }, { id: 'f2', name: 'Floor 2', rooms: [R('b', 0, 0, 10, 10)], openWalls: [{ id: 'o2', roomId: 'b', wall: 'w', fromFt: 1, toFt: 4 }] }] };
  const s2 = planToSave(two);
  assert.equal(s2.floors[0].openWalls.length, 1);
  assert.equal(s2.floors[1].openWalls[0].id, 'o2');
  assert.equal(planOf({ floorplan: s2 }, 'f2').openWalls[0].id, 'o2');
  // a section whose room is gone, a bad side or bad numbers: dropped
  const bad = planOf({ floorplan: { w: 30, h: 24, rooms: [kitchen], openWalls: [{ id: 'x1', roomId: 'gone', wall: 'n', fromFt: 0, toFt: 3 }, { id: 'x2', roomId: 'k', wall: 'up', fromFt: 0, toFt: 3 }, { id: 'x3', roomId: 'k', wall: 'n', fromFt: 'a', toFt: 3 }, { id: 'x4', roomId: 'k', wall: 'n', fromFt: 5, toFt: 2 }] } });
  assert.deepEqual(bad.openWalls, [{ id: 'x4', roomId: 'k', wall: 'n', fromFt: 2, toFt: 5 }]);
  assert.deepEqual(okOpenWalls(bad.openWalls, [kitchen]), bad.openWalls);
  // Start from scratch clears them
  assert.deepEqual(clearPlan(pl).openWalls, []);
  assert.equal(clearPlan(two).floors.some((f) => f.openWalls), false);
});

test('open walls leave the house outline alone', () => {
  const rooms = [kitchen, living];
  const before = outlineFromRooms(rooms);
  const pl = P(rooms, { openWalls: setSideOpen(P(rooms), 'k', 'n', true, { id: 'o1' }) });
  assert.deepEqual(outlineFromRooms(pl.rooms), before);
  assert.equal(sideState(pl, kitchen, 'n'), 'open');
  // wallAt / sharedSpan basics
  assert.equal(wallAt(pl, 20, 20, { max: 0.5 }).wall, 'e');
  assert.equal(sharedSpan(pl, kitchen, 'e', 5), null);
});
