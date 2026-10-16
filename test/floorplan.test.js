import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snap, planOf, planToSave, clampRoom, moveRoom, resizeRoom, resizePlan, roomAt, nearestWall, snapPin,
  pinKind, kindFields, splitPlaced, pinsByBreaker, roomsOnBreaker, mobileHomeTemplate, newRoomSpot, inBounds,
  TEMPLATES, applyTemplate, walls, floorOfPos,
} from '../src/lib/floorplan.js';
import { houseExample } from '../src/lib/seed.js';

const plan = (rooms = [], w = 16, h = 76) => ({ w, h, rooms });

test('snap rounds to the 1-ft grid (and other steps)', () => {
  assert.equal(snap(4.4), 4);
  assert.equal(snap(4.5), 5);
  assert.equal(snap(-0.4), 0);
  assert.equal(snap(7.3, 0.5), 7.5);
  assert.equal(snap('12'), 12);
  assert.equal(snap(undefined), 0);
});

test('planOf: default outline per home type, saved plan kept, no mutation', () => {
  const mobile = planOf({ type: 'mobile' });
  assert.deepEqual([mobile.w, mobile.h, mobile.rooms.length, mobile.hasPlan], [16, 76, 0, false]);
  assert.deepEqual([planOf({ type: 'house' }).w, planOf({ type: 'house' }).h], [40, 30]);
  const home = { type: 'mobile', floorplan: { w: 14.6, h: 70, rooms: [{ id: 'a', name: 'Den', x: 2.4, y: 3, w: 10, h: 9.6 }] } };
  const p = planOf(home);
  assert.equal(p.w, 15);
  assert.deepEqual(p.rooms[0], { id: 'a', name: 'Den', x: 2, y: 3, w: 10, h: 10 });
  assert.equal(home.floorplan.rooms[0].x, 2.4, 'home not mutated');
  assert.deepEqual(planToSave(p), { w: 15, h: 70, rooms: [{ id: 'a', name: 'Den', x: 2, y: 3, w: 10, h: 10 }] });
  assert.equal(planToSave({ ...p, photoId: 'ph_1', photoOpacity: 0.4, photoRot: 90 }).photoId, 'ph_1');
});

test('rooms stay inside the outline, snapped, at least 3 ft', () => {
  const p = plan();
  assert.deepEqual(clampRoom({ id: 'r', x: 12, y: 74, w: 10, h: 1 }, p), { id: 'r', x: 6, y: 73, w: 10, h: 3 });
  assert.deepEqual(clampRoom({ id: 'r', x: -3, y: -2, w: 40, h: 8.6 }, p), { id: 'r', x: 0, y: 0, w: 16, h: 9 });
  const r = { id: 'r', x: 2, y: 10, w: 8, h: 8 };
  assert.deepEqual(moveRoom(r, 1.6, -0.4, p), { id: 'r', x: 4, y: 10, w: 8, h: 8 });
  assert.deepEqual(moveRoom(r, 50, 0, p), { id: 'r', x: 8, y: 10, w: 8, h: 8 }, 'stops at the wall');
  assert.deepEqual(resizeRoom(r, 2.4, -10, p), { id: 'r', x: 2, y: 10, w: 10, h: 3 });
  assert.deepEqual(resizeRoom(r, 99, 0, p), { id: 'r', x: 2, y: 10, w: 14, h: 8 }, 'cannot grow past the outline');
  const smaller = resizePlan(plan([{ id: 'r', x: 6, y: 60, w: 10, h: 16 }]), 14, 66);
  assert.deepEqual([smaller.w, smaller.h], [14, 66]);
  assert.deepEqual(smaller.rooms[0], { id: 'r', x: 4, y: 50, w: 10, h: 16 });
});

test('roomAt picks the smallest room under a point', () => {
  const p = plan([{ id: 'big', x: 0, y: 0, w: 16, h: 20 }, { id: 'closet', x: 10, y: 14, w: 6, h: 6 }]);
  assert.equal(roomAt(p, 12, 16).id, 'closet');
  assert.equal(roomAt(p, 3, 3).id, 'big');
  assert.equal(roomAt(p, 3, 40), null);
});

