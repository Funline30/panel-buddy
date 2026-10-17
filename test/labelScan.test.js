import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLabel, mergeScans, cleanForOcr, otsu, toBulkRows, fixNumberToken, splitHints, keywordFor, nextScanSlot, spacesNeeded, toGray, stretchContrast, scanSize } from '../src/lib/labelScan.js';
import { planBulk } from '../src/lib/bulk.js';

const at = (r, slot) => r.circuits.find((c) => c.slot === slot);

test('label scan: clean printed directory, one entry per line, amps + 2-pole appliances', () => {
  const r = parseLabel(`CIRCUIT DIRECTORY
1 KITCHEN COUNTER 20A
2 DISHWASHER
3 DRYER 30A
5 DRYER
4 MICROWAVE
6 REFRIG
7 MASTER BDRM
8 BATH GFCI
9 A/C
11 A/C
10 LIVING RM LTS
12 GARAGE RECEPTS`);
  assert.equal(r.quality, 'good');
  assert.deepEqual(r.skipped, ['CIRCUIT DIRECTORY']);
  assert.equal(at(r, 1).label, 'Kitchen counter');
  assert.equal(at(r, 1).amps, '20');
  assert.equal(at(r, 1).ampsFound, true);
  assert.equal(at(r, 3).poles, '2'); // DRYER on 3 and 5 = one 2-pole
  assert.equal(at(r, 3).type, 'appliance');
  assert.ok(!at(r, 5), '5 is the second half of the dryer');
  assert.equal(at(r, 9).poles, '2');
  assert.equal(at(r, 9).type, 'hvac');
  assert.equal(at(r, 7).label, 'Master bedroom');
  assert.equal(at(r, 10).label, 'Living room lights');
  assert.equal(at(r, 10).amps, '15');
  assert.equal(at(r, 12).label, 'Garage outlets');
  assert.equal(at(r, 8).label, 'Bath GFCI');
});

test('label scan: number styles "1.", "#3 -", "No. 4", "5)", "6 -"', () => {
  const r = parseLabel('1. Kitchen\n2. Range\n#3 - Bath\nNo. 4 Laundry\n5) Bedroom 2\n6 - Hall lights');
  assert.deepEqual(r.circuits.map((c) => [c.slot, c.label]), [[1, 'Kitchen'], [2, 'Range'], [3, 'Bath'], [4, 'Laundry'], [5, 'Bedroom 2'], [6, 'Hall lights']]);
  // Range wants 2 spaces but 4 is Laundry: stays 1-pole, flagged so the person can check
  assert.equal(at(r, 2).poles, '1');
  assert.equal(at(r, 2).maybe2, true);
});

test('label scan: two-column directory read across (odd | even), numbers inside labels ignored', () => {
  const r = parseLabel(`1 KITCHEN 2 RANGE 50A
3 DISHWASHER 4 RANGE
5 BEDROOM 2 6 WASHER
7 BATH | 8 DRYER
9 SMOKE DETECTORS 10 DRYER
11 SPARE 12 SPACE`);
  assert.equal(r.twoColumn, true);
  assert.equal(at(r, 2).label, 'Range');
  assert.equal(at(r, 2).poles, '2');
  assert.equal(at(r, 2).amps, '50');
  assert.ok(!at(r, 4));
  assert.equal(at(r, 5).label, 'Bedroom 2');
  assert.equal(at(r, 6).label, 'Washer');
  assert.equal(at(r, 8).poles, '2');
  assert.equal(at(r, 9).type, 'smoke');
  assert.equal(at(r, 11).label, 'Spare');
  assert.ok(!at(r, 12), 'SPACE = empty spot, no breaker');
});

test('label scan: messy OCR (l for 1, B for 8, lO for 10, junk), a missing number gets a guess', () => {
  const r = parseLabel(`CIRCUIT D1RECTORY ___
l  Kitchen ctr
2 Disposal
3. Bath rm
4 Laundry
Hallway
6 Garage
B Furnace
lO Water heater 30A
12 EV`);
  assert.equal(at(r, 1).label, 'Kitchen ctr');
  assert.equal(at(r, 5).label, 'Hallway');
  assert.equal(at(r, 5).guessed, true);
  assert.equal(at(r, 8).label, 'Furnace');
  assert.equal(at(r, 10).label, 'Water heater');
  assert.equal(at(r, 10).amps, '30');
  assert.equal(at(r, 10).type, 'waterheater');
  assert.equal(at(r, 12).type, 'ev');
  assert.equal(at(r, 3).label, 'Bath room');
});

test('label scan: no numbers at all -> numbered in order, all marked as guesses', () => {
  const r = parseLabel('Kitchen\nDining room\nBath\nBedroom 1');
  assert.deepEqual(r.circuits.map((c) => c.slot), [1, 2, 3, 4]);
  assert.ok(r.circuits.every((c) => c.guessed));
});

test('label scan: 1/3 pair = 2-pole, "2P" and "240V" hints', () => {
  const r = parseLabel('1/3 Range 40A\n2 Furnace\n4 Well 2P\n5 Shop 240V\n6 Lights');
  assert.equal(at(r, 1).poles, '2');
  assert.equal(at(r, 1).amps, '40');
  assert.equal(at(r, 4).poles, '1'); // 6 is taken, so not a 2-pole here
  assert.equal(at(r, 5).poles, '2');
  assert.equal(at(r, 5).label, 'Shop');
});

