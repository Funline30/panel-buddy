import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serviceOf, isThreePhase, isCommercial, mainAmpChoices, polesOf, phaseAt, autoPhases, breakerPhases, phaseText, breakerVolts, ampsFromWatts,
  phaseTotals, feedRows, wouldLoop, feedText, feedParent, generatorText, panelExtrasText, groundingText, hasGenerator, cleanRun, runText,
  deviceDefaults, defaultsHint, isEquipment, panelView, breakerView, shouldShowTour, TOUR_STEPS, SERVICE_AMP_OPTIONS,
} from '../src/lib/pro.js';
import { slotLabel, slotsFor, planFor, coversText, breakerType, findClash } from '../src/lib/panel.js';
import { slotText } from '../src/lib/util.js';
import { readings } from '../src/lib/load.js';
import { DEVICE_TYPES, stylesFor, labelOf, HOME_TYPES } from '../src/lib/options.js';
import { seedData, commercialExample } from '../src/lib/seed.js';
import { shoppingList } from '../src/lib/shopping.js';

const P3 = { id: 'p', type: 'main', service: '3ph208', spaces: '42', layout: 'auto' };
const P480 = { ...P3, service: '3ph480' };
const P1 = { id: 'q', type: 'main', spaces: '24', layout: 'auto' }; // saved before pro: no service

test('service type: old panels are single-phase 120/240; three-phase only when picked', () => {
  assert.equal(serviceOf(P1).value, '1ph240');
  assert.equal(isThreePhase(P1), false);
  assert.equal(isThreePhase(P3), true);
  assert.equal(isThreePhase({ ...P3, type: 'rv' }), false); // RVs never three-phase
  assert.equal(serviceOf({ service: 'nonsense' }).value, '1ph240');
});

test('commercial choices: building type, three-phase or > 400A; sizes up to 4000A', () => {
  assert.equal(isCommercial({ type: 'house' }, P1), false);
  assert.equal(isCommercial({ type: 'commercial' }, P1), true);
  assert.equal(isCommercial({ type: 'house' }, P3), true);
  assert.equal(isCommercial({ type: 'house' }, { mainAmps: '600' }), true);
  assert.equal(isCommercial({ type: 'house' }, { mainAmps: 'other', mainAmpsOther: '1000' }), true);
  assert.ok(mainAmpChoices({ type: 'house' }, P1).includes('200'));
  assert.ok(!mainAmpChoices({ type: 'house' }, P1).includes('4000'));
  assert.deepEqual(SERVICE_AMP_OPTIONS.slice(-2), ['4000', 'other']);
  assert.ok(mainAmpChoices({ type: 'commercial' }, P1).includes('3000'));
});

test('phase from slot: A/B/C per row on three-phase, L1/L2 on single-phase', () => {
  // two columns: 1 & 2 = row 1 (A), 3 & 4 = B, 5 & 6 = C, 7 & 8 = A
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => phaseAt(n, P3)), ['A', 'A', 'B', 'B', 'C', 'C', 'A', 'A']);
  assert.deepEqual([1, 3, 5, 7].map((n) => phaseAt(n, P1)), ['1', '2', '1', '2']);
  // one column (stacked): each number is its own row
  assert.deepEqual([1, 2, 3, 4].map((n) => phaseAt(n, { ...P3, layout: 'one' })), ['A', 'B', 'C', 'A']);
  // 2 numbers per row (1/3 share a row)
  assert.deepEqual([1, 3, 5, 7, 9].map((n) => phaseAt(n, { ...P3, numbering: 'half' })), ['A', 'A', 'B', 'B', 'C']);
  assert.equal(phaseAt('', P3), '');
});

test('breaker phases: 1, 2 and 3 poles, hand-picked phase only when it fits', () => {
  assert.deepEqual(breakerPhases({ slot: '1', poles: '1' }, P3), ['A']);
  assert.deepEqual(breakerPhases({ slot: '3', poles: '2' }, P3), ['B', 'C']);
  assert.deepEqual(breakerPhases({ slot: '1', poles: '3' }, P3), ['A', 'B', 'C']);
  assert.deepEqual(breakerPhases({ slot: '7', poles: '3' }, P3), ['A', 'B', 'C']);
  assert.deepEqual(breakerPhases({ slot: '5', poles: '2' }, P3), ['C', 'A']);
  // override
  assert.deepEqual(breakerPhases({ slot: '1', poles: '1', phase: 'C' }, P3), ['C']);
  assert.deepEqual(breakerPhases({ slot: '1', poles: '1', phase: 'AB' }, P3), ['A']); // wrong pole count -> automatic
  assert.deepEqual(breakerPhases({ slot: '1', poles: '1', phase: 'x' }, P3), ['A']);
  // single-phase: legs, the old b.leg still wins on a single
  assert.deepEqual(breakerPhases({ slot: '1', poles: '2' }, P1), ['1', '2']);
  assert.deepEqual(breakerPhases({ slot: '1', poles: '1', leg: '2' }, P1), ['2']);
  assert.equal(phaseText(['A', 'B'], P3), 'AB');
  assert.equal(phaseText(['1', '2'], P1), 'L1·L2');
  assert.deepEqual(autoPhases({ slot: 'x' }, P3), []);
});

