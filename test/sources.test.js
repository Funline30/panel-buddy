import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourcesOf, applySources, cleanSource, sourceName, sourceFacts, sourceChip, sourcesSummary, safetyNote, busHint, breakersFor, sourceOfBreaker, hasUtility, backfeedOf, isOnBackup, kindOf, SOURCE_KINDS, BACKFEED_KINDS } from '../src/lib/sources.js';
import { seedData, sampleSources, sampleSourceBreakers, SAMPLE_BACKUP } from '../src/lib/seed.js';
import { describeChange } from '../src/lib/access.js';

const P = { id: 'p1', type: 'main', mainAmps: '200', spaces: '24' };

test('old panels: no sources, utility on, nothing to warn about', () => {
  assert.deepEqual(sourcesOf(P), []);
  assert.equal(hasUtility(P), true);
  assert.equal(sourcesSummary(P), '');
  assert.equal(safetyNote([P], []), null);
  assert.deepEqual(sourcesOf({ ...P, type: 'rv', sources: [{ id: 'x', kind: 'solar' }] }), []); // RVs: not shown
});

test('an older panel with only the generator fields shows that generator until the list is saved', () => {
  const old = { ...P, genHookup: 'interlock', genSize: '7.5 kW', genInlet: 'Outside wall' };
  const list = sourcesOf(old);
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, 'generator');
  assert.equal(list[0].hookup, 'interlock');
  assert.match(sourceFacts(list[0]), /7.5 kW · Interlock kit/);
  // saved with no generator: the old fields say "none" so it doesn't come back
  const saved = applySources(old, []);
  assert.deepEqual(sourcesOf(saved), []);
  assert.equal(saved.genHookup, 'none');
  assert.equal(saved.genSize, undefined);
  // genHookup 'none' alone: nothing
  assert.deepEqual(sourcesOf({ ...P, genHookup: 'none' }), []);
});

test('any combination and more than one of the same kind', () => {
  const next = applySources(P, [
    { id: 'a', kind: 'solar', label: 'Garage roof solar', size: '8 kW' },
    { id: 'b', kind: 'solar', size: 'other', sizeOther: '4.2 kW' },
    { id: 'c', kind: 'battery', btype: 'portable', brand: 'EcoFlow', kwh: '5 kWh' },
    { id: 'd', kind: 'generator', gtype: 'standby', hookup: 'ats', size: '22 kW', fuel: 'Natural gas' },
    { id: 'e', kind: 'generator', gtype: 'portable', hookup: 'interlock' },
    { id: 'f', kind: 'wind', size: '2.5 kW' },
    { id: 'g', kind: 'other', what: 'Micro-hydro' },
    { id: 'h', kind: 'nonsense' },
  ]);
  const list = sourcesOf(next);
  assert.equal(list.length, 7);
  assert.equal(sourceName(list[0], list), 'Garage roof solar');
  assert.equal(sourceName(list[1], list), 'Solar 2');
  assert.equal(sourceName(list[2], list), 'EcoFlow');
  assert.equal(sourceName(list[3], list), 'Generator 1');
  assert.equal(sourceName(list[6], list), 'Micro-hydro');
  assert.equal(sourceChip(list[1], list), '☀️ Solar 2 4.2 kW');
  assert.match(sourceFacts(list[2]), /Portable power station · 5 kWh/);
  // older generator fields follow the FIRST generator
  assert.equal(next.genHookup, 'ats');
  assert.equal(next.genSize, '22 kW');
  assert.equal(sourcesSummary(next), 'Utility + Solar + Battery backup + Generator + Wind + Other');
});

test('battery works alone, off-grid is remembered, unknown fields are dropped', () => {
  const next = applySources(P, [{ kind: 'battery', btype: 'home', brand: 'Tesla Powerwall', backup: 'whole', secret: 'x', size: '10 kW' }], { offGrid: true });
  const [s] = sourcesOf(next);
  assert.ok(s.id.startsWith('s_'));
  assert.equal(s.secret, undefined);
  assert.equal(s.size, undefined); // not a battery field
  assert.equal(hasUtility(next), false);
  assert.equal(sourcesSummary(next), 'No utility (off-grid) + Battery backup');
  assert.equal(applySources(next, [], { offGrid: false }).offGrid, undefined);
  // "other" text only kept while Other is picked
  assert.equal(cleanSource({ kind: 'solar', size: '8 kW', sizeOther: '9' }).sizeOther, undefined);
  assert.equal(cleanSource({ kind: 'solar', size: 'other', sizeOther: '9 kW' }).sizeOther, '9 kW');
  assert.equal(cleanSource({ kind: 'nope' }), null);
});

