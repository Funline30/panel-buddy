import test from 'node:test';
import assert from 'node:assert/strict';
import { planOf, planToSave, rectPts, shapeOf, bboxOf, cleanPts, validShape, moveCorner, addCorner, removeCorner, moveEdge, presetShape, pointInPoly, roomsOutside, roomsOutline, scaleRoom, scalePoint, fitRoomsToShape, normalizeShape, snapPin, walls, isBox, polyArea } from '../src/lib/floorplan.js';

const R = (id, x, y, w, h, name = id) => ({ id, name, x, y, w, h });
const plan1 = (rooms, extra = {}) => ({ w: 16, h: 76, rooms, floors: [{ id: 'f1', name: 'Floor 1', rooms }], floor: 'f1', outline: 'box', outlinePts: null, ...extra });
const xy = (pts) => pts.map((p) => [p.x, p.y]);

test('shapeOf: no outline = the w x h box; rooms outline = the rooms (L-shaped ranch)', () => {
  assert.deepEqual(xy(shapeOf(plan1([]))), [[0, 0], [16, 0], [16, 76], [0, 76]]);
  const rooms = [R('garage', 0, 0, 22, 24), R('house', 22, 0, 38, 46)];
  const p = { ...plan1(rooms), w: 60, h: 46, outline: 'rooms' };
  assert.deepEqual(xy(shapeOf(p)), [[0, 0], [60, 0], [60, 46], [22, 46], [22, 24], [0, 24]]);
  assert.deepEqual(xy(roomsOutline(rooms)), xy(shapeOf(p)));
});

test('old plans still load; a box outline is not saved, a polygon round-trips', () => {
  const old = planOf({ type: 'mobile', floorplan: { w: 16, h: 76, rooms: [R('a', 0, 0, 16, 10)] } });
  assert.equal(old.outlinePts, null);
  assert.equal(planToSave(old).outlinePts, undefined);
  const L = presetShape('L', 16, 76);
  const saved = planToSave({ ...old, outlinePts: L });
  assert.deepEqual(saved.outlinePts, L);
  const back = planOf({ type: 'mobile', floorplan: saved });
  assert.deepEqual(back.outlinePts, L);
  // just the box -> nothing extra saved (same data as before Shape house)
  assert.equal(planToSave({ ...old, outlinePts: rectPts(16, 76) }).outlinePts, undefined);
  // bad data is ignored
  assert.equal(planOf({ floorplan: { w: 20, h: 20, outlinePts: [{ x: 1 }, null] } }).outlinePts, null);
});

test('2+ floors: each floor keeps its own outline', () => {
  const home = { floorplan: { w: 30, h: 30, floors: [{ id: 'f1', name: 'Floor 1', rooms: [], outlinePts: presetShape('L', 30, 30) }, { id: 'f2', name: 'Floor 2', rooms: [] }] } };
  const p1 = planOf(home, 'f1'), p2 = planOf(home, 'f2');
  assert.equal(p1.outlinePts.length, 6);
  assert.equal(p2.outlinePts, null);
  const s = planToSave(p1);
  assert.equal(s.floors[0].outlinePts.length, 6);
  assert.equal(s.floors[1].outlinePts, undefined);
});

test('addCorner splits a wall in the middle; too short = unchanged', () => {
  const r = rectPts(16, 76);
  const a = addCorner(r, 2);
  assert.deepEqual(xy(a), [[0, 0], [16, 0], [16, 76], [8, 76], [0, 76]]);
  const tiny = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 5 }, { x: 0, y: 5 }];
  assert.equal(addCorner(tiny, 0), tiny);
});

test('removeCorner: takes a corner out, never below 3 corners or into a crossed shape', () => {
  const L = presetShape('L', 20, 20);
  const r = removeCorner(L, 3); // the inside corner of the L -> a diagonal cut
  assert.equal(r.length, 5);
  assert.ok(validShape(r));
  const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  assert.equal(removeCorner(tri, 0), tri);
});

test('moveCorner snaps to 1 ft and lines up with a neighbour within 1.5 ft', () => {
  const r = rectPts(16, 76);
  assert.deepEqual(moveCorner(r, 2, 20.4, 70.2)[2], { x: 20, y: 70 });
  // close to the neighbour's x (16) and y (76) -> straight walls
  assert.deepEqual(moveCorner(r, 2, 17.2, 75.1)[2], { x: 16, y: 76 });
});

test('moveEdge: a plain wall slides straight (stretch / shrink)', () => {
  const r = rectPts(16, 76);
  const { pts, i } = moveEdge(r, 1, 3.6, 9); // right wall: only x counts
  assert.deepEqual(xy(pts), [[0, 0], [20, 0], [20, 76], [0, 76]]);
  assert.equal(i, 1);
  // last wall (wraps to corner 0)
  const left = moveEdge(r, 3, -4, 0);
  assert.deepEqual(xy(cleanPts(left.pts)), [[-4, 0], [16, 0], [16, 76], [-4, 76]]);
});

test('moveEdge: half a wall (after + Corner) pulls out an L with square corners', () => {
  const half = addCorner(rectPts(16, 76), 2); // bottom wall split at x = 8
  const { pts } = moveEdge(half, 2, 0, -18); // right half up 18 ft
  const L = cleanPts(pts);
  assert.deepEqual(xy(L), [[0, 0], [16, 0], [16, 58], [8, 58], [8, 76], [0, 76]]);
  assert.ok(validShape(L));
  // every wall is straight across or straight down
  L.forEach((p, k) => { const q = L[(k + 1) % L.length]; assert.ok(p.x === q.x || p.y === q.y); });
  // a middle piece pulled out = a bump-out (porch) with 4 new corners
  const two = addCorner(addCorner(rectPts(20, 30), 2, 0.75), 2, 0.5); // bottom wall split twice
  const bump = cleanPts(moveEdge(two, 3, 0, 6).pts);
  assert.equal(bump.length, 8);
  assert.equal(bboxOf(bump).h, 36);
  // dragged back to where it was = nothing changes
  assert.deepEqual(cleanPts(moveEdge(half, 2, 0, 0).pts), half);
});

