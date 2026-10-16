import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readings, loadReading, nowOverride, projectLoad, shoreSummary, NOW_HOURS } from '../src/lib/load.js';
import { habitOf, guessHabit, catalogHabit, useShare, USE_OPTIONS } from '../src/lib/habits.js';
import { setNow, clearNow, nowState, updateLoad, toggleLoad } from '../src/lib/onoff.js';
import { CATALOG } from '../src/lib/catalog.js';
import { seedData } from '../src/lib/seed.js';

const T = Date.UTC(2026, 9, 16, 20, 0, 0);
const brk = (loads, extra = {}) => ({ id: 'b1', homeId: 'h', poles: '1', amps: '15', loads, ...extra });
const r1 = (n) => Math.round(n * 10) / 10;

test('use choices: Always 100%, Cycles ~45%, A few hours ~15%, Now and then ~5%', () => {
  assert.deepEqual(USE_OPTIONS.map((o) => o.id), ['always', 'cycles', 'hours', 'sometimes']);
  assert.equal(useShare('always'), 1);
  assert.ok(useShare('cycles') >= 0.4 && useShare('cycles') <= 0.5);
  assert.equal(useShare('hours'), 0.15);
  assert.equal(useShare('sometimes'), 0.05);
  assert.equal(useShare('nonsense'), 0.15); // unknown -> A few hours a day
});

test('catalog defaults: fridge cycles, TV a few hours, hair dryer now and then, router always', () => {
  assert.equal(guessHabit('Refrigerator').use, 'cycles');
  assert.equal(guessHabit('Fridge').idle, 5);
  assert.equal(guessHabit('TV').use, 'hours');
  assert.equal(guessHabit('TV').idle, 0.5);
  assert.equal(guessHabit('Hair dryer').use, 'sometimes');
  assert.equal(guessHabit('Window AC').use, 'cycles');
  assert.equal(guessHabit('Window AC').idle, 2);
  assert.equal(guessHabit('MSI laptop charger').idle, 1);
  assert.equal(guessHabit('WiFi router / modem').use, 'always');
  assert.equal(guessHabit('Water heater (electric)').use, 'hours'); // not caught by the "heater" rule
  assert.equal(guessHabit('Porch light').use, 'hours');
  const g = guessHabit('Kitchen counter left zzz');
  assert.equal(g.idle, 0);
  // every catalog device gets a valid default
  for (const c of CATALOG) assert.ok(USE_OPTIONS.some((o) => o.id === catalogHabit(c).use), c.id);
});

test('habitOf: missing fields use estimates; own values win; idle never above running', () => {
  const tv = habitOf({ name: 'TV', watts: 120 });
  assert.deepEqual([tv.run, tv.idle, tv.use, tv.idleIsGuess, tv.useIsGuess], [120, 0.5, 'hours', true, true]);
  const mine = habitOf({ name: 'TV', watts: 120, idleW: 3, use: 'always' });
  assert.equal(mine.use, 'always');
  assert.equal(mine.idle, 120); // Always = never idles
  assert.equal(habitOf({ name: 'TV', watts: 120, idleW: 0 }).idle, 0); // 0 is a real value
  assert.equal(habitOf({ name: 'TV', watts: 120, idleW: '' }).idle, 0.5); // blank = estimate
  assert.equal(habitOf({ name: 'Thing', watts: 2, idleW: 50 }).idle, 2);
  assert.equal(habitOf({ name: 'Unknown gizmo zzz', watts: 100 }).idle, 0);
  assert.equal(habitOf({ watts: 'abc' }).run, 0);
});

test('loadReading: idle / typical / peak math with qty', () => {
  const fridge = { name: 'Refrigerator', watts: 600, qty: 1 };
  assert.equal(loadReading(fridge, 'peak'), 600);
  assert.equal(loadReading(fridge, 'idle'), 5);
  assert.equal(r1(loadReading(fridge, 'typical')), r1(600 * 0.45 + 5 * 0.55));
  const bulbs = { name: 'LED bulb', watts: 10, qty: 4, use: 'always' };
  assert.equal(loadReading(bulbs, 'typical'), 40);
  assert.equal(loadReading(bulbs, 'idle'), 40);
  const hd = { name: 'Hair dryer', watts: 1500, qty: 2 };
  assert.equal(loadReading(hd, 'typical'), 1500 * 0.05 * 2);
  assert.equal(loadReading(null, 'typical'), 0);
});

test("readings: Caleb's living room (15A) - Typical is the main number, Peak the warning", () => {
  const d = seedData();
  const b = d.breakers.find((x) => x.id === 'b13');
  const s = readings(b, d.devices, { t: T });
  assert.equal(s.loadCount, 7);
  assert.equal(s.allWatts, 120 + 60 + 360 + 288 + 900 + 75 + 15); // everything running
  assert.equal(Math.round(s.allPct), 101);
  assert.equal(s.allLevel, 'over');
  assert.ok(s.pct > 20 && s.pct < 40, `typical ${s.pct}`);
  assert.equal(s.level, 'ok');
  assert.equal(s.watts, s.typWatts); // nobody touched a switch
  assert.ok(s.idleWatts > 0 && s.idleWatts < 10);
  assert.ok(s.idleWatts < s.watts && s.watts < s.allWatts);
  // the old on:false on the AC (no timestamp) is ignored: it counts at its Typical
  assert.equal(s.overrides, 0);
});

