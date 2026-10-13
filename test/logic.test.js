import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSummary, voltsFor, totalWatts, shoreSummary } from '../src/lib/load.js';
import { layoutOf, slotsFor, slotLabel, panelSpaces } from '../src/lib/panel.js';
import { search, parseBreakerQuery, breakerSlots } from '../src/lib/search.js';
import { seedData, seedPro } from '../src/lib/seed.js';
import { breakersCsv, devicesCsv, fusesCsv } from '../src/lib/csv.js';
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
  for (const b of data.breakers) {
    const layout = layoutOf(data.panels.find((p) => p.id === b.panelId));
    for (const s of slotsFor(b, layout)) {
      const k = b.panelId + ':' + s;
      assert.ok(!used.has(k), `slot ${k} used twice (${b.id} and ${used.get(k)})`);
      used.set(k, b.id);
    }
  }
  for (const b of data.breakers) {
    const p = data.panels.find((x) => x.id === b.panelId);
    assert.ok(p && p.homeId === b.homeId, `breaker ${b.id} is in a panel of its own home`);
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

test('firebase config is filled in for the panel-buddy project (env vars still override)', () => {
  const cfg = readFileSync(new URL('../src/firebase-config.js', import.meta.url), 'utf8');
  assert.doesNotMatch(cfg, /PASTE_API_KEY_HERE/);
  assert.match(cfg, /panel-buddy\.firebaseapp\.com/);
  assert.match(cfg, /VITE_FIREBASE_API_KEY/);
});

test('panel layouts: two columns (N, N+2) vs one column RV (N, N+1)', () => {
  assert.equal(layoutOf({ type: 'main' }), 'two');
  assert.equal(layoutOf({ type: 'rv' }), 'one');
  assert.equal(layoutOf({ type: 'rv', layout: 'two' }), 'two');
  assert.deepEqual(slotsFor({ slot: '1', poles: '2' }, 'two'), [1, 3]);
  assert.deepEqual(slotsFor({ slot: '1', poles: '2' }, 'one'), [1, 2]);
  assert.equal(slotLabel({ slot: '5', poles: '2' }, 'two'), '5/7');
  assert.equal(panelSpaces({ spaces: 'other', spacesOther: '10' }), 10);
  assert.equal(panelSpaces({ spaces: '6' }), 6);
});

test('RV shore power: 30A = 30A at 120V; 50A = 50A per leg', () => {
  const data = seedData();
  const rv = data.panels.find((p) => p.type === 'rv');
  const rvBreakers = data.breakers.filter((b) => b.panelId === rv.id);
  const s30 = shoreSummary(rv, rvBreakers);
  assert.equal(s30.legs.length, 1);
  assert.equal(s30.legs[0].cap, 30);
  assert.equal(Math.round(s30.legs[0].amps * 10) / 10, Math.round(((1500 + 1200 + 1400) / 120) * 10) / 10);
  assert.equal(s30.legs[0].level, 'over');
  const p50 = { ...rv, shorePower: '50' };
  const bs = [
    { poles: '1', leg: '1', loads: [{ watts: 1200 }] },
    { poles: '1', leg: '2', loads: [{ watts: 2400 }] },
    { poles: '2', loads: [{ watts: 2400 }] },
    { poles: '1', loads: [{ watts: 600 }] },
  ];
  const s50 = shoreSummary(p50, bs);
  assert.equal(s50.legs.length, 2);
  assert.equal(s50.legs[0].amps, 10 + 10);
  assert.equal(s50.legs[1].amps, 20 + 10);
  assert.equal(s50.legs[0].cap, 50);
  assert.equal(s50.unassigned, 5);
  assert.equal(shoreSummary({ type: 'rv' }, bs), null);
});

test('RV sample: 12V fuses, RV areas, fuse search, fuse CSV', () => {
  const data = seedData();
  const rv = data.panels.find((p) => p.type === 'rv');
  assert.ok(rv.fuses.length >= 5);
  assert.ok(rv.fuses.some((f) => f.powers === 'Water pump'));
  const hits = search('water pump', data);
  assert.equal(hits[0].kind, 'fuse');
  assert.equal(search('fuse 3', data)[0].item.powers, 'Water pump');
  assert.equal(fusesCsv(data).trim().split('\n').length, rv.fuses.length + 1);
  assert.equal(search('breaker 2', { ...data, breakers: data.breakers.filter((b) => b.panelId === rv.id) })[0].item.label, 'Microwave');
});

test('Tech / Pro sample customers link to their own properties', () => {
  const pro = seedPro();
  assert.ok(pro.customers.length >= 2);
  for (const h of pro.homes) assert.ok(pro.customers.some((c) => c.id === h.customerId));
  for (const b of pro.breakers) assert.ok(pro.panels.some((p) => p.id === b.panelId));
  for (const c of pro.customers) assert.ok(Array.isArray(c.visits));
});

test('rules: share docs are get-only for the public, owner-only writes', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/shares\/\{token\}[\s\S]*?allow get: if true;[\s\S]*?allow list: if false;/);
  assert.match(rules, /match \/sharedPanels\/\{panelId\}[\s\S]*?allow list: if false;/);
  assert.match(rules, /'customers', 'settings'/);
});

test('power pole service uses the main breaker size on two legs', () => {
  const panel = { type: 'rv', shorePower: 'pole', mainAmps: '200' };
  const s = shoreSummary(panel, [{ poles: '2', loads: [{ watts: 4800 }] }]);
  assert.equal(s.legs.length, 2);
  assert.equal(s.legs[0].cap, 200);
  assert.equal(s.legs[0].amps, 20);
});