test('pins snap to the nearest wall when close, else stay put; bounds', () => {
  const p = plan([{ id: 'k', x: 0, y: 38, w: 16, h: 14 }]);
  assert.deepEqual(snapPin(p, 15.2, 44.5), { x: 16, y: 44.5 }, 'outside wall');
  assert.deepEqual(snapPin(p, 7, 39.1), { x: 7, y: 38 }, 'room wall');
  assert.deepEqual(snapPin(p, 8, 45), { x: 8, y: 45 }, 'middle of the room = ceiling, no snap');
  assert.deepEqual(snapPin(p, -4, 80), { x: 0, y: 76 }, 'clamped into the house');
  assert.deepEqual(snapPin(p, 15.2, 44.5, { wall: false }), { x: 15.2, y: 44.5 });
  assert.equal(nearestWall(p, 15, 10).dist, 1);
  assert.equal(inBounds({ x: 3, y: 3 }, p), true);
  assert.equal(inBounds({ x: 17, y: 3 }, p), false);
});

test('pin kinds and new-pin fields', () => {
  assert.equal(pinKind({ type: 'outlet' }), 'outlet');
  assert.equal(pinKind({ type: 'outlet', gfci: 'gfci_outlet' }), 'gfci');
  assert.equal(pinKind({ type: 'outlet', style: 'gfci' }), 'gfci');
  assert.equal(pinKind({ type: 'light' }), 'light');
  assert.equal(pinKind({ type: 'smoke' }), 'other');
  assert.deepEqual(kindFields('gfci'), { type: 'outlet', gfci: 'gfci_outlet' });
  assert.deepEqual(kindFields('switch'), { type: 'switch', gfci: 'unknown' });
});

test('pins grouped by breaker; missing or bad pos = not on the plan yet', () => {
  const p = plan([{ id: 'lr', name: 'Living room', x: 0, y: 21, w: 16, h: 17 }, { id: 'br', name: 'Boys room', x: 0, y: 67, w: 16, h: 9 }]);
  const devices = [
    { id: 'a', breakerId: 'b29', room: 'Living room', pos: { x: 16, y: 29 } },
    { id: 'b', breakerId: 'b29', room: 'Boys room', pos: { x: 0, y: 71 } },
    { id: 'c', breakerId: 'b26', room: 'Master bedroom' },
    { id: 'd', breakerId: '', room: 'Kitchen', pos: { x: 3, y: 40 } },
    { id: 'e', breakerId: 'b26', pos: { x: 99, y: 3 } },
  ];
  const { placed, unplaced } = splitPlaced(devices, p);
  assert.deepEqual(placed.map((d) => d.id), ['a', 'b', 'd']);
  assert.deepEqual(unplaced.map((d) => d.id), ['c', 'e']);
  assert.deepEqual(pinsByBreaker(devices, p), { b29: ['a', 'b'], '': ['d'] });
  assert.deepEqual(roomsOnBreaker(p, { id: 'b29', rooms: [] }, devices).sort(), ['br', 'lr']);
  assert.deepEqual(roomsOnBreaker(p, { id: 'b26', rooms: ['boys room'] }, devices), ['br'], 'by the breaker room list too');
  assert.deepEqual(roomsOnBreaker(p, null, devices), []);
});

test('mobile home template: end to end, inside the outline, uses his bedroom names', () => {
  const rooms = mobileHomeTemplate(plan(), ["Daughter's room", 'Kitchen', 'Boys room', 'Garage']);
  const names = rooms.map((r) => r.name);
  assert.equal(names[0], 'Master bedroom');
  assert.ok(names.includes('Living room') && names.includes('Kitchen'));
  assert.deepEqual(names.slice(-2), ["Daughter's room", 'Boys room']);
  for (const r of rooms) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 16 && r.y + r.h <= 76, r.name);
  assert.equal(Math.max(...rooms.map((r) => r.y + r.h)), 76, 'fills the length');
  const wide = mobileHomeTemplate(plan([], 14, 66));
  assert.equal(Math.max(...wide.map((r) => r.y + r.h)), 66);
  assert.equal(wide.at(-1).name, 'Bedroom 3');
  assert.equal(new Set(rooms.map((r) => r.id)).size, rooms.length);
});

test('new room goes in the first free spot', () => {
  assert.deepEqual(newRoomSpot(plan([{ id: 'a', x: 0, y: 0, w: 16, h: 13 }])), { x: 0, y: 13, w: 10, h: 10 });
});

test('example house: every placed pin is on the plan and inside its own room', () => {
  const ex = houseExample(0);
  const home = ex.homes[0];
  const p = planOf(home);
  assert.equal(p.rooms.length, 9);
  const { placed, unplaced } = splitPlaced(ex.devices, p);
  assert.equal(unplaced.length, 1, 'dishwasher left for the "Not on the plan yet" list');
  for (const d of placed) {
    const r = p.rooms.find((x) => x.name === d.room);
    assert.ok(r, d.room);
    assert.ok(d.pos.x >= r.x && d.pos.x <= r.x + r.w && d.pos.y >= r.y && d.pos.y <= r.y + r.h, `${d.id} in ${d.room}`);
  }
  // the living room breaker lights up the living room and the boys room
  assert.deepEqual(roomsOnBreaker(p, ex.breakers.find((b) => b.id === 'pr29'), ex.devices).map((id) => p.rooms.find((r) => r.id === id).name).sort(), ['Boys room', 'Living room']);
});