test('readings: 240V range uses 240V, 40A rating not doubled', () => {
  const d = seedData();
  const s = readings(d.breakers.find((x) => x.id === 'pr10'), d.devices, { t: T });
  assert.equal(s.volts, 240);
  assert.equal(s.rating, 40);
  assert.equal(s.allAmps, 24);
  assert.equal(Math.round(s.allPct), 60);
  assert.ok(s.amps < 2);
});

test('readings: nothing listed = none; all-zero watts listed = ok; no rating = 0%', () => {
  assert.equal(readings(brk([]), []).level, 'none');
  assert.equal(readings(brk([{ name: 'x', watts: 0 }]), []).level, 'ok');
  const nr = readings({ id: 'z', poles: '1', loads: [{ name: 'TV', watts: 100 }] }, []);
  assert.equal(nr.pct, 0);
  assert.equal(nr.rating, 0);
});

test('readings: outlet loads count once, on the right breaker', () => {
  const b = brk([{ name: 'Bulb', watts: 60, qty: 1, use: 'always' }]);
  const devices = [
    { id: 'd1', breakerId: 'b1', loads: [{ name: 'Heater', watts: 1500, qty: 1, use: 'sometimes' }] },
    { id: 'd2', breakerId: 'other', loads: [{ name: 'Fridge', watts: 400, qty: 1 }] },
  ];
  const s = readings(b, devices, { t: T });
  assert.equal(s.allWatts, 1560);
  assert.equal(s.watts, 60 + 75);
  assert.equal(s.parts.length, 1);
  assert.equal(s.parts[0].allWatts, 1500);
  assert.equal(s.ownAllWatts, 60);
});

test('"Right now" override: on = running, off = idle, expires by itself', () => {
  const ac = { name: 'Window AC', watts: 900, qty: 1 };
  const b = (l) => readings(brk([l]), [], { t: T });
  const typical = b(ac).watts;
  const on = { ...ac, on: true, nowAt: T - 60 * 1000 };
  assert.equal(nowOverride(on, T), 'on');
  assert.equal(b(on).watts, 900);
  assert.equal(b(on).typWatts, typical); // Typical still shown underneath
  assert.equal(b(on).overrides, 1);
  const off = { ...ac, on: false, nowAt: T - 60 * 1000 };
  assert.equal(b(off).watts, 2);
  const stale = { ...ac, on: true, nowAt: T - (NOW_HOURS + 1) * 3600 * 1000 };
  assert.equal(nowOverride(stale, T), null);
  assert.equal(b(stale).watts, typical);
  assert.equal(nowOverride({ ...ac, on: false }, T), null); // old switch data, no timestamp
});

test('setNow cycles Typical -> On now -> Off now -> Typical; clearNow resets a circuit', () => {
  const data = { breakers: [brk([{ name: 'TV', watts: 120 }])], devices: [{ id: 'd1', breakerId: 'b1', loads: [{ name: 'Lamp', watts: 60, on: true, nowAt: T }] }], homes: [] };
  const u1 = setNow(data, 'b:b1:0', undefined, T);
  assert.equal(nowState(u1.obj.loads[0], T), 'on');
  const d2 = { ...data, breakers: [u1.obj] };
  const u2 = setNow(d2, 'b:b1:0', undefined, T);
  assert.equal(nowState(u2.obj.loads[0], T), 'off');
  const u3 = setNow({ ...data, breakers: [u2.obj] }, 'b:b1:0', undefined, T);
  assert.equal(nowState(u3.obj.loads[0], T), 'auto');
  assert.equal('on' in u3.obj.loads[0], false);
  const ups = clearNow({ ...data, breakers: [u1.obj] }, 'b1');
  assert.equal(ups.length, 2);
  assert.ok(ups.every((u) => u.obj.loads.every((l) => !('nowAt' in l))));
  // the old switch now also stamps the time, so it acts as "Right now"
  assert.ok(toggleLoad(data, 'b:b1:0').obj.loads[0].nowAt > 0);
});

test('updateLoad saves running / idle / how much on, blank idle = back to estimate', () => {
  const data = { breakers: [brk([{ name: 'TV', watts: 120, idleW: 4 }])], devices: [], homes: [] };
  const u = updateLoad(data, 'b:b1:0', { watts: 150, idleW: null, use: 'always', note: '' });
  assert.deepEqual(u.obj.loads[0], { name: 'TV', watts: 150, use: 'always' });
});

test('search / move: projectLoad adds the new item at Typical, Peak beside it', () => {
  const s = readings(brk([{ name: 'TV', watts: 600, use: 'always' }]), [], { t: T }); // 5A = 33%
  const p = projectLoad(s, { name: 'Space heater', watts: 1500, use: 'cycles' }, T);
  assert.equal(Math.round(s.pct), 33);
  assert.equal(Math.round(p.pct), Math.round(33.33 + (1500 * 0.45) / 120 / 15 * 100));
  assert.equal(Math.round(p.peakPct), Math.round((2100 / 120 / 15) * 100));
});

test('shore power: mode main uses Typical', () => {
  const panel = { shorePower: '30' };
  const bs = [brk([{ name: 'Air conditioner', watts: 1500, qty: 1 }])];
  assert.equal(shoreSummary(panel, bs, []).legs[0].amps, 12.5); // older math unchanged
  assert.ok(shoreSummary(panel, bs, [], { mode: 'main' }).legs[0].amps < 6);
});
