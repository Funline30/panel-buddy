import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData } from '../src/lib/seed.js';
import { planBulk, isBlankRow, splitRooms, partsOf } from '../src/lib/bulk.js';
import { overlaps } from '../src/lib/panel.js';

let n = 0;
const makeId = () => 'x' + ++n;
const twoPerRow = { id: 'p', homeId: 'h', layout: 'two', numbering: 'half', spaces: '40' };
const perSpace = { id: 'q', homeId: 'h', layout: 'two', numbering: 'space', spaces: '24' };

test('bulk add: several rows -> breakers, sticker labels, tandem / quad parts', () => {
  const rows = [
    { slot: '26', btype: 'single', amps: '15', label: 'Master bedroom + bath + closet', rooms: 'Master bedroom, Master bath, Master closet' },
    { slot: '30', btype: 'single', amps: '15', label: "Daughter's room + Guest bath", rooms: "Daughter's room, Guest bath" },
    { slot: '10', btype: 'double', amps: '40', label: 'Range', rooms: 'Kitchen' },
    { slot: '2', btype: 'tandem', amps: '20', label: 'GFI #1 Kitchen', labels: ['#2 Dining room'], ampsList: ['20'] },
    { slot: '13', btype: 'quad', amps: '15', label: 'Bath', labels: ['Furnace', 'Dishwasher'], ampsList: ['30', '15'] },
    { slot: '', btype: 'single', amps: '15', label: '', rooms: '' },
  ];
  const res = planBulk(rows, twoPerRow, [], { homeId: 'h', makeId });
  assert.equal(res.ok, true, JSON.stringify(res.rows.map((r) => r.error)));
  assert.equal(res.count, 1 + 1 + 1 + 2 + 3);
  assert.equal(res.rows[5].blank, true);
  const [a, , range, tan, quad] = res.rows;
  assert.deepEqual(a.breakers[0].rooms, ['Master bedroom', 'Master bath', 'Master closet']);
  assert.equal(a.breakers[0].homeId, 'h');
  assert.equal(a.breakers[0].panelId, 'p');
  assert.equal(a.covers, 'Covers 26/28 · one circuit');
  assert.equal(range.breakers[0].poles, '2');
  assert.equal(range.covers, 'Covers 10–16 · one 240V circuit');
  assert.equal(tan.breakers.length, 2);
  assert.equal(tan.breakers[0].groupId, tan.breakers[1].groupId);
  assert.ok(tan.breakers[0].groupId);
  assert.deepEqual(tan.breakers.map((b) => b.label), ['GFI #1 Kitchen', '#2 Dining room']);
  assert.deepEqual(tan.breakers.map((b) => b.slot), ['2', '4']);
  assert.deepEqual(quad.breakers.map((b) => b.amps), ['15', '30', '15']);
  assert.deepEqual(quad.breakers.map((b) => b.poles), ['1', '2', '1']);
  // nothing in the batch overlaps anything else in the batch
  const all = res.rows.flatMap((r) => r.breakers);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(!overlaps(all[i], all[j], twoPerRow), `${all[i].slot} / ${all[j].slot}`);
});

test('bulk add: inline errors per row (missing slot, missing amps, taken spot, clash inside the batch)', () => {
  const existing = [{ id: 'e1', panelId: 'p', slot: '5', poles: '2', btype: 'double', amps: '30', label: 'Dryer' }];
  const rows = [
    { slot: '7', btype: 'single', amps: '20', label: 'Lights' }, // 7 is inside Dryer 5–11
    { slot: '26', btype: 'single', amps: '15', label: 'Master' },
    { slot: '28', btype: 'single', amps: '15', label: 'Oops' }, // same row as 26 (26/28)
    { slot: '', btype: 'single', amps: '15', label: 'No number' },
    { slot: '30', btype: 'single', amps: '', label: 'No amps' },
    { slot: '99', btype: 'single', amps: '15', label: 'Too high' },
  ];
  const res = planBulk(rows, twoPerRow, existing, { homeId: 'h', makeId });
  assert.equal(res.ok, false);
  const e = res.rows.map((r) => r.error);
  assert.match(e[0], /^Already used by 5–11 DRYER/);
  assert.equal(e[1], '');
  assert.match(e[2], /runs into row 2 \(26\/28\)/);
  assert.match(e[3], /slot number/);
  assert.match(e[4], /amps/);
  assert.match(e[5], /up to 84/);
  assert.equal(res.rows[0].breakers.length, 0);
});

test('bulk add: existing breakers on OTHER panels do not block; one-per-space panels work too', () => {
  const existing = [{ id: 'o1', panelId: 'other', slot: '1', poles: '1', amps: '20', label: 'Elsewhere' }];
  const res = planBulk([{ slot: '1', btype: 'double', amps: '30', label: 'Dryer' }, { slot: '3', btype: 'single', amps: '20', label: 'Hits the dryer' }], perSpace, existing, { homeId: 'h', makeId });
  assert.equal(res.rows[0].error, '');
  assert.equal(res.rows[0].covers, 'Covers 1/3 · one 240V circuit');
  assert.match(res.rows[1].error, /runs into row 1/);
});

test('bulk add: all-blank is not ok; helpers', () => {
  const res = planBulk([{ slot: '', label: '' }, {}], twoPerRow, []);
  assert.equal(res.ok, false);
  assert.equal(res.count, 0);
  assert.ok(isBlankRow({ slot: ' ', label: '', rooms: '' }));
  assert.ok(!isBlankRow({ slot: '', label: '', labels: ['Bottom'] }));
  assert.deepEqual(splitRooms(' Kitchen, ,Boys room '), ['Kitchen', 'Boys room']);
  assert.equal(partsOf('tandem'), 2);
  assert.equal(partsOf('quad'), 3);
  assert.equal(partsOf('double'), 1);
});

test('bulk add: re-entering the example panel against itself flags every row', () => {
  const d = seedData();
  const p = d.panels.find((x) => x.id === 'p_rows');
  const res = planBulk([{ slot: '26', btype: 'single', amps: '15' }, { slot: '34', btype: 'single', amps: '20' }, { slot: '38', btype: 'single', amps: '20', label: 'New' }], p, d.breakers, { homeId: p.homeId, makeId });
  assert.match(res.rows[0].error, /26\/28/);
  assert.match(res.rows[1].error, /REFRIGERATOR/);
  assert.equal(res.rows[2].error, '');
});
