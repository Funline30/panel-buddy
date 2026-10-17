
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const rules = readFileSync(process.env.RULES || new URL('../../firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-ampmap', firestore: { rules, host: '127.0.0.1', port: 8085 } });
const H = (token, code) => createHash('sha256').update(`ampmap:v1:${token}:${code}`).digest('hex');
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '-', e.message.split('\n')[0]); } }

const OWNER = 'owner1', ELEC = 'elec1', HO = 'homeowner1', ANON = 'anon1', ANON2 = 'anon2', RANDO = 'rando';
const TOKEN = 'a'.repeat(36), CLAIM = 'c'.repeat(36);
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', OWNER, 'homes', 'h1'), { name: 'Smith House', shareToken: TOKEN });
  await setDoc(doc(db, 'users', OWNER, 'homes', 'h2'), { name: 'Other' });
  await setDoc(doc(db, 'users', OWNER, 'panels', 'p1'), { homeId: 'h1', name: 'Main' });
  await setDoc(doc(db, 'users', OWNER, 'breakers', 'b1'), { homeId: 'h1', panelId: 'p1', label: 'Kitchen', amps: 20 });
  await setDoc(doc(db, 'users', OWNER, 'breakers', 'b9'), { homeId: 'h2', panelId: 'px', label: 'Other', amps: 15 });
  await setDoc(doc(db, 'users', OWNER, 'devices', 'd1'), { homeId: 'h1', breakerId: 'b1', name: 'GFCI' });
  await setDoc(doc(db, 'users', OWNER, 'customers', 'c1'), { name: 'Secret' });
  await setDoc(doc(db, 'shares', TOKEN), { owner: OWNER, homeId: 'h1', home: { name: 'Smith House' }, panels: [] });
  await setDoc(doc(db, 'shares', 'o'.repeat(36)), { owner: OWNER, home: { name: 'Old share' }, panels: [] });
  await setDoc(doc(db, 'sharedPanels', 'p1'), { owner: OWNER, token: TOKEN, homeId: 'h1' });
  // installer's home to hand off
  await setDoc(doc(db, 'users', ELEC, 'homes', 'hx'), { name: 'New Build', shareToken: 'e'.repeat(36), customerId: 'cust9' });
  await setDoc(doc(db, 'users', ELEC, 'panels', 'px1'), { homeId: 'hx', name: 'Main' });
  await setDoc(doc(db, 'users', ELEC, 'breakers', 'bx1'), { homeId: 'hx', panelId: 'px1', label: 'Range', amps: 50 });
  await setDoc(doc(db, 'users', ELEC, 'devices', 'dx1'), { homeId: 'hx', breakerId: 'bx1', name: 'Range outlet' });
  await setDoc(doc(db, 'users', ELEC, 'photos', 'ph1'), { homeId: 'hx', data: 'data:x' });
  await setDoc(doc(db, 'users', ELEC, 'breakers', 'bOther'), { homeId: 'hOther', label: 'x' });
  await setDoc(doc(db, 'shares', 'e'.repeat(36)), { owner: ELEC, homeId: 'hx', home: { name: 'New Build' }, panels: [] });
  await setDoc(doc(db, 'sharedPanels', 'px1'), { owner: ELEC, token: 'e'.repeat(36), homeId: 'hx' });
});

const ctxOf = (uid, anon = false) => env.authenticatedContext(uid, anon ? { firebase: { sign_in_provider: 'anonymous' } } : { firebase: { sign_in_provider: 'password' } });
const owner = ctxOf(OWNER).firestore();
const anon = ctxOf(ANON, true).firestore();
const anon2 = ctxOf(ANON2, true).firestore();
const rando = ctxOf(RANDO).firestore();
const pub = env.unauthenticatedContext().firestore();