test('3-pole breakers fill 3 spaces, labels, clash checks; old types unchanged', () => {
  const b3 = { slot: '1', poles: '3', btype: 'triple' };
  assert.equal(polesOf(b3), 3);
  assert.equal(polesOf({}), 1);
  assert.equal(breakerType(b3), 'triple');
  assert.equal(breakerType({ poles: '3' }), 'triple');
  assert.equal(breakerType({ poles: '2' }), 'double');
  assert.deepEqual(slotsFor(b3, P3), [1, 3, 5]);
  assert.equal(slotLabel(b3, P3), '1/3/5');
  assert.equal(slotText(b3), '1/3/5');
  assert.equal(slotText({ slot: '1', poles: '2' }), '1/3');
  assert.deepEqual(planFor('triple', 7, P3).map((p) => p.poles), ['3']);
  assert.match(coversText('triple', 7, P3), /7\/9\/11 · one 3-phase circuit/);
  assert.ok(findClash([{ slot: '5', poles: '1' }], [b3], P3));
  assert.equal(findClash([{ slot: '7', poles: '1' }], [b3], P3), null);
  // "2 numbers per row" panels: a 3-pole spans 3 rows
  assert.equal(slotLabel(b3, { ...P3, numbering: 'half' }), '1–11');
});

test('volts and amps on three-phase panels', () => {
  assert.equal(breakerVolts({ poles: '1' }, P3), 120);
  assert.equal(breakerVolts({ poles: '2' }, P3), 208);
  assert.equal(breakerVolts({ poles: '1' }, P480), 277);
  assert.equal(breakerVolts({ poles: '3' }, P480), 480);
  assert.equal(breakerVolts({ poles: '2' }, P1), 240);
  assert.equal(breakerVolts({ poles: '1' }, P1), 120);
  assert.ok(Math.abs(ampsFromWatts(9000, { poles: '3' }, P3) - 24.98) < 0.05);
  assert.equal(ampsFromWatts(2400, { poles: '2' }, P1), 10);
  // load.readings: no override = old single-phase math; override = given volts
  const b = { amps: '20', poles: '2', loads: [{ name: 'Heater', watts: 2080, qty: 1, use: 'always' }] };
  assert.equal(readings(b, []).volts, 240);
  assert.equal(readings(b, [], { volts: 208 }).volts, 208);
});

test('per-phase totals: breaker amps and listed load amps per phase, spares skipped', () => {
  const brks = [
    { id: 'a', slot: '1', poles: '1', amps: '20' },
    { id: 'b', slot: '3', poles: '1', amps: '20' },
    { id: 'c', slot: '5', poles: '3', amps: '30' }, // C, A, B
    { id: 'd', slot: '2', poles: '1', amps: '20', kind: 'spare' },
  ];
  const load = { a: 10, b: 0, c: 5, d: 99 };
  const t = phaseTotals(P3, brks, (x) => load[x.id]);
  assert.deepEqual(t.phases, ['A', 'B', 'C']);
  const r = Object.fromEntries(t.rows.map((x) => [x.phase, x]));
  assert.equal(r.A.breakerAmps, 50);
  assert.equal(r.B.breakerAmps, 50);
  assert.equal(r.C.breakerAmps, 30);
  assert.equal(r.A.loadAmps, 15);
  assert.equal(r.B.loadAmps, 5);
  assert.equal(r.C.loadAmps, 5);
  assert.equal(r.A.count, 2);
  assert.ok(t.imbalance > 0);
  const s = phaseTotals(P1, [{ slot: '1', poles: '2', amps: '30' }]);
  assert.deepEqual(s.rows.map((x) => x.breakerAmps), [30, 30]);
  assert.equal(phaseTotals(P3, []).imbalance, 0);
});

