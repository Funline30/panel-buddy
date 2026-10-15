import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATEGORIES, catById, ampsRange, wattsRange, circuitTag, CATALOG_NOTE } from '../src/lib/catalog.js';
import { searchCatalog, searchHome, matchCatalog, queryTokens, editDistance, lookupUrl, projectedPct, wattsFromAmps } from '../src/lib/devicesearch.js';
import { seedData } from '../src/lib/seed.js';
import { loadSummary } from '../src/lib/load.js';

const top = (q) => (searchCatalog(q)[0] || {}).entry?.id;

test('catalog: 250+ devices, every entry complete and sane', () => {
  assert.ok(CATALOG.length >= 250, `only ${CATALOG.length}`);
  const ids = new Set();
  for (const c of CATALOG) {
    assert.ok(!ids.has(c.id), 'duplicate id ' + c.id);
    ids.add(c.id);
    assert.ok(CATEGORIES.find((k) => k.id === c.cat), 'bad category ' + c.id);
    assert.ok(c.watts[0] > 0 && c.watts[0] <= c.watts[1], 'watts range ' + c.id);
    assert.ok(c.typical >= c.watts[0] && c.typical <= c.watts[1], 'typical outside range ' + c.id);
    assert.ok([120, 240].includes(c.volts), 'volts ' + c.id);
    assert.ok(c.note && c.note.length > 10, 'circuit note ' + c.id);
    if (c.surge) assert.ok(c.surge[0] <= c.surge[1] && c.surge[0] >= c.watts[0], 'surge ' + c.id);
    // a plain 120V outlet tops out around 1,920W (16A continuous on 20A); bigger needs 240V
    if (c.volts === 120 && !/rv|camper/i.test(c.name)) assert.ok(c.watts[1] <= 2800, 'too big for 120V ' + c.id);
  }
  assert.match(CATALOG_NOTE, /nameplate/);
});

test('catalog: covers the asked-for household, farm and medical items', () => {
  for (const q of ['microwave', 'air fryer', 'toaster oven', 'instant pot', 'coffee maker', 'fridge', 'chest freezer', 'dishwasher', 'disposal', 'electric range', 'kettle',
    'washer', 'electric dryer', 'gas dryer', 'space heater', 'window ac', 'mini split', 'dehumidifier', 'furnace', 'heat pump', 'hair dryer', 'curling iron', 'bath fan',
    'heated towel rack', '65 inch tv', 'ps5', 'xbox', 'gaming pc', 'monitor', 'soundbar', 'shop vac', 'table saw', 'compressor', 'welder', 'ev charger', 'battery charger',
    'well pump', 'stock tank heater', 'heat lamp', 'chick brooder', 'electric fence', 'pool pump', 'hot tub', 'cpap', 'oxygen concentrator', 'phone charger', 'lamp']) {
    assert.ok(searchCatalog(q).length, 'no result for ' + q);
  }
});

test('catalog search: synonyms and misspellings are forgiven', () => {
  assert.equal(top('fridge'), 'refrigerator');
  assert.equal(top('refridgerator'), 'refrigerator');
  assert.equal(top('air frier'), 'air-fryer');
  assert.equal(top('airfryer'), 'air-fryer');
  assert.equal(top('space heator'), 'space-heater');
  assert.equal(top('crockpot'), 'slow-cooker-crock-pot');
  assert.equal(top('instapot'), 'instant-pot-pressure-cooker');
  assert.equal(top('vaccum'), 'vacuum-upright');
  assert.equal(top('dehumidifer'), 'dehumidifier');
  assert.equal(top('ps5'), 'playstation-5');
  assert.equal(top('kettle'), 'electric-kettle');
  assert.equal(top('microwave'), 'microwave');
  assert.equal(top('sawzall'), 'reciprocating-saw');
  assert.equal(top('tank deicer'), 'stock-tank-heater-deicer');
  assert.ok(searchCatalog('micro').some((h) => h.entry.id === 'microwave'), 'type-ahead prefix');
  assert.deepEqual(searchCatalog('xyzzyq'), []);
  const partial = searchCatalog('Ninja Foodi XL Pro grill');
  assert.ok(partial.length && partial[0].partial, 'brand + model falls back to closest matches');
  assert.deepEqual(searchCatalog(''), []);
});

