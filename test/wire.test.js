import test from 'node:test';
import assert from 'node:assert/strict';
import { wireShort, cleanWire, hasWire, wireFromForm, wireText, wireTag, cableText, sizeText, typeText, condText, effectiveWire, usualMaxAmps, wireChecks, wireWarning, WIRE_GUIDANCE, WIRE_SIZES, WIRE_TYPES, WIRE_CONDUCTORS, WIRE_COLORS } from '../src/lib/wire.js';
import { breakersCsv, devicesCsv } from '../src/lib/csv.js';
import { seedData } from '../src/lib/seed.js';
import { breakerAmps } from '../src/lib/load.js';

test('wire: everything optional, blank by default', () => {
  assert.equal(cleanWire(undefined), null);
  assert.equal(cleanWire(null), null);
  assert.equal(cleanWire({}), null);
  assert.equal(cleanWire({ size: '', type: '  ', note: '' }), null);
  assert.equal(hasWire({ note: 'x' }), true);
  assert.equal(wireText(null), '');
  assert.equal(wireTag(undefined), '');
  for (const list of [WIRE_SIZES, WIRE_TYPES, WIRE_CONDUCTORS, WIRE_COLORS]) assert.equal(list[0].value, '', 'first option is blank');
  assert.deepEqual(WIRE_SIZES.map((o) => o.value), ['', '14', '12', '10', '8', '6', 'other']);
  assert.deepEqual(WIRE_TYPES.map((o) => o.value), ['', 'nm', 'mc', 'thhn', 'uf', 'al', 'other']);
});

test('wire: cleanWire keeps only filled fields and drops stray "other" text', () => {
  assert.deepEqual(cleanWire({ size: '12', sizeOther: '4 AWG', type: 'nm', cond: '2g', color: '', note: ' ran 2019 ' }), { size: '12', type: 'nm', cond: '2g', note: 'ran 2019' });
  assert.deepEqual(cleanWire({ size: 'other', sizeOther: '4 AWG' }), { size: 'other', sizeOther: '4 AWG' });
  assert.deepEqual(wireFromForm({ wsize: '10', wtype: 'thhn', wcond: 'single', wcolor: '', wnote: '', wsizeOther: 'x', wmode: 'own' }), { size: '10', type: 'thhn', cond: 'single' });
  assert.equal(wireFromForm({ wsize: '', wtype: '', wcond: '', wcolor: '', wnote: '' }), null);
});

test('wire: text the way electricians write it', () => {
  const w = { size: '12', cond: '2g', type: 'nm', color: 'yellow' };
  assert.equal(cableText(w), '12/2 w/ground');
  assert.equal(wireText(w), '12/2 w/ground · NM-B (Romex) · yellow jacket');
  assert.equal(wireText(w, { short: true }), '12/2 w/ground · NM-B');
  assert.equal(wireTag(w), '12/2');
  assert.equal(wireTag({ size: '10', cond: '3g' }), '10/3');
  assert.equal(cableText({ size: '14', cond: '2' }), '14/2 no ground');
  assert.equal(wireText({ size: '10', type: 'thhn', cond: 'single' }), '10 AWG · Single wires · THHN in conduit');
  assert.equal(wireTag({ size: '10', type: 'thhn' }), '10 AWG');
  assert.equal(wireTag({ type: 'mc' }), 'MC');
  assert.equal(sizeText({ size: 'other', sizeOther: '2/0 AL' }), '2/0 AL');
  assert.equal(typeText({ type: 'other', typeOther: 'Knob & tube' }), 'Knob & tube');
  assert.equal(condText({ cond: 'other', condOther: '4 + ground' }), '4 + ground');
  assert.equal(wireText({ note: 'Ask the landlord' }), 'Ask the landlord');
});

test('wire: an outlet with no override uses its breaker wire', () => {
  const b = { id: 'b1', amps: '20', wire: { size: '12', cond: '2g', type: 'nm' } };
  assert.deepEqual(effectiveWire({ breakerId: 'b1' }, b), { wire: { size: '12', cond: '2g', type: 'nm' }, from: 'circuit' });
  assert.deepEqual(effectiveWire({ breakerId: 'b1', wire: {} }, b).from, 'circuit', 'empty override = inherit');
  const own = effectiveWire({ breakerId: 'b1', wire: { size: '14', cond: '2g' } }, b);
  assert.equal(own.from, 'outlet');
  assert.equal(wireTag(own.wire), '14/2');
  assert.deepEqual(effectiveWire({}, { amps: '20' }), { wire: null, from: '' });
  assert.deepEqual(effectiveWire({}, null), { wire: null, from: '' });
});

