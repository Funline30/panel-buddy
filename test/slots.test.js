import test from 'node:test';
import assert from 'node:assert/strict';
import { slotsFor, slotLabel, overlaps, planFor, snapSlot, coversText, findClash, clashText, stickerText, numberingOf, cellsFor } from '../src/lib/panel.js';
import { loadSummary } from '../src/lib/load.js';
import { seedData } from '../src/lib/seed.js';

const perBreaker = { layout: 'two', spaces: '40' }; // saved before the setting: 1 number per breaker
const perRow = { layout: 'two', spaces: '40', numbering: 'half' }; // sticker: 1/3, 5/7 | 2/4, 6/8
const nums = (btype, slot, p) => planFor(btype, slot, p).map((x) => slotsFor(x, p));

test('numbering setting: missing = 1 number per breaker (old panels unchanged)', () => {
  assert.equal(numberingOf(perBreaker), 'space');
  assert.equal(numberingOf({}), 'space');
  assert.equal(numberingOf(perRow), 'half');
});

test('1 number per breaker: single, double, tandem', () => {
  assert.deepEqual(nums('single', 5, perBreaker), [[5]]);
  assert.equal(coversText('single', 5, perBreaker), 'Space 5 · one circuit');
  assert.deepEqual(nums('double', 5, perBreaker), [[5, 7]]);
  assert.equal(coversText('double', 5, perBreaker), 'Covers 5/7 · one 240V circuit');
  assert.deepEqual(nums('tandem', 6, perBreaker), [[6], [6]]);
  assert.equal(coversText('tandem', 6, perBreaker), '6A and 6B · 2 circuits, one breaker');
  assert.equal(snapSlot('double', 7, perBreaker), 7); // no snapping on this style
});

test('2 numbers per row: single fills the row (1/3), double spans 2 rows (5–11), tandem = 2 and 4', () => {
  assert.deepEqual(nums('single', 1, perRow), [[1, 3]]);
  assert.equal(coversText('single', 1, perRow), 'Covers 1/3 · one circuit');
  // Caleb's dryer: double-pole at 5 covers 5, 7, 9, 11 as ONE circuit
  assert.deepEqual(nums('double', 5, perRow), [[5, 7, 9, 11]]);
  assert.equal(coversText('double', 5, perRow), 'Covers 5–11 · one 240V circuit');
  assert.equal(coversText('double', 10, perRow), 'Covers 10–16 · one 240V circuit'); // range
  assert.equal(coversText('double', 18, perRow), 'Covers 18–24 · one 240V circuit'); // water heater
  // tandem at 2: two separate circuits, 2 and 4, linked as one breaker
  const tan = planFor('tandem', 2, perRow);
  assert.deepEqual(tan.map((p) => slotsFor(p, perRow)), [[2], [4]]);
  assert.deepEqual(tan.map((p) => p.size), ['half', 'half']);
  assert.equal(coversText('tandem', 2, perRow), '2 and 4 · 2 circuits, one breaker');
  // quad at 13: 13, 15–17 (240V), 19
  assert.equal(coversText('quad', 13, perRow), '13, 15–17 (240V) and 19 · 3 circuits');
});

test('2 numbers per row: typing the bottom number of a row snaps to the row', () => {
  assert.equal(snapSlot('double', 7, perRow), 5);
  assert.equal(coversText('double', 7, perRow), 'Covers 5–11 · one 240V circuit');
  assert.equal(snapSlot('single', 3, perRow), 1);
  assert.equal(snapSlot('tandem', 4, perRow), 2);
  assert.equal(snapSlot('single', 9, perRow), 9);
  // a full-size breaker already saved at a bottom number draws in its row
  assert.deepEqual(slotsFor({ slot: '3', poles: '1' }, perRow), [1, 3]);
  assert.equal(cellsFor({ slot: '7', poles: '2' }, perRow).start, 2);
  // one-column panels step by 1
  const one = { layout: 'one', spaces: '12', numbering: 'half' };
  assert.equal(snapSlot('double', 2, one), 1);
  assert.deepEqual(nums('double', 1, one), [[1, 2, 3, 4]]);
});

