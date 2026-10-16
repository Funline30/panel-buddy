import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData } from '../src/lib/seed.js';
import { buildHouseMap, outletsOnBreaker, breakerOfOutlet, breakerTagText, roomSort, NO_ROOM } from '../src/lib/housemap.js';

const T = Date.parse('2026-10-16T20:00:00Z');
function house() {
  const d = seedData();
  const H = 'h_house';
  return { breakers: d.breakers.filter((b) => b.homeId === H), devices: d.devices.filter((x) => x.homeId === H), panels: d.panels.filter((p) => p.homeId === H) };
}

test('house map: example house has the real rooms, each a tile', () => {
  const map = buildHouseMap(house(), { t: T });
  const names = map.rooms.map((r) => r.name);
  for (const n of ['Living room', 'Boys room', 'Kitchen', 'Master bedroom', 'Master bath', 'Master closet', "Daughter's room", 'Guest bath']) assert.ok(names.includes(n), n);
  assert.equal(names[0], 'Living room');
  assert.equal(names[1], 'Boys room'); // same breaker as the living room -> right after it
  assert.ok(names.indexOf('Kitchen') < names.indexOf("Daughter's room"));
});

test('house map: the living room 15A also feeds the whole boys room', () => {
  const data = house();
  const map = buildHouseMap(data, { t: T });
  const boys = map.rooms.find((r) => r.name === 'Boys room');
  assert.equal(boys.wholeRoom, 'pr29');
  const names = boys.outlets.flatMap((d) => (d.loads || []).map((l) => l.name));
  for (const n of ['Standing fan', 'Bambu Lab puck light', 'Sound machine (charging)', 'TV', 'Roku stick']) assert.ok(names.includes(n), n);
  // tap the breaker tag: every plug on it lights up, in both rooms
  const hits = outletsOnBreaker(map, 'pr29');
  assert.deepEqual([...new Set(hits.map((h) => h.room))].sort(), ['Boys room', 'Living room']);
  assert.equal(hits.length, data.devices.filter((d) => d.breakerId === 'pr29').length);
  assert.deepEqual(map.breakers.pr29.rooms, ['Living room', 'Boys room']);
  // things wired to the breaker itself show in its first room
  const living = map.rooms.find((r) => r.name === 'Living room');
  assert.ok(living.circuit.some((c) => c.breakerId === 'pr29' && c.loads.some((l) => l.name === 'Ceiling fan')));
  // still fine day to day, under 100% even with everything running
  assert.equal(map.breakers.pr29.level, 'ok');
  assert.ok(map.breakers.pr29.peakPct < 100);
});

test('house map: 26/28 = master suite, 30/32 = daughter + guest bath, tags read like the sticker', () => {
  const map = buildHouseMap(house(), { t: T });
  assert.equal(map.breakers.pr26.tag, 'Brkr 26/28 · 15A');
  assert.equal(map.breakers.pr30.tag, 'Brkr 30/32 · 15A');
  assert.deepEqual(map.breakers.pr26.rooms.sort(), ['Master bath', 'Master bedroom', 'Master closet']);
  assert.deepEqual(map.breakers.pr30.rooms.sort(), ["Daughter's room", 'Guest bath']);
  assert.equal(map.rooms.find((r) => r.name === 'Master closet').wholeRoom, 'pr26');
  // master bath: lights on 26/28, sink outlet on the quad's GFI #8 -> 2 breakers, no "whole room"
  const bath = map.rooms.find((r) => r.name === 'Master bath');
  assert.equal(bath.wholeRoom, '');
  assert.deepEqual(bath.breakerIds.sort(), ['pr13', 'pr26']);
  // tap an outlet -> its breaker
  assert.equal(breakerOfOutlet(map, 'hd15').breaker.id, 'pr13');
  assert.equal(breakerOfOutlet(map, 'hd17').tag, 'Brkr 30/32 · 15A');
  assert.equal(breakerOfOutlet(map, 'nope'), null);
});

test('house map: kitchen fridge 5.0A and the 40A range 10–16', () => {
  const map = buildHouseMap(house(), { t: T });
  const k = map.rooms.find((r) => r.name === 'Kitchen');
  const fridge = k.outlets.find((d) => d.id === 'hd6');
  assert.equal(fridge.loads[0].watts, 600);
  assert.equal(map.breakers.pr10.tag, 'Brkr 10–16 · 40A');
  assert.ok(k.circuit.some((c) => c.breakerId === 'pr10'));
  assert.equal(breakerOfOutlet(map, 'hd9').breaker.id, 'pr10');
});

test('house map: grouping edge cases (no room, no breaker, breaker-only rooms, other panels)', () => {
  const panels = [{ id: 'p', name: 'Main', layout: 'two' }];
  const breakers = [
    { id: 'b1', panelId: 'p', slot: '1', poles: '1', amps: '20', rooms: ['Garage'], loads: [] },
    { id: 'b2', panelId: 'p', slot: '2', poles: '2', amps: '30', rooms: [], loads: [{ name: 'Dryer', watts: 5000 }] },
  ];
  const devices = [
    { id: 'd1', breakerId: 'b1', room: 'Office', type: 'outlet', name: 'Desk' },
    { id: 'd2', breakerId: '', room: 'Office', type: 'outlet', name: 'Lamp outlet' },
    { id: 'd3', breakerId: 'b2', room: '', type: 'outlet', name: 'Dryer plug' },
    { id: 'd4', breakerId: 'gone', room: 'Office', type: 'light', name: 'Light' },
  ];
  const map = buildHouseMap({ breakers, devices, panels }, { t: T });
  const names = map.rooms.map((r) => r.name);
  assert.deepEqual(names, ['Garage', 'Office', NO_ROOM]);
  const garage = map.rooms.find((r) => r.name === 'Garage');
  assert.equal(garage.outlets.length, 0);
  assert.equal(garage.wholeRoom, 'b1'); // listed on the breaker, nothing added yet
  const office = map.rooms.find((r) => r.name === 'Office');
  assert.equal(office.wholeRoom, ''); // one plug has no breaker yet
  assert.deepEqual(office.breakerIds, ['b1']); // a deleted breaker id is ignored
  const none = map.rooms.find((r) => r.name === NO_ROOM);
  assert.ok(none.circuit.some((c) => c.breakerId === 'b2')); // breaker loads follow its outlet's room
  assert.equal(map.breakers.b2.tag, 'Brkr 2/4 · 30A');
  assert.equal(breakerTagText(null), 'No breaker set');
  assert.equal(breakerTagText({ slot: '26', poles: '1', amps: 'other', ampsOther: '25' }, { numbering: 'half', layout: 'two' }), 'Brkr 26/28 · 25A');
  assert.ok(roomSort('Zebra room', NO_ROOM) < 0);
  assert.ok(roomSort('Living room', 'Attic') < 0);
});