async function tryCode(db, uid, token, code, name = 'Mike') {
  const g = await getDoc(doc(db, 'codeGuards', token));
  const b = writeBatch(db);
  b.set(doc(db, 'codeSessions', uid), { token, codeHash: H(token, code), name, at: serverTimestamp() });
  if (!g.exists()) b.set(doc(db, 'codeGuards', token), { n: 1, since: serverTimestamp(), last: serverTimestamp() });
  else b.set(doc(db, 'codeGuards', token), { n: g.data().n + 1, since: g.data().since, last: serverTimestamp() });
  await b.commit();
}

// --- owner basics + old behaviour
await t('owner reads own breakers', () => assertSucceeds(getDocs(collection(owner, 'users', OWNER, 'breakers'))));
await t('owner writes own breaker', () => assertSucceeds(setDoc(doc(owner, 'users', OWNER, 'breakers', 'b2'), { homeId: 'h1', label: 'x' })));
await t('owner writes history', () => assertSucceeds(setDoc(doc(owner, 'users', OWNER, 'history', 'hist0'), { homeId: 'h1', by: 'me' })));
await t('rando cannot read owner', () => assertFails(getDoc(doc(rando, 'users', OWNER, 'homes', 'h1'))));
await t('public reads share', () => assertSucceeds(getDoc(doc(pub, 'shares', TOKEN))));
await t('public reads old share', () => assertSucceeds(getDoc(doc(pub, 'shares', 'o'.repeat(36)))));
await t('public cannot list shares', () => assertFails(getDocs(collection(pub, 'shares'))));
await t('owner updates old share (no homeId)', () => assertSucceeds(setDoc(doc(owner, 'shares', 'o'.repeat(36)), { owner: OWNER, home: { name: 'Old share 2' }, panels: [] })));
await t('public reads sharedPanels', () => assertSucceeds(getDoc(doc(pub, 'sharedPanels', 'p1'))));