test('what feeds what: tree order, loops and missing panels become roots', () => {
  const panels = [
    { id: 'lp1', name: 'LP-1', type: 'sub', fedFrom: 'mdp', fedBreaker: 'm1', feeder: '4/0 AL' },
    { id: 'hp1', name: 'HP-1', type: 'sub', fedFrom: 'mdp' },
    { id: 'mdp', name: 'MDP', type: 'main' },
    { id: 'lp2', name: 'LP-2', type: 'sub', fedFrom: 'lp1' },
    { id: 'x', name: 'Orphan', type: 'sub', fedFrom: 'gone' },
  ];
  const rows = feedRows(panels);
  assert.deepEqual(rows.map((r) => `${r.panel.id}:${r.depth}`), ['mdp:0', 'hp1:1', 'lp1:1', 'lp2:2', 'x:0']);
  assert.equal(rows.find((r) => r.panel.id === 'lp2').parent.id, 'lp1');
  assert.equal(wouldLoop(panels, 'mdp', 'lp2'), true);
  assert.equal(wouldLoop(panels, 'lp2', 'mdp'), false);
  assert.equal(wouldLoop(panels, 'mdp', 'mdp'), true);
  const loop = [{ id: 'a', fedFrom: 'b' }, { id: 'b', fedFrom: 'a' }];
  assert.equal(feedRows(loop).length, 2);
  assert.equal(feedParent(panels[0], panels).id, 'mdp');
  assert.equal(feedText(panels[0], panels, [{ id: 'm1', slot: '1', amps: '400' }], (b) => '1/3/5'), 'Fed from MDP · breaker 1/3/5 (400A) · 4/0 AL');
  assert.equal(feedText(panels[2], panels, []), '');
  assert.deepEqual(feedRows([{ id: 'only', name: 'Main' }]).map((r) => r.depth), [0]); // old single panel
});

test('generator, surge protector, grounding text; empty for old panels', () => {
  assert.equal(generatorText(P1), '');
  assert.deepEqual(panelExtrasText(P1), []);
  assert.equal(groundingText(P1), '');
  const p = { genHookup: 'interlock', genSize: '7.5 kW', genInlet: 'Outside wall', spd: 'yes', groundRod: '2', waterBond: 'yes' };
  assert.equal(hasGenerator(p), true);
  assert.equal(hasGenerator({ genHookup: 'none' }), false);
  assert.equal(generatorText(p), 'Interlock kit · 7.5 kW · inlet: Outside wall');
  assert.equal(generatorText({ genHookup: 'ats', genSize: 'other', genSizeOther: '150 kW' }), 'Automatic transfer switch · 150 kW');
  assert.deepEqual(panelExtrasText(p), ['Generator: Interlock kit', 'Surge protector']);
  assert.equal(groundingText(p), 'Ground rod: 2 rods · Water pipe bonded');
});

test('wire runs: cleaned, need a from or to', () => {
  assert.equal(cleanRun({ from: '', to: '' }), null);
  assert.equal(cleanRun(null), null);
  const r = cleanRun({ id: 'r1', from: ' MDP ', to: 'LP-1', wire: '4/0', conduit: 'emt' });
  assert.deepEqual(r, { id: 'r1', from: 'MDP', to: 'LP-1', wire: '4/0', conduit: 'emt' });
  assert.equal(cleanRun({ from: 'A', conduit: 'bogus' }).conduit, '');
  assert.equal(runText(r), '4/0 · EMT');
});

test('device types: new kinds, styles, typical breaker defaults', () => {
  for (const t of ['outlet', 'light', 'switch', 'fan', 'appliance', 'smoke', 'junction', 'other']) assert.ok(DEVICE_TYPES.some((d) => d.value === t), t); // old types kept
  for (const t of ['ev', 'hvac', 'waterheater', 'wellpump', 'solar', 'subpanel', 'generator']) {
    assert.ok(DEVICE_TYPES.some((d) => d.value === t && d.group === 'equipment'), t);
    assert.equal(isEquipment(t), true);
    assert.equal(deviceDefaults(t).poles, '2');
  }
  assert.equal(isEquipment('outlet'), false);
  assert.equal(deviceDefaults('outlet').amps, 20);
  assert.equal(deviceDefaults('outlet', '240dryer').amps, 30);
  assert.equal(deviceDefaults('outlet', '240dryer').volts, 240);
  assert.equal(deviceDefaults('nope').amps, 15);
  assert.match(defaultsHint('ev'), /50A double-pole \(240V\)/);
  assert.equal(defaultsHint('light'), '');
  assert.ok(stylesFor('outlet').some((s) => s.value === 'weatherproof'));
  assert.ok(stylesFor('switch').some((s) => s.value === '3way') && stylesFor('switch').some((s) => s.value === '4way'));
  assert.ok(stylesFor('smoke').some((s) => s.value === 'co'));
  assert.equal(stylesFor('ev'), null);
  assert.equal(labelOf(HOME_TYPES, 'commercial'), 'Commercial building (store, office, plant)');
  // new styles still make a sensible shopping list
  const s = shoppingList([{ type: 'light', style: 'recessed', qty: 6 }, { type: 'outlet', style: 'weatherproof' }]);
  assert.deepEqual(s.items.map((i) => `${i.qty} ${i.name}`), ['1 weatherproof outlet + in-use cover', '6 recessed light']);
});

