import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSummary, totalWatts, onWatts, isOn, breakerWatts, deviceWatts, shoreSummary } from '../src/lib/load.js';
import { parseRef, loadRef, loadAt, toggleLoad, setAllOn, moveLoad, setPortable, portablesOf } from '../src/lib/onoff.js';
import { projectedPct } from '../src/lib/devicesearch.js';
import { seedData } from '../src/lib/seed.js';

const brk = (loads, extra = {}) => ({ id: 'b1', homeId: 'h', poles: '1', amps: '15', loads, ...extra });

test('isOn: missing field = on (old data), only on === false is off', () => {
  assert.equal(isOn({ name: 'TV', watts: 100 }), true);
  assert.equal(isOn({ name: 'TV', watts: 100, on: true }), true);
  assert.equal(isOn({ name: 'TV', watts: 100, on: false }), false);
  assert.equal(isOn(undefined), true);
});

test('totals: all loads vs on loads (on / off / missing field)', () => {
  const loads = [
    { name: 'TV', watts: 150, qty: 1 }, // missing -> on
    { name: 'Bulb', watts: 10, qty: 4, on: true },
    { name: 'Window AC', watts: 900, qty: 1, on: false },
  ];
  assert.equal(totalWatts(loads), 1090);
  assert.equal(onWatts(loads), 190);
  assert.equal(totalWatts(loads, { onlyOn: true }), 190);
  assert.equal(deviceWatts({ loads }), 1090);
  assert.equal(deviceWatts({ loads }, { onlyOn: true }), 190);
});

test('loadSummary: "Using now" drives pct + level, "If everything is on" is the max', () => {
  // 15A breaker, 120V. On: 600W = 5A (33%). All on: 1680W = 14A (93%).
  const b = brk([
    { name: 'Laptop', watts: 360, qty: 1 },
    { name: 'TV', watts: 240, qty: 1, on: true },
    { name: 'Window AC', watts: 1080, qty: 1, on: false },
  ]);
  const s = loadSummary(b, []);
  assert.equal(s.watts, 600);
  assert.equal(Math.round(s.amps * 10) / 10, 5);
  assert.equal(Math.round(s.pct), 33);
  assert.equal(s.level, 'ok');
  assert.equal(s.allWatts, 1680);
  assert.equal(Math.round(s.allPct), 93);
  assert.equal(s.allLevel, 'warn');
  assert.equal(s.loadCount, 3);
  assert.equal(s.offCount, 1);
});

test('loadSummary: outlet loads count the same way, nothing double counted', () => {
  const b = brk([{ name: 'Bulb', watts: 60, qty: 1 }]);
  const devices = [
    { id: 'd1', breakerId: 'b1', loads: [{ name: 'Heater', watts: 1500, qty: 1, on: false }, { name: 'Charger', watts: 60, qty: 1 }] },
    { id: 'd2', breakerId: 'other', loads: [{ name: 'Fridge', watts: 400, qty: 1 }] },
  ];
  const s = loadSummary(b, devices);
  assert.equal(s.watts, 120);
  assert.equal(s.allWatts, 1620);
  assert.equal(s.parts.length, 1);
  assert.equal(s.parts[0].watts, 60);
  assert.equal(s.parts[0].allWatts, 1560);
  assert.equal(s.allLevel, 'warn');
  assert.equal(breakerWatts(b, devices), 120);
  assert.equal(breakerWatts(b, devices, { all: true }), 1620);
});

test('loadSummary: everything off = 0% OK (not "no loads"); nothing listed = none', () => {
  const s = loadSummary(brk([{ name: 'Heater', watts: 1500, qty: 1, on: false }]), []);
  assert.equal(s.watts, 0);
  assert.equal(s.pct, 0);
  assert.equal(s.level, 'ok');
  assert.equal(s.allLevel, 'warn'); // 1500W on 15A = 83% if it were on
  assert.equal(Math.round(s.allPct), 83);
  assert.equal(loadSummary(brk([]), []).level, 'none');
});

test('loadSummary: data without any on field reads exactly like before', () => {
  const b = brk([{ name: 'Heater', watts: 1500, qty: 1 }, { name: 'TV', watts: 150, qty: 1 }]);
  const s = loadSummary(b, []);
  assert.equal(s.watts, 1650);
  assert.equal(s.allWatts, 1650);
  assert.equal(s.pct, s.allPct);
  assert.equal(s.level, 'warn');
  assert.equal(s.offCount, 0);
});

test('search add picker: "now -> after" uses on loads, new item assumed on', () => {
  const s = loadSummary(brk([{ name: 'TV', watts: 600, qty: 1 }, { name: 'AC', watts: 1200, qty: 1, on: false }]), []);
  // now 5A (33%); adding a 600W item on -> 10A (67%)
  assert.equal(Math.round(projectedPct(s, 600)), 67);
});

