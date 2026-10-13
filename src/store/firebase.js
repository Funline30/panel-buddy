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

const COLS = ['homes', 'panels', 'breakers', 'devices'];

export function createFirebaseStore(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }
  let data = { homes: [], panels: [], breakers: [], devices: [] };
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
          data = { homes: [], panels: [], breakers: [], devices: [] };
          store.user = user ? { uid: user.uid, email: user.email } : null;
          if (user) {
            let pending = COLS.length;
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
