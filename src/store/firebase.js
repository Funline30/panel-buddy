// Cloud mode: Firebase Auth (email + password) + Cloud Firestore, free Spark plan.
// Data lives at users/{uid}/{homes|panels|breakers|devices|photos}/{id}.
// Firestore's persistent local cache keeps everything usable offline (garages!).
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { codeHash, toMillis, grantId, homePhotoIds, claimCopy, randomToken, CLAIM_DAYS } from '../lib/access.js';
import { proveCode, createScopedStore, cloudBackend } from './scoped-cloud.js';

const COLS = ['homes', 'panels', 'breakers', 'devices', 'customers'];

export function createFirebaseStore(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }
  let data = { homes: [], panels: [], breakers: [], devices: [], customers: [] };
  let settings = { accountType: 'personal' };
  let unsubs = [];
  const listeners = new Set();
  const authListeners = new Set();
  const emit = () => listeners.forEach((cb) => cb(data));
  const store = {
    mode: 'cloud',
    user: null,
    ready: false,
    get data() {
      return data;
    },
    init() {
      return new Promise((resolve) => {
        let first = true;
        onAuthStateChanged(auth, (user) => {
          unsubs.forEach((u) => u());
          unsubs = [];
          data = { homes: [], panels: [], breakers: [], devices: [], customers: [] };
          settings = { accountType: 'personal' };
          store.user = user ? { uid: user.uid, email: user.email } : null;
          if (user) {
            let pending = COLS.length + 1;
            unsubs.push(
              onSnapshot(
                doc(db, 'users', user.uid, 'settings', 'profile'),
                (snap) => {
                  settings = { accountType: 'personal', ...(snap.exists() ? snap.data() : {}) };
                  if (pending > 0) pending--;
                  if (pending === 0) emit();
                },
                () => {
                  if (pending > 0) pending--;
                  if (pending === 0) emit();
                }
              )
            );
            for (const c of COLS) {
              const un = onSnapshot(
                collection(db, 'users', user.uid, c),
                (snap) => {
                  data = { ...data, [c]: snap.docs.map((d) => ({ ...d.data(), id: d.id })) };
                  if (pending > 0) pending--;
                  if (pending === 0) emit();
                },
                (err) => {
                  console.error('snapshot', c, err);
                  if (pending > 0) {
                    pending--;
                    if (pending === 0) emit();
                  }
                }
              );
              unsubs.push(un);
            }
          } else emit();
          authListeners.forEach((cb) => cb(store.user));
          if (first) {
            first = false;
            resolve();
          }
        });
      });
    },
    get settings() {
      return settings;
    },
    async saveSettings(next) {
      settings = { ...settings, ...next };
      setDoc(doc(db, 'users', store.user.uid, 'settings', 'profile'), settings).catch((e) => alert('Save failed: ' + e.message));
      emit();
    },
    async addMany(extra) {
      for (const c of COLS) for (const it of extra[c] || []) await store.put(c, it);
    },
    // Read-only share links: a snapshot doc at shares/{random token}, readable by anyone
    // who has the link (rules allow get, never list), writable only by its owner.
    async createShare(token, payload, panelIds = []) {
      await setDoc(doc(db, 'shares', token), { ...JSON.parse(JSON.stringify(payload)), owner: store.user.uid, updatedAt: Date.now() });
      // sharedPanels/{panelId} lets someone who scans a panel sticker find its share.
      for (const pid of panelIds) await setDoc(doc(db, 'sharedPanels', pid), { token, owner: store.user.uid, ...(payload.homeId ? { homeId: payload.homeId } : {}) }).catch(() => {});
    },
    async lookupPanelShare(panelId) {
      try {
        const s = await getDoc(doc(db, 'sharedPanels', panelId));
        return s.exists() ? s.data().token : null;
      } catch {
        return null;
      }
    },
    async getShare(token) {
      const s = await getDoc(doc(db, 'shares', token));
      return s.exists() ? s.data() : null;
    },
    async deleteShare(token, panelIds = []) {
      for (const pid of panelIds) await deleteDoc(doc(db, 'sharedPanels', pid)).catch(() => {});
      await deleteDoc(doc(db, 'shares', token));
    },

    // ------------------------------------------------ edit codes (owner side)
    // editCodes/{token} holds only a hash; a private copy of a TEMPORARY code is kept in the
    // owner's own settings (owner-only) so they can show it again.
    async getEditCode(token) {
      try {
        const s = await getDoc(doc(db, 'editCodes', token));
        return s.exists() ? s.data() : null;
      } catch (e) {
        if (e.code === 'permission-denied') { const x = new Error('rules'); x.code = 'ampmap/rules'; throw x; }
        throw e;
      }
    },
    async saveEditCode(token, { homeId, code, kind, exp }) {
      const hash = await codeHash(token, code);
      try {
        await setDoc(doc(db, 'editCodes', token), { owner: store.user.uid, homeId, codeHash: hash, on: true, kind, exp: exp == null ? null : Timestamp.fromMillis(exp), setAt: Date.now() });
      } catch (e) {
        if (e.code === 'permission-denied') { const x = new Error('rules'); x.code = 'ampmap/rules'; throw x; }
        throw e;
      }
      await deleteDoc(doc(db, 'codeGuards', token)).catch(() => {});
      if (kind === 'temp') await setDoc(store._ref('settings', 'edit_' + homeId), { code, token, exp: exp == null ? null : exp });
      else await deleteDoc(store._ref('settings', 'edit_' + homeId)).catch(() => {});
    },
    async deleteEditCode(token, homeId) {
      await deleteDoc(doc(db, 'editCodes', token)).catch(() => {});
      await deleteDoc(doc(db, 'codeGuards', token)).catch(() => {});
      if (homeId) await deleteDoc(store._ref('settings', 'edit_' + homeId)).catch(() => {});
    },
    async getPrivate(key) {
      try {
        const s = await getDoc(store._ref('settings', key));
        return s.exists() ? s.data() : null;
      } catch {
        return null;
      }
    },
    async getGuard(token) {
      try {
        const s = await getDoc(doc(db, 'codeGuards', token));
        return s.exists() ? s.data() : null;
      } catch {
        return null;
      }
    },
    async clearGuard(token) {
      await deleteDoc(doc(db, 'codeGuards', token)).catch(() => {});
    },
    async listHistory(homeId) {
      try {
        const snap = await getDocs(query(collection(db, 'users', store.user.uid, 'history'), orderBy('at', 'desc'), limit(150)));
        return snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((e) => e.homeId === homeId);
      } catch {
        return null; // rules not deployed yet
      }
    },
    async markUndone(id) {
      await setDoc(store._ref('history', id), { undoneAt: Date.now() }, { merge: true });
    },
    // People with access (grants/{owner}_{home}_{editor})
    async listGrants(homeId) {
      try {
        const snap = await getDocs(query(collection(db, 'grants'), where('owner', '==', store.user.uid)));
        return snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((g) => g.homeId === homeId);
      } catch {
        return [];
      }
    },
    async listMyGrants() {
      try {
        const snap = await getDocs(query(collection(db, 'grants'), where('editor', '==', store.user.uid)));
        return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      } catch {
        return [];
      }
    },
    async removeGrant(id) {
      await deleteDoc(doc(db, 'grants', id));
    },
    // ------------------------------------------------ hand-off to homeowner (installer side)
    async createClaim(homeId, code, { homeName = '', fromName = '' } = {}) {
      const claimId = randomToken();
      const exp = Date.now() + CLAIM_DAYS * 86400000;
      // the new owner may copy this home's photos: stamp them with the home id
      const home = data.homes.find((h) => h.id === homeId);
      const ids = homePhotoIds(home, data.panels.filter((p) => p.homeId === homeId), data.devices.filter((d) => d.homeId === homeId));
      for (const pid of ids) {
        try {
          const s = await getDoc(store._ref('photos', pid));
          if (s.exists() && s.data().homeId !== homeId) await setDoc(store._ref('photos', pid), { ...s.data(), homeId });
        } catch { /* photo missing: skip */ }
      }
      try {
        await setDoc(doc(db, 'claims', claimId), { from: store.user.uid, homeId, codeHash: await codeHash(claimId, code), exp: Timestamp.fromMillis(exp), homeName, fromName, at: Date.now() });
      } catch (e) {
        if (e.code === 'permission-denied') { const x = new Error('rules'); x.code = 'ampmap/rules'; throw x; }
        throw e;
      }
      await setDoc(store._ref('settings', 'claim_' + homeId), { code, claimId, exp });
      return { claimId, exp };
    },
    async listClaims(homeId) {
      try {
        const snap = await getDocs(query(collection(db, 'claims'), where('from', '==', store.user.uid)));
        return snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((c) => c.homeId === homeId);
      } catch {
        return [];
      }
    },
    async cancelClaim(claimId, homeId) {
      await deleteDoc(doc(db, 'claims', claimId)).catch(() => {});
      await deleteDoc(doc(db, 'codeGuards', claimId)).catch(() => {});
      await deleteDoc(store._ref('settings', 'claim_' + homeId)).catch(() => {});
    },
    // ------------------------------------------------ hand-off (homeowner side)
    // Prove the setup code, copy the home (same ids) into this account, move the share link
    // over, optionally keep the installer as an editor, then remove it from the installer's
    // account and delete the one-time code.
    async claimHome(claimId, code, { keepInstaller = true, onStep = () => {} } = {}) {
      const me = store.user.uid;
      await proveCode(db, me, claimId, code, store.user.email || '');
      let claim;
      try {
        const s = await getDoc(doc(db, 'claims', claimId));
        claim = s.exists() ? s.data() : null;
      } catch {
        claim = null;
      }
      if (!claim) { const x = new Error('wrong'); x.code = 'ampmap/wrong'; throw x; }
      if (toMillis(claim.exp) <= Date.now()) { const x = new Error('expired'); x.code = 'ampmap/expired'; throw x; }
      if (claim.from === me) { const x = new Error('self'); x.code = 'ampmap/self'; throw x; }
      const from = claim.from;
      const homeId = claim.homeId;
      onStep('Copying the home into your account...');
      const hs = await getDoc(doc(db, 'users', from, 'homes', homeId));
      if (!hs.exists()) { const x = new Error('gone'); x.code = 'ampmap/gone'; throw x; }
      const grab = async (col) => (await getDocs(query(collection(db, 'users', from, col), where('homeId', '==', homeId)))).docs.map((d) => ({ ...d.data(), id: d.id }));
      const src = { home: { ...hs.data(), id: homeId }, panels: await grab('panels'), breakers: await grab('breakers'), devices: await grab('devices'), photos: await grab('photos').catch(() => []) };
      const copy = claimCopy(src);
      const writes = [];
      writes.push(['homes', copy.home]);
      for (const c of ['panels', 'breakers', 'devices', 'photos']) for (const it of copy[c]) writes.push([c, it]);
      for (let i = 0; i < writes.length; i += 400) {
        const b = writeBatch(db);
        for (const [c, it] of writes.slice(i, i + 400)) {
          const { id, ...rest } = it;
          b.set(doc(db, 'users', me, c, id), JSON.parse(JSON.stringify(rest)));
        }
        await b.commit();
      }
      onStep('Moving the share link...');
      const token = copy.home.shareToken;
      if (token) {
        for (const p of copy.panels) {
          try {
            const sp = await getDoc(doc(db, 'sharedPanels', p.id));
            if (sp.exists() && sp.data().owner === from) await setDoc(doc(db, 'sharedPanels', p.id), { ...sp.data(), owner: me, homeId });
          } catch { /* not shared */ }
        }
        try {
          const sh = await getDoc(doc(db, 'shares', token));
          if (sh.exists() && sh.data().owner === from) await setDoc(doc(db, 'shares', token), { ...sh.data(), owner: me, homeId, updatedAt: Date.now() });
        } catch { /* keep going */ }
        // the installer's old edit code (if any) is void now; clear it so the status reads Off
        await deleteDoc(doc(db, 'editCodes', token)).catch(() => {});
        await deleteDoc(doc(db, 'codeGuards', token)).catch(() => {});
      }
      if (keepInstaller) {
        await setDoc(doc(db, 'grants', grantId(me, homeId, from)), { owner: me, homeId, editor: from, homeName: copy.home.name || '', editorName: claim.fromName || 'Installer', at: Date.now() }).catch(() => {});
      }
      onStep('Finishing up...');
      const dels = [];
      for (const c of ['breakers', 'devices', 'panels', 'photos']) for (const it of src[c]) dels.push(doc(db, 'users', from, c, it.id));
      dels.push(doc(db, 'users', from, 'homes', homeId));
      for (let i = 0; i < dels.length; i += 400) {
        const b = writeBatch(db);
        for (const r of dels.slice(i, i + 400)) b.delete(r);
        await b.commit().catch(() => {});
      }
      await deleteDoc(doc(db, 'claims', claimId)).catch(() => {});
      await deleteDoc(doc(db, 'codeSessions', me)).catch(() => {});
      return { homeId, fromName: claim.fromName || '', homeName: copy.home.name || '' };
    },
    // Open a home someone shared with this account (People with access) for editing.
    async openGrant(g, { name, describe, afterShare, onDenied }) {
      const backend = cloudBackend(db, { ownerUid: g.owner, homeId: g.homeId });
      const afterCommit = afterShare ? async (d) => { const t = d.homes[0] && d.homes[0].shareToken; if (t) await backend.refreshShare(t, afterShare(d)); } : null;
      return createScopedStore(backend, { ownerUid: g.owner, homeId: g.homeId, editorUid: store.user.uid, name, describe, afterCommit, onDenied, signOut: () => {} });
    },
    get _db() {
      return db;
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onAuth(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async signIn(email, pw) {
      await signInWithEmailAndPassword(auth, email, pw);
    },
    async signUp(email, pw) {
      await createUserWithEmailAndPassword(auth, email, pw);
    },
    async resetPassword(email) {
      await sendPasswordResetEmail(auth, email);
    },
    async signOut() {
      await signOut(auth);
    },
    _ref(col, id) {
      if (!store.user) throw new Error('Not signed in');
      return doc(db, 'users', store.user.uid, col, id);
    },
    async put(col, obj) {
      const clean = JSON.parse(JSON.stringify({ ...obj, updatedAt: Date.now() }));
      delete clean.id;
      // Don't await the server: with offline cache the write lands locally at once
      // and syncs when signal returns.
      setDoc(store._ref(col, obj.id), clean).catch((e) => alert('Save failed: ' + e.message));
      return { ...clean, id: obj.id };
    },
    async remove(col, id) {
      deleteDoc(store._ref(col, id)).catch((e) => alert('Delete failed: ' + e.message));
    },
    async getPhoto(id) {
      try {
        const s = await getDoc(store._ref('photos', id));
        return s.exists() ? s.data().data : null;
      } catch {
        return null;
      }
    },
    async putPhoto(id, dataUrl) {
      await setDoc(store._ref('photos', id), { data: dataUrl, updatedAt: Date.now() });
    },
    async removePhoto(id) {
      deleteDoc(store._ref('photos', id)).catch(() => {});
    },
    async replaceAll(next) {
      const uid = store.user.uid;
      // delete existing docs, then write imported ones (batches of 400)
      const ops = [];
      for (const c of COLS) {
        const snap = await getDocs(collection(db, 'users', uid, c));
        snap.forEach((d) => ops.push(['del', d.ref]));
        for (const item of Array.isArray(next[c]) ? next[c] : []) {
          const { id, ...rest } = item;
          if (id) ops.push(['set', doc(db, 'users', uid, c, String(id)), JSON.parse(JSON.stringify(rest))]);
        }
      }
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        for (const op of ops.slice(i, i + 400)) {
          if (op[0] === 'del') batch.delete(op[1]);
          else batch.set(op[1], op[2]);
        }
        await batch.commit();
      }
    },
  };
  return store;
}