// --- edit code
const exp7 = Timestamp.fromMillis(Date.now() + 7 * 86400000);
await t('rando cannot create edit code for owner share', () => assertFails(setDoc(doc(rando, 'editCodes', TOKEN), { owner: RANDO, homeId: 'h1', codeHash: H(TOKEN, '482913'), on: true, exp: null })));
await t('owner creates edit code', () => assertSucceeds(setDoc(doc(owner, 'editCodes', TOKEN), { owner: OWNER, homeId: 'h1', codeHash: H(TOKEN, '482913'), on: true, exp: exp7, kind: 'temp' })));
await t('owner cannot point code at another home', () => assertFails(setDoc(doc(owner, 'editCodes', TOKEN), { owner: OWNER, homeId: 'h2', codeHash: H(TOKEN, '482913'), on: true, exp: exp7 })));
await t('owner reads edit code', () => assertSucceeds(getDoc(doc(owner, 'editCodes', TOKEN))));
await t('public cannot read edit code', () => assertFails(getDoc(doc(pub, 'editCodes', TOKEN))));
await t('anon cannot read edit code', () => assertFails(getDoc(doc(anon, 'editCodes', TOKEN))));
await t('anon without session cannot read home', () => assertFails(getDoc(doc(anon, 'users', OWNER, 'homes', 'h1'))));
await t('session without guard bump denied', () => assertFails(setDoc(doc(anon, 'codeSessions', ANON), { token: TOKEN, codeHash: H(TOKEN, '000000'), name: 'x', at: serverTimestamp() })));
await t('wrong code: attempt recorded', () => assertSucceeds(tryCode(anon, ANON, TOKEN, '000000')));
await t('wrong code: cannot read home', () => assertFails(getDoc(doc(anon, 'users', OWNER, 'homes', 'h1'))));
await t('wrong code: cannot write breaker', () => assertFails(updateDoc(doc(anon, 'users', OWNER, 'breakers', 'b1'), { label: 'hacked' })));
await t('anon cannot read others session', () => assertFails(getDoc(doc(anon2, 'codeSessions', ANON))));
await t('right code: attempt recorded', () => assertSucceeds(tryCode(anon, ANON, TOKEN, '482913')));
await t('right code: reads home', () => assertSucceeds(getDoc(doc(anon, 'users', OWNER, 'homes', 'h1'))));
await t('right code: cannot read other home', () => assertFails(getDoc(doc(anon, 'users', OWNER, 'homes', 'h2'))));
await t('right code: lists breakers of the home', () => assertSucceeds(getDocs(query(collection(anon, 'users', OWNER, 'breakers'), where('homeId', '==', 'h1')))));
await t('right code: cannot list all breakers', () => assertFails(getDocs(collection(anon, 'users', OWNER, 'breakers'))));
await t('right code: cannot read customers', () => assertFails(getDocs(collection(anon, 'users', OWNER, 'customers'))));
await t('right code: cannot read history', () => assertFails(getDocs(collection(anon, 'users', OWNER, 'history'))));
await t('right code: updates breaker', () => assertSucceeds(updateDoc(doc(anon, 'users', OWNER, 'breakers', 'b1'), { label: 'Kitchen counter' })));
await t('right code: cannot move breaker to other home', () => assertFails(updateDoc(doc(anon, 'users', OWNER, 'breakers', 'b1'), { homeId: 'h2' })));
await t('right code: cannot edit other home breaker', () => assertFails(updateDoc(doc(anon, 'users', OWNER, 'breakers', 'b9'), { label: 'x' })));
await t('right code: creates device', () => assertSucceeds(setDoc(doc(anon, 'users', OWNER, 'devices', 'd2'), { homeId: 'h1', breakerId: 'b1', name: 'New' })));
await t('right code: deletes device', () => assertSucceeds(deleteDoc(doc(anon, 'users', OWNER, 'devices', 'd2'))));
await t('right code: updates panel', () => assertSucceeds(updateDoc(doc(anon, 'users', OWNER, 'panels', 'p1'), { location: 'Garage' })));
// full access (Oct 17): code-holders can add/remove panels, edit the home's rooms/map, photos
await t('right code: creates a new panel', () => assertSucceeds(setDoc(doc(anon, 'users', OWNER, 'panels', 'pNew'), { homeId: 'h1', name: 'Sub-panel (garage)' })));
await t('right code: cannot create panel in another home', () => assertFails(setDoc(doc(anon, 'users', OWNER, 'panels', 'pBad'), { homeId: 'h2', name: 'x' })));
await t('right code: creates breaker in the new panel', () => assertSucceeds(setDoc(doc(anon, 'users', OWNER, 'breakers', 'bNew'), { homeId: 'h1', panelId: 'pNew', label: 'Garage outlets', amps: 20 })));
await t('right code: cannot create breaker in another home', () => assertFails(setDoc(doc(anon, 'users', OWNER, 'breakers', 'bBad'), { homeId: 'h2', panelId: 'px', label: 'x' })));
await t('right code: deletes breaker', () => assertSucceeds(deleteDoc(doc(anon, 'users', OWNER, 'breakers', 'bNew'))));
await t('right code: deletes panel', () => assertSucceeds(deleteDoc(doc(anon, 'users', OWNER, 'panels', 'pNew'))));
await t('right code: cannot delete other home breaker', () => assertFails(deleteDoc(doc(anon, 'users', OWNER, 'breakers', 'b9'))));
await t('right code: edits home name + rooms/map', () => assertSucceeds(updateDoc(doc(anon, 'users', OWNER, 'homes', 'h1'), { name: 'Smith House', floorplan: { rooms: [{ id: 'r1', name: 'Kitchen' }] }, portables: [] })));
await t('right code: cannot change the sharing link', () => assertFails(updateDoc(doc(anon, 'users', OWNER, 'homes', 'h1'), { shareToken: 'z'.repeat(36) })));
await t('right code: cannot remove the sharing link', () => assertFails(setDoc(doc(anon, 'users', OWNER, 'homes', 'h1'), { name: 'Smith House' })));
await t('right code: cannot set a customer on the home', () => assertFails(updateDoc(doc(anon, 'users', OWNER, 'homes', 'h1'), { customerId: 'c1' })));
await t('right code: cannot edit other home doc', () => assertFails(updateDoc(doc(anon, 'users', OWNER, 'homes', 'h2'), { name: 'x' })));
await t('right code: cannot delete the home', () => assertFails(deleteDoc(doc(anon, 'users', OWNER, 'homes', 'h1'))));
await t('right code: cannot create a new home', () => assertFails(setDoc(doc(anon, 'users', OWNER, 'homes', 'h9'), { name: 'Mine now' })));
await t('right code: adds a photo to the home', () => assertSucceeds(setDoc(doc(anon, 'users', OWNER, 'photos', 'phA'), { homeId: 'h1', data: 'data:image/jpeg;base64,xx', updatedAt: 1 })));
await t('right code: reads that photo', () => assertSucceeds(getDoc(doc(anon, 'users', OWNER, 'photos', 'phA'))));
await t('right code: cannot add photo to another home', () => assertFails(setDoc(doc(anon, 'users', OWNER, 'photos', 'phB'), { homeId: 'h2', data: 'data:x' })));
await t('right code: deletes that photo', () => assertSucceeds(deleteDoc(doc(anon, 'users', OWNER, 'photos', 'phA'))));
await t('right code: registers QR lookup for a new panel', () => assertSucceeds(setDoc(doc(anon, 'sharedPanels', 'pNew2'), { owner: OWNER, token: TOKEN, homeId: 'h1' })));
await t('right code: QR lookup cannot point at another share', () => assertFails(setDoc(doc(anon, 'sharedPanels', 'pNew3'), { owner: OWNER, token: 'o'.repeat(36), homeId: 'h1' })));
await t('right code: cannot take over an existing QR lookup', () => assertFails(setDoc(doc(anon, 'sharedPanels', 'p1'), { owner: OWNER, token: TOKEN, homeId: 'h1', x: 1 })));
await t('right code: removes QR lookup of the removed panel', () => assertSucceeds(deleteDoc(doc(anon, 'sharedPanels', 'pNew2'))));
// still owner-only
await t('right code: cannot read the edit code', () => assertFails(getDoc(doc(anon, 'editCodes', TOKEN))));
await t('right code: cannot change the edit code', () => assertFails(setDoc(doc(anon, 'editCodes', TOKEN), { owner: OWNER, homeId: 'h1', codeHash: H(TOKEN, '111111'), on: true, exp: null })));
await t('right code: cannot turn off the edit code', () => assertFails(updateDoc(doc(anon, 'editCodes', TOKEN), { on: false })));
await t('right code: cannot delete the edit code', () => assertFails(deleteDoc(doc(anon, 'editCodes', TOKEN))));
await t('right code: cannot make a hand-off code', () => assertFails(setDoc(doc(anon, 'claims', 'k'.repeat(36)), { from: OWNER, homeId: 'h1', codeHash: H('k'.repeat(36), 'K7MP3QXR'), exp: exp7 })));
await t('right code: cannot add people with access', () => assertFails(setDoc(doc(anon, 'grants', `${OWNER}_h1_${ANON}`), { owner: OWNER, homeId: 'h1', editor: ANON })));
await t('right code: cannot delete the share', () => assertFails(deleteDoc(doc(anon, 'shares', TOKEN))));
await t('right code: cannot take the share (ownership)', () => assertFails(setDoc(doc(anon, 'shares', TOKEN), { owner: ANON, homeId: 'h1', home: {}, panels: [] })));
await t('right code: cannot read owner settings', () => assertFails(getDoc(doc(anon, 'users', OWNER, 'settings', 'app'))));
await t('right code: cannot write owner settings', () => assertFails(setDoc(doc(anon, 'users', OWNER, 'settings', 'app'), { accountType: 'pro' })));
await t('right code: cannot write customers', () => assertFails(setDoc(doc(anon, 'users', OWNER, 'customers', 'c2'), { name: 'x' })));
await t('right code: cannot fake a history entry as someone else', () => assertFails(setDoc(doc(anon, 'users', OWNER, 'history', 'hX'), { homeId: 'h1', by: 'x', uid: OWNER })));
await t('right code: writes history + change in one batch', async () => { const b = writeBatch(anon); b.update(doc(anon, 'users', OWNER, 'breakers', 'b1'), { amps: 15 }); b.set(doc(anon, 'users', OWNER, 'history', 'e1'), { homeId: 'h1', by: 'Mike · Ace Electric', uid: ANON, at: Date.now(), changes: [] }); await assertSucceeds(b.commit()); });
await t('history must carry own uid', () => assertFails(setDoc(doc(anon, 'users', OWNER, 'history', 'e2'), { homeId: 'h1', by: 'x', uid: 'someoneelse' })));
await t('editor cannot change history', () => assertFails(setDoc(doc(anon, 'users', OWNER, 'history', 'e1'), { homeId: 'h1', by: 'x', uid: ANON, undoneAt: 1 })));
await t('editor refreshes share copy', () => assertSucceeds(setDoc(doc(anon, 'shares', TOKEN), { owner: OWNER, homeId: 'h1', home: { name: 'Smith House' }, panels: [], updatedAt: 1 })));
await t('editor cannot take share', () => assertFails(setDoc(doc(anon, 'shares', TOKEN), { owner: ANON, homeId: 'h1', home: {}, panels: [] })));
await t('editor cannot change edit code', () => assertFails(setDoc(doc(anon, 'editCodes', TOKEN), { owner: OWNER, homeId: 'h1', codeHash: H(TOKEN, '111111'), on: true, exp: null })));
// change code -> old sessions die
await t('owner changes code', () => assertSucceeds(setDoc(doc(owner, 'editCodes', TOKEN), { owner: OWNER, homeId: 'h1', codeHash: H(TOKEN, 'NEWCODE9'), on: true, exp: null, kind: 'custom' })));
await t('old code session dies', () => assertFails(getDoc(doc(anon, 'users', OWNER, 'homes', 'h1'))));
await t('new code works', async () => { await tryCode(anon, ANON, TOKEN, 'NEWCODE9'); await assertSucceeds(getDoc(doc(anon, 'users', OWNER, 'homes', 'h1'))); });
await t('owner turns code off', () => assertSucceeds(setDoc(doc(owner, 'editCodes', TOKEN), { owner: OWNER, homeId: 'h1', codeHash: H(TOKEN, 'NEWCODE9'), on: false, exp: null, kind: 'custom' })));
await t('off: session dies', () => assertFails(getDoc(doc(anon, 'users', OWNER, 'homes', 'h1'))));
await t('expired code denied', async () => { await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'editCodes', TOKEN), { owner: OWNER, homeId: 'h1', codeHash: H(TOKEN, 'NEWCODE9'), on: true, exp: Timestamp.fromMillis(Date.now() - 1000) })); await assertFails(getDoc(doc(anon, 'users', OWNER, 'homes', 'h1'))); });
// lockout
await t('lockout after 10 tries in an hour', async () => {
  await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), 'codeGuards', TOKEN)));
  for (let i = 0; i < 10; i++) await tryCode(anon2, ANON2, TOKEN, '00000' + i);
  await assertFails(tryCode(anon2, ANON2, TOKEN, '999999'));
  await assertFails(tryCode(anon, ANON, TOKEN, '999999'));
});
await t('guard cannot be reset by editor', () => assertFails(setDoc(doc(anon2, 'codeGuards', TOKEN), { n: 1, since: serverTimestamp(), last: serverTimestamp() })));
await t('guard cannot be deleted by editor', () => assertFails(deleteDoc(doc(anon2, 'codeGuards', TOKEN))));
await t('owner clears lockout', () => assertSucceeds(deleteDoc(doc(owner, 'codeGuards', TOKEN))));
await t('new hour window after lockout', async () => {
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'codeGuards', TOKEN), { n: 10, since: Timestamp.fromMillis(Date.now() - 3700000), last: Timestamp.fromMillis(Date.now() - 3600000) }));
  const b = writeBatch(anon2);
  b.set(doc(anon2, 'codeSessions', ANON2), { token: TOKEN, codeHash: H(TOKEN, '1'), name: 'x', at: serverTimestamp() });
  b.set(doc(anon2, 'codeGuards', TOKEN), { n: 1, since: serverTimestamp(), last: serverTimestamp() });
  await assertSucceeds(b.commit());
});
await t('cannot fake a big n to dodge', async () => {
  const b = writeBatch(anon2);
  b.set(doc(anon2, 'codeSessions', ANON2), { token: TOKEN, codeHash: H(TOKEN, '2'), name: 'x', at: serverTimestamp() });
  b.set(doc(anon2, 'codeGuards', TOKEN), { n: 1, since: serverTimestamp(), last: serverTimestamp() });
  await assertFails(b.commit());
});

