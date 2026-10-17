import test from 'node:test';
import assert from 'node:assert/strict';
import { nextFreeSlot, quickBreaker, quickWire, spacesUsed, QUICK_WIRES, FEEDS_SUGGESTIONS } from '../src/lib/quick.js';

const P = { id: 'p', layout: 'two', spaces: '12' };
const ex = [
  { id: 'a', panelId: 'p', slot: '1', poles: '1', size: 'full', amps: '20', label: 'Kitchen' },
  { id: 'b', panelId: 'p', slot: '2', poles: '2', size: 'full', amps: '30', label: 'Dryer' },
  { id: 'z', panelId: 'other', slot: '3', poles: '1', size: 'full', amps: '20' },
];

test('quick panel: next open space skips used ones (and other panels do not count)', () => {
  assert.equal(nextFreeSlot(P, ex, 'single'), 3);
  assert.equal(nextFreeSlot(P, ex, 'single', 4), 5, '4 is the bottom of the 2/4 two-pole');
  assert.equal(nextFreeSlot(P, ex, 'double', 3), 3);
  assert.equal(nextFreeSlot(P, ex, 'double', 11), 3, '11 would need 13 (past 12 spaces): wraps around');
  const full = Array.from({ length: 12 }, (_, i) => ({ id: 'f' + i, panelId: 'p', slot: String(i + 1), poles: '1', size: 'full' }));
  assert.equal(nextFreeSlot(P, full, 'single'), 0, 'full panel');
  assert.deepEqual(spacesUsed(P, ex), { used: 3, max: 12 });
});

test('quick panel: one row -> one breaker with wire; same overlap rules', () => {
  const r = quickBreaker({ slot: '3', btype: 'single', amps: '20', label: 'Bath outlets', wire: quickWire('12/2', 'nm') }, P, ex, { homeId: 'h', makeId: () => 'x' });
  assert.equal(r.error, '');
  assert.equal(r.breakers.length, 1);
  assert.deepEqual(r.breakers[0].wire, { size: '12', type: 'nm', cond: '2g' });
  assert.equal(r.breakers[0].label, 'Bath outlets');
  assert.equal(r.breakers[0].homeId, 'h');
  const d = quickBreaker({ slot: '5', btype: 'double', amps: '40', label: 'Range' }, P, ex, { homeId: 'h' });
  assert.equal(d.breakers[0].poles, '2');
  assert.equal('wire' in d.breakers[0], false, 'no wire picked = no wire field saved');
  assert.match(quickBreaker({ slot: '4', btype: 'single', amps: '20', label: 'X' }, P, ex).error, /Already used by 2\/4/);
  assert.match(quickBreaker({ slot: '', btype: 'single', amps: '20' }, P, ex).error, /slot number/);
  assert.match(quickBreaker({ slot: '7', btype: 'single', amps: '' }, P, ex).error, /amps/);
});

test('quick panel: wire presets and suggestions', () => {
  assert.deepEqual(quickWire('10/3'), { size: '10', cond: '3g' });
  assert.equal(quickWire('nope'), null);
  assert.ok(QUICK_WIRES.some((w) => w.tag === '14/2'));
  assert.ok(FEEDS_SUGGESTIONS.includes('Kitchen counters / dishwasher'));
});
