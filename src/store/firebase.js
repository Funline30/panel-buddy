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
} from 'firebase/firestore';

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
      for (const pid of panelIds) await setDoc(doc(db, 'sharedPanels', pid), { token, owner: store.user.uid }).catch(() => {});
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
