// Firestore side of edit codes: proving a code (with the lockout counter), the scoped
// backend for editing someone else's home, and the electrician's anonymous sign-in.
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, signOut as fbSignOut } from 'firebase/auth';
import { initializeFirestore, getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, onSnapshot, writeBatch, serverTimestamp } from 'firebase/firestore';
import { codeHash, guardNext, GUARD_MAX } from '../lib/access.js';
import { createScopedStore } from './scoped.js';

export { createScopedStore };

const err = (code, extra = {}) => Object.assign(new Error(code), { code: 'ampmap/' + code, ...extra });

// One attempt: write my hash into codeSessions/{me} and bump codeGuards/{token} in the same
// batch (the rules refuse one without the other, and refuse the 11th try within an hour).
export async function proveCode(db, uid, token, code, name) {
  const hash = await codeHash(token, code);
  for (let attempt = 0; attempt < 2; attempt++) {
    let g = null;
    try {
      const s = await getDoc(doc(db, 'codeGuards', token));
      g = s.exists() ? s.data() : null;
    } catch (e) {
      if (e.code === 'permission-denied') throw err('rules');
      throw e;
    }
    const plan = guardNext(g);
    if (plan.locked) throw err('locked', { until: plan.until });
    const b = writeBatch(db);
    b.set(doc(db, 'codeSessions', uid), { token, codeHash: hash, name: String(name || '').slice(0, 80), at: serverTimestamp() });
    b.set(doc(db, 'codeGuards', token), { n: plan.n, since: plan.newWindow ? serverTimestamp() : g.since, last: serverTimestamp() });
    try {
      await b.commit();
      return { hash, n: plan.n };
    } catch (e) {
      if (e.code !== 'permission-denied') throw e;
      if (attempt === 1) throw err(g && g.n >= 9 ? 'locked' : 'rules');
      // someone else tried at the same moment, or the hour just rolled over: read again
    }
  }
  return { hash, n: 0 };
}

// Reads/writes of one home in another account (rules: editor of that home).
export function cloudBackend(db, { ownerUid, homeId }) {
  const col = (c) => collection(db, 'users', ownerUid, c);
  return {
    subscribe(onData, onError) {
      const state = { home: null, panels: [], breakers: [], devices: [] };
      let pending = 4;
      const done = () => { if (pending > 0) pending--; if (pending === 0) onData({ ...state }); };
      const unsubs = [
        onSnapshot(doc(db, 'users', ownerUid, 'homes', homeId), (s) => { state.home = s.exists() ? { ...s.data(), id: s.id } : null; done(); }, onError),
        ...['panels', 'breakers', 'devices'].map((c) =>
          onSnapshot(query(col(c), where('homeId', '==', homeId)), (snap) => { state[c] = snap.docs.map((d) => ({ ...d.data(), id: d.id })); done(); }, onError)
        ),
      ];
      return () => unsubs.forEach((u) => u());
    },
    async commit(changes, entry) {
      const b = writeBatch(db);
      for (const c of changes) {
        const ref = doc(db, 'users', ownerUid, c.col, c.id);
        if (c.after) {
          const { id, ...rest } = c.after;
          void id;
          b.set(ref, JSON.parse(JSON.stringify(rest)));
        } else b.delete(ref);
      }
      const { id, ...e } = entry;
      b.set(doc(db, 'users', ownerUid, 'history', id), JSON.parse(JSON.stringify(e)));
      await b.commit();
    },
    async getPhoto() {
      return null; // photos stay with the homeowner
    },
    async getShare(token) {
      const s = await getDoc(doc(db, 'shares', token));
      return s.exists() ? s.data() : null;
    },
    async lookupPanelShare(panelId) {
      try {
        const s = await getDoc(doc(db, 'sharedPanels', panelId));
        return s.exists() ? s.data().token : null;
      } catch {
        return null;
      }
    },
    // after an editor's change, refresh the read-only copy people see when they scan
    async refreshShare(token, payload) {
      await setDoc(doc(db, 'shares', token), { ...JSON.parse(JSON.stringify(payload)), owner: ownerUid, homeId, updatedAt: Date.now() });
    },
  };
}

// The electrician's own little Firebase app, so an anonymous sign-in never touches an
// AmpMap account that's signed in on the same phone.
function guestApp(config) {
  const app = getApps().find((a) => a.name === 'ampmap-guest') || initializeApp(config, 'ampmap-guest');
  let db;
  try {
    db = initializeFirestore(app, {});
  } catch {
    db = getFirestore(app);
  }
  return { app, auth: getAuth(app), db };
}

async function anonUser(auth) {
  if (auth.authStateReady) await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  try {
    return (await signInAnonymously(auth)).user;
  } catch (e) {
    if (String(e.code).includes('operation-not-allowed') || String(e.code).includes('admin-restricted')) throw err('anon-off');
    throw e;
  }
}

// Try a code from the shared view. Resolves {ownerUid, homeId} or throws ampmap/wrong|locked|rules|anon-off.
export async function enterWithCode(config, token, code, name) {
  const { auth, db } = guestApp(config);
  const share = await getDoc(doc(db, 'shares', token));
  if (!share.exists()) throw err('gone');
  const { owner, homeId } = share.data();
  if (!homeId) throw err('wrong'); // edit codes were never turned on for this link
  const user = await anonUser(auth);
  const { n } = await proveCode(db, user.uid, token, code, name);
  try {
    await getDoc(doc(db, 'users', owner, 'homes', homeId));
  } catch (e) {
    if (e.code === 'permission-denied') throw err('wrong', { left: Math.max(0, GUARD_MAX - n) });
    throw e;
  }
  return { ownerUid: owner, homeId, editorUid: user.uid };
}

// Re-open a guest session (after the page reloads). The rules re-check the code every time.
export async function openCodeGuest(config, info, { describe, afterShare, onDenied }) {
  const { auth, db } = guestApp(config);
  const user = await anonUser(auth);
  const backend = cloudBackend(db, info);
  return createScopedStore(backend, {
    ownerUid: info.ownerUid,
    homeId: info.homeId,
    editorUid: user.uid,
    name: info.name,
    describe,
    afterCommit: afterShare ? (data) => backend.refreshShare(info.token, afterShare(data)) : null,
    onDenied,
    signOut: async () => {
      await deleteDoc(doc(db, 'codeSessions', user.uid)).catch(() => {});
      await fbSignOut(auth).catch(() => {});
    },
  });
}
