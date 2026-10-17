import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  normalizeCode, hashInput, codeHash, makeTempCode, makeClaimCode, prettyClaimCode, customCodeProblem, expiryFor, codeStatus,
  guardNext, triesLeft, GUARD_MAX, GUARD_WINDOW_MS, CLAIM_ALPHABET, changedFields, describeChange, undoable, undoOps, mergeChanges,
  claimCopy, homePhotoIds, grantId, claimStatus, toMillis,
} from '../src/lib/access.js';
import { createScopedStore } from '../src/store/scoped.js';

test('codes are normalized: case, spaces and dashes do not matter', () => {
  assert.equal(normalizeCode(' k7mp-3qxr '), 'K7MP3QXR');
  assert.equal(normalizeCode('482 913'), '482913');
  assert.equal(hashInput('tok', 'ab-c d'), 'ampmap:v1:tok:ABCD');
});

test('hash is sha256 of the salted code, same as the rules test uses', async () => {
  const expect = createHash('sha256').update('ampmap:v1:' + 'a'.repeat(36) + ':482913').digest('hex');
  assert.equal(await codeHash('a'.repeat(36), '482 913'), expect);
  assert.match(expect, /^[0-9a-f]{64}$/);
  // a different link gives a different hash for the same code
  assert.notEqual(await codeHash('b'.repeat(36), '482913'), expect);
});

test('temporary codes are 6 digits, claim codes 8 easy-to-read characters', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(makeTempCode(), /^\d{6}$/);
    const c = makeClaimCode();
    assert.equal(c.length, 8);
    for (const ch of c) assert.ok(CLAIM_ALPHABET.includes(ch));
    assert.doesNotMatch(c, /[01OIL]/);
  }
  assert.equal(prettyClaimCode('k7mp3qxr'), 'K7MP-3QXR');
  let n = 0;
  const seq = () => (n++ % 10) / 10;
  assert.equal(makeTempCode(seq), '012345');
});

test('own codes: at least 6 characters and not trivially guessable', () => {
  assert.match(customCodeProblem('12345'), /at least 6/);
  assert.match(customCodeProblem('111111'), /too easy/);
  assert.match(customCodeProblem('123456'), /too easy/);
  assert.equal(customCodeProblem('Smith-2026'), '');
  assert.match(customCodeProblem('x'.repeat(40)), /32/);
});

test('expiry choices', () => {
  assert.equal(expiryFor('24h', 1000), 1000 + 86400000);
  assert.equal(expiryFor('7d', 0), 7 * 86400000);
  assert.equal(expiryFor('off', 5), null);
});

test('code status for the homeowner', () => {
  const now = Date.parse('2026-10-17T13:00:00Z');
  assert.equal(codeStatus(null, now).state, 'none');
  assert.equal(codeStatus({ on: false }, now).state, 'off');
  assert.equal(codeStatus({ on: true, exp: now - 1 }, now).state, 'expired');
  const on = codeStatus({ on: true, kind: 'temp', exp: { seconds: (now + 3600000) / 1000 } }, now);
  assert.equal(on.state, 'on');
  assert.match(on.text, /Temporary code/);
  assert.match(codeStatus({ on: true, kind: 'custom', exp: null }, now).text, /until you turn it off/);
});

test('lockout: 10 tries per hour per link, then wait', () => {
  const now = 10_000_000;
  assert.deepEqual(guardNext(null, now), { locked: false, n: 1, newWindow: true, create: true });
  assert.deepEqual(guardNext({ n: 3, since: now - 1000 }, now), { locked: false, n: 4, newWindow: false, create: false });
  assert.equal(guardNext({ n: GUARD_MAX, since: now - 1000 }, now).locked, true);
  assert.equal(guardNext({ n: GUARD_MAX, since: now - 1000 }, now).until, now - 1000 + GUARD_WINDOW_MS);
  assert.equal(guardNext({ n: GUARD_MAX, since: now - GUARD_WINDOW_MS }, now).n, 1);
  assert.equal(triesLeft({ n: 4, since: now }, now), 5);
  assert.equal(toMillis({ toMillis: () => 5 }), 5);
});