test('safety note: plain words, shut-off places, general info', () => {
  const p = applySources(P, [{ id: 'a', kind: 'solar', label: 'Roof', shutoff: 'By the meter' }, { id: 'g', kind: 'generator', inlet: 'Garage' }]);
  const n = safetyNote([p], []);
  assert.equal(n.title, 'This home has solar and generator power');
  assert.match(n.body, /may NOT make everything dead/);
  assert.equal(n.shutoffs[0].text, 'Roof: solar shut-off / AC disconnect (By the meter)');
  assert.equal(n.shutoffs[1].text, 'Generator: turn it off and unplug it (inlet: Garage)');
  assert.match(n.disclaimer, /not electrical advice/);
  assert.match(n.short, /Main off ≠ all off/);
  // a tagged breaker alone (no source listed) still warns
  const t = safetyNote([P], [{ id: 'b', backfeed: 'wind' }]);
  assert.equal(t.title, 'This home has wind turbine power');
  assert.equal(t.shutoffs.length, 0);
  assert.match(t.body, /Shut off the other power source too/);
});

test('120% rule is only an informational hint, never a block', () => {
  assert.match(busHint({ mainAmps: '200' }, { bfAmps: '40' }), /General info: .*about 40A/);
  assert.match(busHint({ mainAmps: '200' }, { bfAmps: '60' }), /60A is more than that/);
  assert.match(busHint({}, {}), /installer or inspector has the final word/);
});

test('breaker tags: kind + which source; on backup', () => {
  const list = [{ id: 'a', kind: 'solar' }, { id: 'b', kind: 'solar' }, { id: 'g', kind: 'generator' }];
  const brks = [{ id: '1', backfeed: 'solar', backfeedSrc: 'b' }, { id: '2', backfeed: 'generator' }, { id: '3', backup: true }, { id: '4', backfeed: 'solar' }];
  assert.deepEqual(breakersFor(list[1], brks, list).map((b) => b.id), ['1']);
  assert.deepEqual(breakersFor(list[0], brks, list).map((b) => b.id), []); // 2 solar: an untargeted solar breaker isn't guessed
  assert.deepEqual(breakersFor(list[2], brks, list).map((b) => b.id), ['2']); // the only generator
  assert.equal(sourceOfBreaker(brks[0], list).id, 'b');
  assert.equal(sourceOfBreaker(brks[1], list).id, 'g');
  assert.equal(sourceOfBreaker(brks[3], list), null);
  assert.equal(backfeedOf(brks[0]).short, 'SOLAR');
  assert.equal(backfeedOf({ backfeed: 'x' }), null);
  assert.equal(isOnBackup(brks[2]), true);
  assert.equal(isOnBackup({ backup: 'yes' }), false);
  assert.deepEqual(SOURCE_KINDS.map((k) => k.value), ['solar', 'wind', 'battery', 'generator', 'other']);
  assert.ok(BACKFEED_KINDS.every((k) => kindOf(k.value)));
});

test('demo sample: solar + battery + generator, tagged breakers, backup circuits', () => {
  const d = seedData();
  const p = d.panels.find((x) => x.id === 'p_main');
  const list = sourcesOf(p);
  assert.deepEqual(list.map((s) => s.kind), ['solar', 'battery', 'generator']);
  const brk = d.breakers.filter((b) => b.panelId === 'p_main');
  assert.equal(brk.find((b) => b.id === 'b23').backfeed, 'solar');
  assert.equal(sourceOfBreaker(brk.find((b) => b.id === 'b24'), list).id, 's_gen');
  assert.deepEqual(brk.filter((b) => b.backup).map((b) => b.id).sort(), [...SAMPLE_BACKUP].sort());
  assert.equal(sampleSources().length, 3);
  assert.equal(sampleSourceBreakers().length, 2);
  assert.equal(p.genHookup, 'interlock'); // older copies of the app still see the generator
  const n = safetyNote(d.panels.filter((x) => x.homeId === 'h_sample'), brk);
  assert.equal(n.shutoffs.length, 3);
  assert.ok(n.shutoffs.every((x) => x.where));
});

test('edit history names the new fields in plain words', () => {
  const before = { id: 'b', label: 'Solar', amps: '40' };
  const txt = describeChange({ col: 'breakers', before, after: { ...before, backfeed: 'solar', backup: true } });
  assert.match(JSON.stringify(txt), /power source/);
  assert.match(JSON.stringify(txt), /on backup/);
  const p = describeChange({ col: 'panels', before: { id: 'p', name: 'Main' }, after: { id: 'p', name: 'Main', sources: [{ id: 'a', kind: 'solar' }] } });
  assert.match(JSON.stringify(p), /solar \/ battery \/ generator/);
});