test('wire check: size vs breaker (gentle, copper rules)', () => {
  assert.equal(usualMaxAmps({ size: '14' }), 15);
  assert.equal(usualMaxAmps({ size: '12' }), 20);
  assert.equal(usualMaxAmps({ size: '10' }), 30);
  assert.equal(usualMaxAmps({ size: 'other', sizeOther: '4' }), 0);
  assert.equal(wireWarning({ size: '14' }, 15), null);
  assert.equal(wireWarning({ size: '14' }, 20).text, 'Check: 14 AWG is usually rated for 15A, and this breaker is 20A');
  assert.match(wireWarning({ size: '14' }, 20).text, /^Check: 14 AWG is usually rated for 15A/);
  assert.equal(wireWarning({ size: '12' }, 20), null);
  assert.equal(wireWarning({ size: '12' }, 30).text, 'Check: 12 AWG is usually rated for 20A, and this breaker is 30A');
  assert.equal(wireWarning({ size: '10' }, 30), null);
  assert.equal(wireWarning({ size: '10' }, 40).text, 'Check: 10 AWG is usually rated for 30A, and this breaker is 40A');
  assert.equal(wireWarning({ size: '12' }, 15), null, 'bigger wire than needed is fine');
  assert.equal(wireWarning({ size: '14' }, 0), null, 'unknown breaker amps = no check');
  assert.equal(wireWarning({ type: 'nm' }, 50), null, 'no size = no check');
  // 8 / 6 depend on the cable
  assert.equal(wireWarning({ size: '8', type: 'nm' }, 40), null);
  assert.ok(wireWarning({ size: '8', type: 'nm' }, 50));
  assert.equal(wireWarning({ size: '8', type: 'thhn' }, 50), null);
  assert.equal(wireWarning({ size: '6', type: 'mc' }, 60), null);
  assert.ok(wireWarning({ size: '6', type: 'nm' }, 60));
  // aluminum
  assert.equal(wireWarning({ size: '10', type: 'al' }, 30).text, 'Check: 10 AWG aluminum is usually rated for 25A, and this breaker is 30A');
  assert.ok(wireWarning({ size: '14', type: 'al' }, 15));
  assert.match(WIRE_GUIDANCE, /general guidance/i);
});

test('wire check: Romex jacket color vs size', () => {
  assert.equal(wireChecks({ size: '12', color: 'yellow', type: 'nm' }, 20).length, 0);
  const c = wireChecks({ size: '14', color: 'yellow', type: 'nm' }, 15);
  assert.equal(c.length, 1);
  assert.equal(c[0].text, 'Check: a yellow Romex jacket is usually 12 AWG');
  assert.equal(wireChecks({ size: '14', color: 'yellow', type: 'thhn' }, 15).length, 0, 'color code is a Romex thing');
  assert.equal(wireChecks({ size: '14', color: 'orange' }, 20).length, 2, 'size + color both flagged');
});

test('wire: CSV exports carry the wire (old rows stay blank)', () => {
  const data = {
    panels: [{ id: 'p', name: 'Main', layout: 'two' }],
    breakers: [
      { id: 'b1', panelId: 'p', slot: '1', poles: '1', amps: '20', label: 'Dining', wire: { size: '14', cond: '2g', type: 'nm', color: 'white' } },
      { id: 'b2', panelId: 'p', slot: '3', poles: '1', amps: '15', label: 'Old breaker' },
    ],
    devices: [
      { id: 'd1', breakerId: 'b1', type: 'outlet', name: 'Inherits' },
      { id: 'd2', breakerId: 'b1', type: 'outlet', name: 'Own', wire: { size: '12', cond: '2g' } },
      { id: 'd3', breakerId: 'b2', type: 'outlet', name: 'None' },
    ],
  };
  const br = breakersCsv(data).trim().split('\n');
  assert.match(br[0], /Wire size,Wire type,Conductors,Cable,Jacket color,Wire note,Wire check$/);
  assert.match(br[1], /14 AWG,NM-B \(Romex\),2 \+ ground,14\/2 w\/ground,White,,"Check: 14 AWG is usually rated for 15A/);
  assert.match(br[2], /,,,,,,$/);
  const dv = devicesCsv(data).trim().split('\n');
  assert.match(dv[0], /Readings,Wire from,Wire size/);
  assert.match(dv[1], /Breaker,14 AWG/);
  assert.match(dv[2], /This outlet,12 AWG,,2 \+ ground,12\/2 w\/ground,,,$/);
  assert.match(dv[3], /,,,,,,,,$/);
});

test('wire: sample home has wire, one 14 AWG on a 20A breaker and one outlet override', () => {
  const s = seedData();
  const brk = Object.fromEntries(s.breakers.map((b) => [b.id, b]));
  assert.equal(wireTag(brk.b6.wire), '12/2');
  assert.ok(wireWarning(brk.b10.wire, breakerAmps(brk.b10)), 'dining 14/2 on 20A is flagged');
  const flagged = s.breakers.filter((b) => wireWarning(b.wire, breakerAmps(b))).map((b) => b.id);
  assert.deepEqual(flagged, ['b10']);
  const tv = s.devices.find((d) => d.id === 'd16');
  assert.equal(effectiveWire(tv, brk[tv.breakerId]).from, 'outlet');
  const bed = s.devices.find((d) => d.id === 'd2');
  assert.equal(effectiveWire(bed, brk[bed.breakerId]).from, 'circuit');
});

test('wire: outlet label shows cable + size ("12/2 · 12 AWG")', () => {
  assert.equal(wireShort({ size: '12', cond: '2g', type: 'nm' }), '12/2 · 12 AWG');
  assert.equal(wireShort({ size: '10', cond: '3g' }), '10/3 · 10 AWG');
  assert.equal(wireShort({ size: '14' }), '14 AWG');
  assert.equal(wireShort({ type: 'mc' }), 'MC');
  assert.equal(wireShort({ size: 'other', sizeOther: '2/0 AL' }), '2/0 AL');
  assert.equal(wireShort(null), '');
  // inherited vs own, as the outlet rows show it
  const b = { amps: '15', wire: { size: '14', cond: '2g', type: 'nm' } };
  assert.equal(wireShort(effectiveWire({}, b).wire), '14/2 · 14 AWG');
  assert.equal(effectiveWire({}, b).from, 'circuit');
  assert.equal(wireShort(effectiveWire({ wire: { size: '12', cond: '2g' } }, b).wire), '12/2 · 12 AWG');
});