test('every template: rooms inside the drawing, none overlapping; 2-story has 2 floors; ranch is L-shaped', () => {
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (const tp of TEMPLATES) {
    const f = applyTemplate(tp.v, plan(), ['Boys room']);
    for (const fl of f.floors) {
      for (const r of fl.rooms) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= f.w && r.y + r.h <= f.h, `${tp.v} ${r.name}`);
      for (let i = 0; i < fl.rooms.length; i++) for (let j = i + 1; j < fl.rooms.length; j++) assert.ok(!overlap(fl.rooms[i], fl.rooms[j]), `${tp.v}: ${fl.rooms[i].name} / ${fl.rooms[j].name}`);
    }
  }
  const two = applyTemplate('two', plan());
  assert.deepEqual(two.floors.map((x) => x.name), ['Floor 1', 'Floor 2']);
  assert.ok(two.floors[1].rooms.some((r) => r.name === 'Master bedroom'));
  assert.equal(applyTemplate('ranch', plan()).outline, 'rooms');
  const blank = applyTemplate('blank', plan([], 20, 40));
  assert.deepEqual([blank.w, blank.h, blank.floors[0].rooms.length], [20, 40, 0], 'blank keeps the current size');
  const dw = applyTemplate('double', plan());
  assert.deepEqual([dw.w, dw.h], [28, 60]);
});

test('floors: saved as floors[] only when there are 2+, pins remember their floor', () => {
  const home = { type: 'house', floorplan: { w: 36, h: 30, floors: [{ id: 'f1', name: 'Floor 1', rooms: [{ id: 'a', name: 'Kitchen', x: 0, y: 0, w: 10, h: 10 }] }, { id: 'f2', name: 'Floor 2', rooms: [{ id: 'b', name: 'Bed', x: 0, y: 0, w: 12, h: 12 }] }] } };
  const p1 = planOf(home);
  assert.equal(p1.floor, 'f1');
  assert.equal(p1.rooms[0].name, 'Kitchen');
  const p2 = planOf(home, 'f2');
  assert.equal(p2.rooms[0].name, 'Bed');
  assert.deepEqual(snapPin(p2, 0.6, 5), { x: 0, y: 5, floor: 'f2' });
  assert.deepEqual(snapPin(p1, 0.6, 5), { x: 0, y: 5 }, 'first floor stays plain');
  const saved = planToSave({ ...p2, rooms: [...p2.rooms, { id: 'c', name: 'Bath', x: 12, y: 0, w: 6, h: 6 }] });
  assert.equal(saved.rooms, undefined);
  assert.deepEqual(saved.floors.map((f) => f.rooms.length), [1, 2]);
  assert.deepEqual(Object.keys(planToSave(planOf({ type: 'mobile', floorplan: { w: 16, h: 76, rooms: [] } }))).sort(), ['h', 'rooms', 'w']);
  const devices = [{ id: 'k', pos: { x: 1, y: 1 } }, { id: 'u', pos: { x: 1, y: 1, floor: 'f2' } }, { id: 'n' }];
  const s1 = splitPlaced(devices, p1), s2 = splitPlaced(devices, p2);
  assert.deepEqual([s1.placed.map((d) => d.id), s1.elsewhere.map((d) => d.id), s1.unplaced.map((d) => d.id)], [['k'], ['u'], ['n']]);
  assert.deepEqual(s2.placed.map((d) => d.id), ['u']);
  assert.equal(floorOfPos({ x: 1, y: 1, floor: 'gone' }, p1), 'f1', 'a floor that no longer exists = first floor');
});

test('L-shape: no outline walls, pins snap to room walls only', () => {
  const p = { w: 60, h: 46, outline: 'rooms', rooms: [{ id: 'g', x: 0, y: 0, w: 22, h: 24 }], floors: [{ id: 'f1', rooms: [] }], floor: 'f1' };
  assert.equal(walls(p).length, 4);
  assert.deepEqual(snapPin(p, 1, 40), { x: 1, y: 40 }, 'empty corner of the L: nothing to snap to');
  assert.deepEqual(snapPin(p, 21.2, 10), { x: 22, y: 10 });
});