test('validShape rejects crossed or flat shapes', () => {
  assert.ok(validShape(rectPts(10, 10)));
  assert.ok(!validShape([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]));
  assert.ok(!validShape([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]));
});

test('presets: L, T, U fill the same footprint, clockwise, no crossing', () => {
  for (const k of ['rect', 'L', 'T', 'U']) {
    const s = presetShape(k, 40, 30);
    assert.ok(validShape(s), k);
    assert.ok(polyArea(s) > 0, k);
    assert.deepEqual(bboxOf(s), { x: 0, y: 0, w: 40, h: 30 }, k);
  }
  assert.equal(presetShape('L', 40, 30).length, 6);
  assert.equal(presetShape('T', 40, 30).length, 8);
  assert.equal(presetShape('U', 40, 30).length, 8);
  assert.ok(isBox(presetShape('rect', 40, 30), 40, 30));
});

test('pointInPoly: inside, outside, on a wall counts (plugs live on walls)', () => {
  const L = presetShape('L', 20, 20); // notch is x > 11, y > 11
  assert.ok(pointInPoly({ x: 5, y: 5 }, L));
  assert.ok(!pointInPoly({ x: 15, y: 15 }, L));
  assert.ok(pointInPoly({ x: 20, y: 5 }, L)); // on the outside wall
  assert.ok(pointInPoly({ x: 11, y: 15 }, L)); // on the inside wall of the L
  assert.ok(!pointInPoly({ x: 21, y: 5 }, L));
});

test('roomsOutside: rooms that stick out of the outline get flagged, rooms on the walls do not', () => {
  const L = presetShape('L', 20, 20);
  const rooms = [R('in', 0, 0, 11, 20), R('top', 11, 0, 9, 11), R('out', 12, 12, 8, 8), R('half', 8, 14, 6, 6)];
  assert.deepEqual([...roomsOutside(rooms, L)].sort(), ['half', 'out']);
});

test('plugs snap to the outline walls of a shaped house', () => {
  const L = presetShape('L', 20, 20);
  const p = plan1([], { w: 20, h: 20, outlinePts: L });
  assert.equal(walls(p).length, 6);
  assert.deepEqual(snapPin(p, 14, 10.4), { x: 14, y: 11 }); // the inside wall of the L
  const diag = plan1([], { w: 20, h: 20, outlinePts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }] });
  const s = snapPin(diag, 10.5, 10.5);
  assert.ok(Math.abs(s.x - 10) < 0.11 && Math.abs(s.y - 10) < 0.11);
});

test('rooms + plugs stretch with the house (proportional), walls stay touching', () => {
  const rooms = [R('a', 0, 0, 16, 13), R('b', 0, 13, 9, 8), R('c', 9, 13, 7, 8)];
  const from = { x: 0, y: 0, w: 16, h: 76 }, to = { x: 0, y: 0, w: 20, h: 76 };
  const out = rooms.map((r) => scaleRoom(r, from, to));
  assert.deepEqual(out.map((r) => [r.x, r.w]), [[0, 20], [0, 11], [11, 9]]);
  assert.equal(out[1].x + out[1].w, out[2].x); // b and c still share a wall
  assert.deepEqual(scalePoint({ x: 16, y: 10, floor: 'f2' }, from, to), { x: 20, y: 10, floor: 'f2' });
  const p = plan1(rooms);
  const devices = [{ id: 'd1', pos: { x: 16, y: 5 } }, { id: 'd2', pos: { x: 9, y: 17 } }, { id: 'd3' }];
  const f = fitRoomsToShape(p, devices, from, { x: 0, y: 0, w: 16, h: 38 });
  assert.equal(f.rooms[0].h, 7); // 13 -> 6.5 -> snaps
  assert.deepEqual(f.pins.d1, { x: 16, y: 2.5 });
  assert.deepEqual(f.pins.d2, { x: 9, y: 8.5 });
  assert.equal(f.pins.d3, undefined);
});

test('normalizeShape: pulling the left wall out slides everything right; shrinking makes the plan snug', () => {
  const rooms = [R('a', 0, 0, 16, 10)];
  const p = plan1(rooms, { outlinePts: [{ x: -4, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 76 }, { x: -4, y: 76 }] });
  const n = normalizeShape(p, [{ id: 'd', pos: { x: 0, y: 5 } }]);
  assert.deepEqual([n.plan.w, n.plan.h], [20, 76]);
  assert.deepEqual(xy(n.plan.outlinePts)[0], [0, 0]);
  assert.equal(n.plan.rooms[0].x, 4);
  assert.deepEqual(n.pins.d, { x: 4, y: 5 });
  // house shrunk to the right 12 ft (rooms followed): w shrinks
  const q = plan1([R('a', 0, 0, 12, 10)], { outlinePts: rectPts(12, 76) });
  assert.equal(normalizeShape(q, []).plan.w, 12);
  // rooms left outside keep the plan big enough to hold them (they get the warning instead)
  const k = plan1([R('a', 0, 0, 16, 10)], { outlinePts: rectPts(12, 76) });
  assert.equal(normalizeShape(k, []).plan.w, 16);
  // a plug that was already off the plan doesn't stretch it
  assert.equal(normalizeShape(q, [{ id: 'far', pos: { x: 5, y: 150 } }]).plan.h, 76);
});