test('label scan: two "KITCHEN COUNTER 20A" lines stay two circuits', () => {
  const r = parseLabel('1 KITCHEN COUNTER 20A\n2 DISHWASHER\n3 KITCHEN COUNTER 20A\n4 MICROWAVE');
  assert.equal(at(r, 1).poles, '1');
  assert.equal(at(r, 3).label, 'Kitchen counter');
});

test('label scan: little or nothing found -> quality "little" (screen offers manual entry)', () => {
  assert.equal(parseLabel('').quality, 'little');
  assert.equal(parseLabel('~~ ### ..\n%% @').circuits.length, 0);
  assert.equal(parseLabel('SQUARE D HOMELINE\nLOAD CENTER').quality, 'little');
});

test('label scan: helpers', () => {
  assert.equal(fixNumberToken('l'), '1');
  assert.equal(fixNumberToken('1O'), '10');
  assert.equal(fixNumberToken('lO'), '10');
  assert.equal(fixNumberToken('B'), '8');
  assert.equal(fixNumberToken('Kitchen'), 'Kitchen');
  assert.deepEqual(splitHints('Dryer 30A 2P'), { label: 'Dryer', amps: '30', poles: '2' });
  assert.deepEqual(splitHints('A/C'), { label: 'A/C', amps: '', poles: '' });
  assert.equal(keywordFor('KIT DISHWASHER').type, 'appliance');
  assert.equal(keywordFor('Washer').name, 'Washer');
  assert.equal(keywordFor('Bedroom'), null);
  assert.equal(nextScanSlot([{ slot: 1, poles: '1' }, { slot: 2, poles: '2' }, { slot: 3, poles: '1' }]), 5);
  assert.equal(spacesNeeded([{ slot: 1, poles: '1' }, { slot: 22, poles: '2' }]), 24);
  assert.deepEqual(Array.from(toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))), [255, 0]);
  const st = stretchContrast(new Uint8ClampedArray([100, 110, 120, 130, 140, 150]));
  assert.equal(st[0], 0);
  assert.equal(st[5], 255);
  assert.deepEqual(scanSize(4032, 3024), { w: 1800, h: 1350 });
});

test('label scan: rows build real breakers through the same bulk planner as manual entry', () => {
  const r = parseLabel('1 Kitchen 20A\n2 Range 50A\n3 Bath\n5 Bedroom\n4 Range');
  const rows = toBulkRows(r.circuits);
  const panel = { id: 'p1', spaces: 20 };
  const res = planBulk(rows, panel, [], { homeId: 'h1', makeId: (() => { let i = 0; return () => 'b' + ++i; })() });
  assert.equal(res.ok, true);
  const all = res.rows.flatMap((x) => x.breakers);
  assert.equal(all.length, 4);
  const range = all.find((b) => b.label === 'Range');
  assert.equal(String(range.poles), '2');
  assert.equal(range.amps, '50');
  assert.equal(range.homeId, 'h1');
  assert.equal(range.panelId, 'p1');
});

test('label scan: real OCR of the demo label (2 reads merged) rebuilds all 24 spaces', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/label-ocr.json', import.meta.url), 'utf8'));
  const r = mergeScans(parseLabel(fx.psm4), parseLabel(fx.psm11));
  const want = { 1: 'Kitchen counter', 2: 'Dishwasher', 3: 'Kitchen counter', 4: 'Microwave', 5: 'Refrigerator', 6: 'Disposal', 7: 'Dining room', 8: 'Laundry / washer', 9: 'Dryer', 10: 'Bath GFCI', 12: 'Master bedroom', 13: 'Range', 14: 'Bedroom 2', 16: 'Bedroom 3', 17: 'A/C condenser', 18: 'Living room lights', 20: 'Garage outlets', 21: 'Water heater', 22: 'Exterior lights', 24: 'Smoke detectors' };
  assert.deepEqual(Object.fromEntries(r.circuits.map((c) => [c.slot, c.label])), want);
  for (const n of [9, 13, 17, 21]) assert.equal(at(r, n).poles, '2', `${n} is a 2-pole`);
  assert.equal(at(r, 13).amps, '50');
  assert.equal(at(r, 9).amps, '30');
  assert.equal(r.quality, 'good');
});

test('label scan: OCR slips: "S0A" amps, a lost digit (…9, 10, 1, 13…), "GFC)"', () => {
  const r = parseLabel('9 DRYER 30A\n10 BATH GFC)\n1 DRYER\n13 RANGE S0A\n14 BEDROOM');
  assert.equal(at(r, 9).poles, '2'); // 1 -> 11, the second half of the dryer
  assert.equal(at(r, 13).amps, '50');
  assert.equal(at(r, 10).label, 'Bath GFCI');
});

test('label scan: table lines are removed before reading, letters kept', () => {
  const w = 120, h = 60;
  const g = new Uint8ClampedArray(w * h).fill(230);
  for (let x = 0; x < w; x++) g[30 * w + x] = 20; // a long grid line
  for (let y = 10; y < 20; y++) g[y * w + 10] = 20; // a short letter stroke
  assert.ok(otsu(g) >= 20 && otsu(g) < 230);
  const out = cleanForOcr(g, w, h);
  assert.equal(out[30 * w + 60], 255, 'grid line gone');
  assert.equal(out[15 * w + 10], 0, 'letter stroke kept');
});