test('history lines say what changed', () => {
  const before = { id: 'b1', label: 'Kitchen', amps: '20', wire: { size: '12' }, updatedAt: 1 };
  const after = { id: 'b1', label: 'Kitchen counter', amps: '20', wire: { size: '10' }, updatedAt: 2 };
  assert.deepEqual(changedFields('breakers', before, after), ['label', 'wire']);
  // untouched fields re-saved by a form are not changes
  assert.deepEqual(changedFields('breakers', { amps: 20, half: undefined, wire: { size: '14', note: '' } }, { amps: '20', half: '', wire: { size: '14' } }), []);
  const line = describeChange({ col: 'breakers', before, after }, { name: (c, o) => '#9 ' + o.label, wireText: (w) => (w ? w.size + ' AWG' : '') });
  assert.equal(line, 'Breaker #9 Kitchen counter: label "Kitchen" → "Kitchen counter", wire 12 AWG → 10 AWG');
  assert.equal(describeChange({ col: 'devices', before: null, after: { name: 'GFCI' } }), 'Added outlet GFCI');
  assert.equal(describeChange({ col: 'devices', before: { name: 'Old' }, after: null }), 'Removed outlet Old');
  assert.match(describeChange({ col: 'devices', before: { breakerId: 'a' }, after: { breakerId: 'b' } }, { breakerName: () => '#4' }), /moved to breaker #4/);
});

test('undo: newest entry first, puts "before" back, removes what was added', () => {
  const entries = [
    { id: 'e1', at: 1, changes: [] },
    { id: 'e2', at: 3, undoneAt: 4, changes: [] },
    { id: 'e3', at: 2, changes: [{ col: 'breakers', id: 'b1', before: { label: 'A' }, after: { label: 'B' } }, { col: 'devices', id: 'd9', before: null, after: { name: 'N' } }] },
  ];
  assert.equal(undoable(entries).id, 'e3');
  assert.deepEqual(undoOps(entries[2]), [{ op: 'remove', col: 'devices', id: 'd9' }, { op: 'put', col: 'breakers', obj: { label: 'A', id: 'b1' } }]);
  assert.equal(undoable([{ id: 'x', at: 1, undoneAt: 2 }]), null);
});

test('mergeChanges folds repeated saves of one item', () => {
  const m = mergeChanges([
    { col: 'breakers', id: 'b1', before: { a: 1 }, after: { a: 2 } },
    { col: 'breakers', id: 'b1', before: { a: 2 }, after: { a: 3 } },
    { col: 'devices', id: 'd1', before: null, after: { n: 1 } },
    { col: 'devices', id: 'd1', before: { n: 1 }, after: null },
  ]);
  assert.deepEqual(m, [{ col: 'breakers', id: 'b1', before: { a: 1 }, after: { a: 3 } }]);
});

test('hand-off copy keeps ids (QR stickers keep working) and drops the installer customer link', () => {
  const c = claimCopy({ home: { id: 'h1', name: 'New Build', customerId: 'c9', shareToken: 't' }, panels: [{ id: 'p1', homeId: 'h1' }], breakers: [{ id: 'b1' }], devices: [], photos: [] });
  assert.equal(c.home.id, 'h1');
  assert.equal(c.home.customerId, undefined);
  assert.equal(c.home.shareToken, 't');
  assert.equal(c.panels[0].id, 'p1');
  assert.deepEqual(homePhotoIds({ floorplan: { photoId: 'f' } }, [{ photoId: 'p' }], [{ photoId: 'd' }, {}]).sort(), ['d', 'f', 'p']);
  assert.equal(grantId('o', 'h', 'e'), 'o_h_e');
  assert.equal(claimStatus({ exp: 1 }, 2).state, 'expired');
});

function fakeBackend(seed) {
  const state = JSON.parse(JSON.stringify(seed));
  const commits = [];
  let push = () => {};
  return {
    state, commits,
    subscribe(onData) { push = () => onData(JSON.parse(JSON.stringify(state))); setTimeout(push, 0); return () => {}; },
    async commit(changes, entry) {
      commits.push({ changes, entry });
      for (const c of changes) {
        const list = state[c.col];
        const i = list.findIndex((x) => x.id === c.id);
        if (c.after) { if (i >= 0) list[i] = c.after; else list.push(c.after); } else if (i >= 0) list.splice(i, 1);
      }
      push();
    },
  };
}

test('scoped store: edits land in the real data with one history entry per save', async () => {
  const be = fakeBackend({ home: { name: 'Smith' }, panels: [{ id: 'p1', homeId: 'h1', name: 'Main' }], breakers: [{ id: 'b1', homeId: 'h1', panelId: 'p1', label: 'Kitchen' }], devices: [] });
  const s = createScopedStore(be, { ownerUid: 'o', homeId: 'h1', editorUid: 'anon', name: 'Mike · Ace', flushMs: 5, describe: (c) => `${c.col}:${c.id}` });
  await s.init();
  assert.equal(s.data.homes[0].name, 'Smith');
  await s.put('breakers', { ...s.data.breakers[0], label: 'Kitchen counter' });
  await s.put('devices', { id: 'd1', breakerId: 'b1', name: 'GFCI' });
  assert.equal(s.data.breakers[0].label, 'Kitchen counter'); // shows at once
  await s.settle();
  assert.equal(be.commits.length, 1);
  const { changes, entry } = be.commits[0];
  assert.equal(changes.length, 2);
  assert.equal(changes[0].before.label, 'Kitchen');
  assert.equal(changes[1].after.homeId, 'h1');
  assert.equal(entry.by, 'Mike · Ace');
  assert.equal(entry.uid, 'anon');
  assert.equal(entry.homeId, 'h1');
  assert.deepEqual(entry.summary, ['breakers:b1', 'devices:d1']);
  assert.equal(be.state.breakers[0].label, 'Kitchen counter');
});

test('scoped store: the home itself, photos, other homes and new panels are refused', async () => {
  const be = fakeBackend({ home: { name: 'Smith' }, panels: [{ id: 'p1', homeId: 'h1' }], breakers: [], devices: [] });
  const s = createScopedStore(be, { ownerUid: 'o', homeId: 'h1', editorUid: 'anon', name: 'x', flushMs: 5 });
  await s.init();
  await assert.rejects(s.put('homes', { id: 'h1', name: 'x' }), /homeowner/);
  await assert.rejects(s.put('panels', { id: 'p2', homeId: 'h1' }), /homeowner/);
  await assert.rejects(s.put('breakers', { id: 'b2', homeId: 'h2' }), /homeowner/);
  await assert.rejects(s.remove('panels', 'p1'), /homeowner/);
  await assert.rejects(s.putPhoto('x', 'data:'), /homeowner/);
  await s.put('panels', { id: 'p1', homeId: 'h1', location: 'Garage' }); // editing a panel is fine
  await s.settle();
  assert.equal(be.commits.length, 1);
});

test('scoped store: a refused save (code changed) ends the session', async () => {
  const be = fakeBackend({ home: { name: 'S' }, panels: [], breakers: [{ id: 'b1', homeId: 'h1' }], devices: [] });
  be.commit = async () => { throw Object.assign(new Error('denied'), { code: 'permission-denied' }); };
  let ended = null;
  const s = createScopedStore(be, { ownerUid: 'o', homeId: 'h1', editorUid: 'a', name: 'x', flushMs: 5, onDenied: (e) => (ended = e) });
  await s.init();
  await s.put('breakers', { id: 'b1', homeId: 'h1', label: 'y' });
  await assert.rejects(s.settle());
  assert.equal(ended.code, 'permission-denied');
});

test('rules file: codes hashed and owner-only, lockout, claims single-use, old sharing kept', () => {
  const r = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(r, /match \/editCodes\/\{token\}/);
  assert.match(r, /allow list: if false;/);
  assert.match(r, /hash64\(request\.resource\.data\.codeHash\)/);
  assert.match(r, /resource\.data\.n < 10/);
  assert.match(r, /duration\.value\(1, 'h'\)/);
  assert.match(r, /match \/claims\/\{claimId\}/);
  assert.match(r, /sign_in_provider != 'anonymous'/);
  assert.match(r, /match \/shares\/\{token\} \{\s*allow get: if true;/);
  assert.match(r, /match \/sharedPanels\/\{panelId\} \{\s*allow get: if true;/);
  assert.doesNotMatch(r, /plain|codeText|code:/);
});