test('catalog search: browse a category with no query', () => {
  const farm = searchCatalog('', { cat: 'farm' });
  assert.ok(farm.length >= 15);
  assert.ok(farm.every((h) => h.entry.cat === 'farm'));
});

test('query words like "where", "plugged", "watts" are ignored', () => {
  assert.deepEqual(queryTokens("Where's the fridge plugged in?"), ['fridge']);
  assert.deepEqual(queryTokens('how many watts does a 65" TV use'), ['65', 'tv']);
  assert.equal(editDistance('heator', 'heater'), 1);
  assert.equal(editDistance('fryer', 'fyrer'), 1);
});

test('amps text and circuit tags', () => {
  const sh = catById('space-heater');
  assert.equal(wattsRange(sh), '~750-1,500W');
  assert.equal(ampsRange(sh), '~6.3-12.5A at 120V');
  assert.equal(circuitTag(sh), 'Own circuit');
  assert.equal(ampsRange(catById('electric-range-stove')), '~33-50A at 240V');
  assert.equal(circuitTag(catById('electric-dryer')), '240V');
  assert.equal(ampsRange(catById('led-bulb')), 'under 1A at 120V');
  assert.ok(catById('refrigerator').surge, 'fridge has a startup surge');
  assert.match(catById('electric-dryer').note, /240V dedicated/);
});

test('label -> catalog matching for user data', () => {
  assert.equal(matchCatalog('Refrigerator (running)').id, 'refrigerator');
  assert.equal(matchCatalog('Space heater').id, 'space-heater');
  assert.equal(matchCatalog('Microwave').id, 'microwave');
  assert.equal(matchCatalog('Kitchen counter left'), null);
});

function sample() {
  const d = seedData();
  const H = 'h_sample';
  return { breakers: d.breakers.filter((b) => b.homeId === H), devices: d.devices.filter((x) => x.homeId === H), panels: d.panels.filter((p) => p.homeId === H) };
}

test("home search: \"where's the fridge plugged in\" finds the user's own fridge first", () => {
  const data = sample();
  const res = searchHome("where's the fridge plugged in", data);
  assert.ok(res.length, 'found something');
  const first = res[0];
  const label = first.kind === 'load' ? first.load.name : first.item.label || first.item.name;
  assert.match(label, /fridge|refrigerator/i);
});

test('home search: loads listed on outlets/breakers show which breaker they are on', () => {
  const data = sample();
  // add a load the way the app does (on an outlet) and find it by a synonym
  const outlet = data.devices.find((d) => d.breakerId);
  outlet.loads = [...(outlet.loads || []), { name: 'Air fryer', watts: 1500, qty: 1 }];
  const res = searchHome('airfryer', data);
  const hit = res.find((r) => r.kind === 'load' && r.load.name === 'Air fryer');
  assert.ok(hit, 'load found');
  assert.equal(hit.device.id, outlet.id);
  assert.equal(hit.breaker.id, outlet.breakerId);
  assert.equal(res[0], hit, 'user data comes first');
});

test('home search: "breaker 8" still uses the exact breaker lookup', () => {
  const res = searchHome('breaker 8', sample());
  assert.ok(res.length && res[0].kind === 'breaker');
});

test('lookup link, projection and amps -> watts helpers', () => {
  const u = lookupUrl('Ninja AF101');
  assert.ok(u.startsWith('https://www.google.com/search?q='));
  assert.equal(decodeURIComponent(u.split('q=')[1]), '"Ninja AF101" watts amps nameplate specs');
  assert.equal(wattsFromAmps(5), 600);
  assert.equal(wattsFromAmps(24, 240), 5760);
  assert.equal(wattsFromAmps(''), 0);
  const b = { id: 'x', amps: '20', poles: '1', loads: [{ name: 'TV', watts: 120, qty: 1 }] };
  const s = loadSummary(b, []);
  assert.equal(Math.round(projectedPct(s, 1500)), Math.round(((120 + 1500) / 120 / 20) * 100));
  assert.equal(projectedPct({ rating: 0 }, 100), null);
});