test('overlap: friendly message, tandem halves never clash with each other', () => {
  const dryer = { slot: '5', poles: '2', label: 'Dryer', amps: '30' };
  assert.ok(overlaps(dryer, { slot: '9', poles: '1' }, perRow)); // 9/11 is inside 5–11
  assert.ok(!overlaps(dryer, { slot: '13', poles: '1' }, perRow));
  assert.ok(!overlaps(dryer, { slot: '6', poles: '2' }, perRow)); // other side
  const c = findClash(planFor('single', 9, perRow), [dryer], perRow);
  assert.ok(c);
  assert.equal(clashText(c, perRow), '9/11 runs into 5–11 DRYER. Pick another number, or edit that breaker first.');
  const [a, b] = planFor('tandem', 2, perRow);
  assert.ok(!overlaps(a, b, perRow));
  assert.equal(findClash(planFor('tandem', 2, perRow), [dryer], perRow), null);
  // 1 number per breaker: double at 5 (5/7) runs into a single at 7
  assert.ok(findClash(planFor('double', 5, perBreaker), [{ slot: '7', poles: '1' }], perBreaker));
});

test('sticker text reads like the panel label: "5–11 DRYER 30A"', () => {
  assert.equal(stickerText({ slot: '5', poles: '2', label: 'Dryer', amps: '30' }, perRow), '5–11 DRYER 30A');
  assert.equal(stickerText({ slot: '1', poles: '1', label: 'Gen #4', amps: '15' }, perRow), '1/3 GEN #4 15A');
  assert.equal(stickerText({ slot: '2', size: 'half', half: 'A', poles: '1', label: 'Washer', amps: '20' }, perRow), '2 WASHER 20A');
  assert.equal(stickerText({ slot: '5', poles: '2', label: 'Dryer', amps: '30' }, perBreaker), '5/7 DRYER 30A');
  assert.equal(stickerText({ slot: '26', poles: '1', label: '', amps: 'other', ampsOther: '25' }, perRow), '26/28 25A');
});

test('240V double-pole: capacity is the amp rating (not doubled), watts / 240 for amps', () => {
  const dryer = { slot: '5', poles: '2', btype: 'double', amps: '30', loads: [{ name: 'Dryer', watts: 5000, qty: 1 }] };
  const s = loadSummary(dryer);
  assert.equal(s.rating, 30);
  assert.equal(s.volts, 240);
  assert.equal(Math.round(s.amps * 10) / 10, 20.8);
  assert.equal(Math.round(s.pct), 69);
  assert.equal(s.level, 'ok');
  // On/Off still works on a 240V breaker
  const off = loadSummary({ ...dryer, loads: [{ name: 'Dryer', watts: 5000, qty: 1, on: false }] });
  assert.equal(off.amps, 0);
  assert.equal(Math.round(off.allPct), 69);
  // the quad's middle 2-pole is 240V too
  assert.equal(loadSummary({ slot: '15', size: 'half', half: 'B', poles: '2', amps: '30', loads: [{ name: 'x', watts: 2400 }] }).amps, 10);
});

test('example panel matches the real 2-per-row panel with no overlaps', () => {
  const data = seedData();
  const p = data.panels.find((x) => x.id === 'p_rows');
  const bs = data.breakers.filter((b) => b.panelId === p.id);
  const lab = (l) => slotLabel(bs.find((b) => b.label === l), p);
  assert.equal(lab('Gen #4'), '1/3');
  assert.equal(lab('Dryer'), '5–11');
  assert.equal(lab('GFI #8 Bath'), '13');
  assert.equal(lab('Furnace'), '15–17');
  assert.equal(lab('Dishwasher'), '19');
  assert.equal(lab('Furnace heat'), '21–27');
  assert.equal(lab('GFI #1 Kitchen'), '2');
  assert.equal(lab('#2 Dining room'), '4');
  assert.equal(lab('Range'), '10–16');
  assert.equal(lab('Water heater'), '18–24');
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) assert.ok(!overlaps(bs[i], bs[j], p), `${bs[i].label} / ${bs[j].label}`);
});