// --- hand-off
const ETOK = 'e'.repeat(36);
const elec = ctxOf(ELEC).firestore();
const ho = ctxOf(HO).firestore();
const exp30 = Timestamp.fromMillis(Date.now() + 30 * 86400000);
await t('installer cannot create claim for a home they do not have', () => assertFails(setDoc(doc(elec, 'claims', CLAIM), { from: ELEC, homeId: 'nope', codeHash: H(CLAIM, 'K7MP3QXR'), exp: exp30 })));
await t('claim max 31 days', () => assertFails(setDoc(doc(elec, 'claims', CLAIM), { from: ELEC, homeId: 'hx', codeHash: H(CLAIM, 'K7MP3QXR'), exp: Timestamp.fromMillis(Date.now() + 40 * 86400000) })));
await t('installer creates claim', () => assertSucceeds(setDoc(doc(elec, 'claims', CLAIM), { from: ELEC, homeId: 'hx', codeHash: H(CLAIM, 'K7MP3QXR'), exp: exp30, homeName: 'New Build', fromName: 'Ace Electric' })));
await t('installer lists own claims', () => assertSucceeds(getDocs(query(collection(elec, 'claims'), where('from', '==', ELEC)))));
await t('homeowner cannot read claim before code', () => assertFails(getDoc(doc(ho, 'claims', CLAIM))));
await t('homeowner wrong claim code: no access', async () => { await tryCode(ho, HO, CLAIM, 'AAAAAAAA'); await assertFails(getDoc(doc(ho, 'users', ELEC, 'homes', 'hx'))); });
const anonC = ctxOf('anonC', true).firestore();
await t('anonymous cannot claim', async () => { await tryCode(anonC, 'anonC', CLAIM, 'K7MP3QXR'); await assertFails(getDoc(doc(anonC, 'users', ELEC, 'homes', 'hx'))); });
await t('homeowner right code: reads claim', async () => { await tryCode(ho, HO, CLAIM, 'K7MP3QXR'); await assertSucceeds(getDoc(doc(ho, 'claims', CLAIM))); });
await t('claimer reads home', () => assertSucceeds(getDoc(doc(ho, 'users', ELEC, 'homes', 'hx'))));
await t('claimer lists breakers/devices/panels/photos', async () => { for (const c of ['panels', 'breakers', 'devices', 'photos']) await assertSucceeds(getDocs(query(collection(ho, 'users', ELEC, c), where('homeId', '==', 'hx')))); });
await t('claimer cannot read other installer homes', () => assertFails(getDoc(doc(ho, 'users', ELEC, 'breakers', 'bOther'))));
await t('claimer cannot write installer data', () => assertFails(updateDoc(doc(ho, 'users', ELEC, 'breakers', 'bx1'), { label: 'x' })));
await t('claimer copies into own account', async () => { const b = writeBatch(ho); b.set(doc(ho, 'users', HO, 'homes', 'hx'), { name: 'New Build', shareToken: ETOK }); b.set(doc(ho, 'users', HO, 'breakers', 'bx1'), { homeId: 'hx', label: 'Range' }); await assertSucceeds(b.commit()); });
await t('claimer takes share', () => assertSucceeds(setDoc(doc(ho, 'shares', ETOK), { owner: HO, homeId: 'hx', home: { name: 'New Build' }, panels: [] })));
await t('claimer takes sharedPanels (before share owner check uses doc)', () => assertSucceeds(setDoc(doc(ho, 'sharedPanels', 'px1'), { owner: HO, token: ETOK, homeId: 'hx' })));
await t('claimer grants installer access', () => assertSucceeds(setDoc(doc(ho, 'grants', `${HO}_hx_${ELEC}`), { owner: HO, homeId: 'hx', editor: ELEC, homeName: 'New Build', editorName: 'Ace Electric' })));
await t('bad grant id denied', () => assertFails(setDoc(doc(ho, 'grants', `x_hx_${ELEC}`), { owner: HO, homeId: 'hx', editor: ELEC })));
await t('claimer deletes installer copy', async () => { for (const [c, id] of [['breakers', 'bx1'], ['devices', 'dx1'], ['panels', 'px1'], ['photos', 'ph1'], ['homes', 'hx']]) await assertSucceeds(deleteDoc(doc(ho, 'users', ELEC, c, id))); });
await t('claimer cannot delete other installer data', () => assertFails(deleteDoc(doc(ho, 'users', ELEC, 'breakers', 'bOther'))));
await t('claimer deletes claim (single use)', () => assertSucceeds(deleteDoc(doc(ho, 'claims', CLAIM))));
await t('after claim: no more access to installer', () => assertFails(getDocs(query(collection(ho, 'users', ELEC, 'breakers'), where('homeId', '==', 'hx')))));
await t('installer lost owner access to the share', () => assertFails(setDoc(doc(elec, 'shares', ETOK), { owner: ELEC, homeId: 'hx', home: {}, panels: [] })));
await t('installer (granted) reads homeowner home', () => assertSucceeds(getDoc(doc(elec, 'users', HO, 'homes', 'hx'))));
await t('installer (granted) edits breaker', () => assertSucceeds(updateDoc(doc(elec, 'users', HO, 'breakers', 'bx1'), { label: 'Range 50A' })));
await t('installer (granted) adds a panel', () => assertSucceeds(setDoc(doc(elec, 'users', HO, 'panels', 'pxSub'), { homeId: 'hx', name: 'Shop sub-panel' })));
await t('installer (granted) removes that panel', () => assertSucceeds(deleteDoc(doc(elec, 'users', HO, 'panels', 'pxSub'))));
await t('installer (granted) cannot delete the home', () => assertFails(deleteDoc(doc(elec, 'users', HO, 'homes', 'hx'))));
await t('installer (granted) cannot remove other people access', () => assertFails(setDoc(doc(elec, 'grants', `${HO}_hx_rando`), { owner: HO, homeId: 'hx', editor: 'rando' })));
await t('installer lists own grants', () => assertSucceeds(getDocs(query(collection(elec, 'grants'), where('editor', '==', ELEC)))));
await t('homeowner lists grants', () => assertSucceeds(getDocs(query(collection(ho, 'grants'), where('owner', '==', HO)))));
await t('homeowner sets edit code on handed-off share', () => assertSucceeds(setDoc(doc(ho, 'editCodes', ETOK), { owner: HO, homeId: 'hx', codeHash: H(ETOK, '123987'), on: true, exp: null, kind: 'temp' })));
await t('homeowner removes installer', () => assertSucceeds(deleteDoc(doc(ho, 'grants', `${HO}_hx_${ELEC}`))));
await t('installer removed: no access', () => assertFails(getDoc(doc(elec, 'users', HO, 'homes', 'hx'))));
await t('homeowner reads history', () => assertSucceeds(getDocs(collection(owner, 'users', OWNER, 'history'))));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