test('old data: loads unchanged (no keys dropped, nothing written)', () => {
  const oldPanel = { id: 'p1', homeId: 'h', name: 'Main panel', type: 'main', mainAmps: '200', spaces: '20', numbering: 'space' };
  const frozen = JSON.stringify(oldPanel);
  const v = panelView(oldPanel);
  assert.equal(JSON.stringify(oldPanel), frozen);
  assert.equal(v.service, '1ph240');
  assert.equal(v.genHookup, 'none');
  assert.equal(v.mainAmps, '200');
  assert.deepEqual(v.runs, []);
  assert.equal(breakerView({ slot: '3', poles: '2', amps: '30' }).poles, '2');
  assert.equal(breakerView({ slot: '3' }).poles, '1');
  // the residential sample: every breaker stays single-phase L1/L2 and 1 or 2 poles
  const d = seedData();
  for (const b of d.breakers.filter((x) => x.homeId === 'h_sample')) {
    const p = d.panels.find((x) => x.id === b.panelId);
    assert.equal(isThreePhase(p), false);
    assert.ok(polesOf(b) <= 2);
    assert.ok(breakerPhases(b, p).every((x) => x === '1' || x === '2'));
  }
});

test('commercial sample: MDP 1200A 277/480 feeds LP-1 (120/208) and HP-1; no clashes', () => {
  const cx = commercialExample(0);
  const byId = (id) => cx.panels.find((p) => p.id === id);
  assert.equal(byId('p_mdp').mainAmps, '1200');
  assert.equal(serviceOf(byId('p_mdp')).value, '3ph480');
  assert.equal(serviceOf(byId('p_lp1')).value, '3ph208');
  assert.deepEqual(feedRows(cx.panels).map((r) => `${r.panel.name}:${r.depth}`), ['MDP:0', 'HP-1:1', 'LP-1:1']);
  for (const p of cx.panels) {
    const list = cx.breakers.filter((b) => b.panelId === p.id);
    for (const b of list) assert.equal(findClash([b], list.filter((o) => o.id !== b.id), p), null, `${p.name} ${b.label}`);
  }
  for (const dv of cx.devices) assert.ok(cx.breakers.some((b) => b.id === dv.breakerId), dv.name);
  assert.ok(seedData().homes.some((h) => h.id === 'h_comm'));
});

test('welcome tour: 3 steps, once, never for guests', () => {
  assert.equal(TOUR_STEPS.length, 3);
  assert.equal(shouldShowTour({ hasHome: true, view: 'panel' }), true);
  assert.equal(shouldShowTour({ hasHome: true, view: 'panel', seen: true }), false);
  assert.equal(shouldShowTour({ hasHome: true, view: 'panel', guest: true }), false);
  assert.equal(shouldShowTour({ hasHome: false, view: 'panel' }), false);
  assert.equal(shouldShowTour({ hasHome: true, view: 'rooms' }), false);
  assert.equal(shouldShowTour({ seen: true, force: true }), true);
});

import { PRINT_METHODS, TAPE_SIZES, tapeSize, printChoice, LABEL_MAKERS, WEATHERPROOF_SHEETS } from '../src/lib/sticker.js';
test('sticker print choice: label maker (24 mm tape) or regular printer; product links in one constant', () => {
  assert.deepEqual(PRINT_METHODS.map((m) => m.label), ['Label maker', 'Regular printer']);
  assert.deepEqual(printChoice('tape'), { method: 'maker', paper: 'tape' });
  assert.deepEqual(printChoice('letter'), { method: 'printer', paper: 'letter' });
  assert.deepEqual(printChoice(undefined), { method: 'printer', paper: 'label' }); // old links keep working
  assert.equal(tapeSize('nope').value, 'tape25');
  assert.ok(TAPE_SIZES.every((t) => t.h < 1 && t.w >= 2.5));
  assert.equal(LABEL_MAKERS.length, 3);
  assert.ok(LABEL_MAKERS.every((m) => m.url.startsWith('https://') && m.price.startsWith('approx.')));
  assert.ok(WEATHERPROOF_SHEETS.url.startsWith('https://www.avery.com/'));
});