test('shore power check counts only loads that are on', () => {
  const panel = { shorePower: '30' };
  const breakers = [brk([{ name: 'AC', watts: 1500, qty: 1, on: false }, { name: 'TV', watts: 120, qty: 1 }])];
  const sum = shoreSummary(panel, breakers, []);
  assert.equal(Math.round(sum.legs[0].amps * 10) / 10, 1);
});

const data = () => ({
  homes: [{ id: 'h', name: 'Home', portables: [{ name: 'Hair dryer', watts: 1500, qty: 1, portable: true }] }],
  breakers: [
    { id: 'b1', homeId: 'h', poles: '1', amps: '15', loads: [{ name: 'Laptop', watts: 360, qty: 1, on: false, portable: true }, { name: 'TV', watts: 150, qty: 1 }] },
    { id: 'b2', homeId: 'h', poles: '1', amps: '20', loads: [] },
  ],
  devices: [{ id: 'd1', homeId: 'h', breakerId: 'b2', type: 'outlet', loads: [{ name: 'Lamp', watts: 60, qty: 1 }] }],
});

test('refs: parse / build / read a load', () => {
  assert.deepEqual(parseRef('b:b1:0'), { kind: 'b', col: 'breakers', field: 'loads', id: 'b1', index: 0 });
  assert.equal(parseRef('p:h:2').field, 'portables');
  assert.equal(parseRef('x:1:0'), null);
  assert.equal(loadRef('d', 'd1', 3), 'd:d1:3');
  assert.equal(loadAt(data(), 'b:b1:1').name, 'TV');
  assert.equal(loadAt(data(), 'b:b1:9'), null);
});

test('toggleLoad flips one load (missing field = on -> off) and keeps the rest', () => {
  const u = toggleLoad(data(), 'b:b1:1');
  assert.equal(u.col, 'breakers');
  assert.equal(u.obj.loads[1].on, false);
  assert.equal(u.obj.loads[0].on, false); // untouched
  assert.equal(toggleLoad(data(), 'b:b1:0').obj.loads[0].on, true);
  assert.equal(toggleLoad(data(), 'b:b1:0', false).obj.loads[0].on, false);
});

test('setAllOn switches the breaker and its outlets', () => {
  const ups = setAllOn(data(), 'b2', false);
  assert.equal(ups.length, 1);
  assert.equal(ups[0].col, 'devices');
  assert.equal(ups[0].obj.loads[0].on, false);
  const ups2 = setAllOn(data(), 'b1', true);
  assert.ok(ups2[0].obj.loads.every((l) => l.on === true));
});

test('moveLoad: breaker -> outlet keeps its fields and on/off state', () => {
  const ups = moveLoad(data(), 'b:b1:0', { kind: 'd', id: 'd1' });
  assert.equal(ups.length, 2);
  assert.equal(ups[0].obj.loads.length, 1);
  assert.equal(ups[0].obj.loads[0].name, 'TV');
  const moved = ups[1].obj.loads[1];
  assert.equal(moved.name, 'Laptop');
  assert.equal(moved.on, false);
  assert.equal(moved.portable, true);
  assert.deepEqual(moveLoad(data(), 'b:b1:0', { kind: 'b', id: 'b1' }), []); // same place
  assert.deepEqual(moveLoad(data(), 'b:b1:0', { kind: 'b', id: 'nope' }), []);
});

test('portables: plug in = on and counted, unplug = back to the home list, not counted', () => {
  const d0 = data();
  const ups = moveLoad(d0, 'p:h:0', { kind: 'b', id: 'b2' });
  assert.equal(ups[0].col, 'homes');
  assert.equal(ups[0].obj.portables.length, 0);
  const placed = ups[1].obj.loads[0];
  assert.equal(placed.on, true);
  assert.equal(loadSummary(ups[1].obj, []).watts, 1500);
  const d1 = { ...d0, homes: [ups[0].obj], breakers: [d0.breakers[0], ups[1].obj] };
  const back = moveLoad(d1, 'b:b2:0', { kind: 'p', id: 'h' });
  assert.equal(back[0].obj.loads.length, 0);
  assert.equal(back[1].obj.portables[0].name, 'Hair dryer');
  assert.equal('on' in back[1].obj.portables[0], false);
  const list = portablesOf(d0, 'h');
  assert.equal(list.length, 2); // hair dryer (put away) + laptop (on b1)
  assert.equal(list.find((x) => x.load.name === 'Laptop').where.breaker.id, 'b1');
  assert.equal(list.find((x) => x.load.name === 'Hair dryer').where, null);
});

test('setPortable adds / removes the badge', () => {
  assert.equal(setPortable(data(), 'b:b1:1', true).obj.loads[1].portable, true);
  assert.equal('portable' in setPortable(data(), 'b:b1:0', false).obj.loads[0], false);
});

test('sample data: living room has a mix of on and off loads', () => {
  const d = seedData();
  const b13 = d.breakers.find((b) => b.id === 'b13');
  const s = loadSummary(b13, d.devices);
  assert.ok(s.offCount >= 1);
  assert.ok(s.allWatts > s.watts);
});
