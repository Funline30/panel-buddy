import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSummary, voltsFor, totalWatts } from '../src/lib/load.js';
import { search, parseBreakerQuery, breakerSlots } from '../src/lib/search.js';
import { seedData } from '../src/lib/seed.js';
import { breakersCsv, devicesCsv } from '../src/lib/csv.js';
import { readFileSync } from 'node:fs';

test('load math: amps = watts / 120 single pole, / 240 double pole', () => {
  assert.equal(voltsFor('1'), 120);
  assert.equal(voltsFor('2'), 240);
  const s = loadSummary({ poles: '1', amps: '15', loads: [{ name: 'Space heater', watts: 1500, qty: 1 }] });
  assert.equal(s.amps, 12.5);
  assert.equal(Math.round(s.pct), 83);
  assert.equal(s.level, 'warn'); // 80%+
  const d = loadSummary({ poles: '2', amps: '30', loads: [{ name: 'Dryer', watts: 4800, qty: 1 }] });
  assert.equal(d.amps, 20);
  assert.equal(d.level, 'ok');
  const over = loadSummary({ poles: '1', amps: '15', loads: [{ name: 'Heater', watts: 1500, qty: 2 }] });
  assert.equal(over.amps, 25);
  assert.equal(over.level, 'over');
  assert.equal(loadSummary({ poles: '1', amps: '20', loads: [] }).level, 'none');
  assert.equal(loadSummary({ poles: '1', amps: 'other', ampsOther: '25', loads: [{ name: 'x', watts: 3000 }] }).rating, 25);
  assert.equal(totalWatts([{ watts: 10, qty: 6 }, { watts: 150 }]), 210);
});

test('search: "breaker 7" style queries and words', () => {
  const data = seedData();
  assert.equal(parseBreakerQuery("what's on breaker 9"), 9);
  assert.equal(parseBreakerQuery('#11'), 11);
  assert.equal(parseBreakerQuery('bathroom fan'), null);
  const r9 = search("what's on breaker 9", data);
  assert.equal(r9[0].kind, 'breaker');
  assert.equal(r9[0].item.id, 'b9');
  assert.ok(r9.some((r) => r.kind === 'device' && r.item.room === 'Master closet'));
  // double pole 1/3 found by its second slot
  assert.equal(search('breaker 3', data)[0].item.id, 'b1');
  const fan = search('which breaker is the bathroom fan', data);
  assert.ok(fan.length > 0);
  assert.equal(fan[0].item.id, 'd8');
  assert.equal(fan[0].breaker.id, 'b15');
  assert.ok(search('gfci', data).some((r) => r.item.id === 'd5'));
});

test('sample home matches the brief and is internally consistent', () => {
  const data = seedData();
  const ids = new Set(data.breakers.map((b) => b.id));
  for (const d of data.devices) assert.ok(!d.breakerId || ids.has(d.breakerId), `device ${d.id} points at a real breaker`);
  const used = new Map();
  for (const b of data.breakers) for (const s of breakerSlots(b)) {
    assert.ok(!used.has(s), `slot ${s} used twice (${b.id} and ${used.get(s)})`);
    used.set(s, b.id);
  }
  const master = data.breakers.find((b) => b.id === 'b9');
  assert.deepEqual(master.rooms, ['Master bedroom', 'Master bath', 'Master closet']);
  assert.ok(data.devices.find((d) => d.id === 'd5').gfci === 'gfci_outlet');
  assert.ok(data.devices.filter((d) => d.gfci === 'downstream' && d.room === 'Dining room').length >= 2);
  assert.equal(data.devices.find((d) => d.id === 'd8').status, 'dead');
  const office = data.breakers.find((b) => b.id === 'b11');
  for (const n of ['PC', '3D printer', 'WiFi']) assert.ok(office.loads.some((l) => l.name.includes(n)), n);
});

test('CSV export has a header and one row per item', () => {
  const data = seedData();
  const b = breakersCsv(data).trim().split('\n');
  const d = devicesCsv(data).trim().split('\n');
  assert.equal(b.length, data.breakers.length + 1);
  assert.equal(d.length, data.devices.length + 1);
  assert.match(b[0], /^Panel,Slot,Poles,Amps,Label/);
});

test('setup page carries the exact firestore.rules text', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../public/setup.html', import.meta.url), 'utf8');
  const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
  const pre = unescape(page.match(/<pre id="rulesText">([\s\S]*?)<\/pre>/)[1]);
  assert.equal(pre, rules);
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.doesNotMatch(rules, /allow read, write: if true/);
});

test('firebase config ships with placeholders (demo mode until filled in)', () => {
  const cfg = readFileSync(new URL('../src/firebase-config.js', import.meta.url), 'utf8');
  assert.match(cfg, /PASTE_API_KEY_HERE/);
  assert.match(cfg, /VITE_FIREBASE_API_KEY/);
});
