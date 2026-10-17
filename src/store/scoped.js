// A store for someone editing ONE home that belongs to another account: an electrician
// with an edit code, or a person the homeowner added under People with access.
// It looks like the normal store to the app, but:
//  * only that home's panels, breakers and outlets can change (the security rules enforce
//    the same thing on the server),
//  * every save goes out in one batch together with an edit-history entry for the
//    homeowner ("Changed by: name · date · what changed"), with before/after so the
//    homeowner can undo it.
// The backend does the real reads/writes (Firestore for real accounts, localStorage in the demo).
import { mergeChanges, historyEntry } from '../lib/access.js';

export const EDITABLE = ['panels', 'breakers', 'devices'];
const CAN_CREATE = ['breakers', 'devices'];

export function createScopedStore(backend, { ownerUid, homeId, editorUid, name, describe = () => '', afterCommit = null, onDenied = () => {}, signOut = () => {}, flushMs = 350 }) {
  let data = { homes: [], panels: [], breakers: [], devices: [], customers: [] };
  const listeners = new Set();
  const emit = () => listeners.forEach((cb) => cb(data));
  let queue = [];
  let timer = null;
  let flushing = Promise.resolve();
  let unsub = null;

  const clone = (o) => (o == null ? null : JSON.parse(JSON.stringify(o)));
  const find = (col, id) => (data[col] || []).find((x) => x.id === id) || null;

  function refuse(what) {
    const e = new Error(`Only the homeowner can change ${what}.`);
    e.code = 'ampmap/not-allowed';
    throw e;
  }

  async function flush() {
    timer = null;
    const changes = mergeChanges(queue);
    queue = [];
    if (!changes.length) return;
    const lines = changes.map((c) => describe(c, data)).filter(Boolean);
    const entry = historyEntry({ id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), homeId, by: name, uid: editorUid, at: Date.now(), changes, lines });
    try {
      await backend.commit(changes, entry);
      if (afterCommit) await Promise.resolve(afterCommit(data)).catch(() => {});
    } catch (e) {
      onDenied(e);
      throw e;
    }
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { flushing = flush().catch(() => {}); }, flushMs);
  }

  const store = {
    mode: 'guest',
    guest: { ownerUid, homeId, name, editorUid },
    user: { uid: editorUid, email: name },
    ready: false,
    get data() {
      return data;
    },
    get settings() {
      return { accountType: 'personal' };
    },
    async saveSettings() {},
    init() {
      return new Promise((resolve, reject) => {
        let first = true;
        unsub = backend.subscribe(
          (next) => {
            data = { homes: next.home ? [{ ...next.home, id: homeId }] : [], panels: next.panels || [], breakers: next.breakers || [], devices: next.devices || [], customers: [] };
            store.ready = true;
            if (first) { first = false; resolve(); }
            emit();
          },
          (err) => {
            if (first) { first = false; reject(err); } else onDenied(err);
          }
        );
      });
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async put(col, obj) {
      if (!EDITABLE.includes(col)) refuse(col === 'homes' ? 'the home itself (name, map, photos)' : 'that');
      const before = clone(find(col, obj.id));
      if (!before && !CAN_CREATE.includes(col)) refuse('panels (adding or removing them)');
      const after = clone({ ...obj, homeId: obj.homeId || homeId, updatedAt: Date.now() });
      if (after.homeId !== homeId) refuse('another home');
      const list = data[col];
      const i = list.findIndex((x) => x.id === obj.id);
      if (i >= 0) list[i] = after;
      else list.push(after);
      data = { ...data, [col]: [...list] };
      queue.push({ col, id: obj.id, before, after });
      schedule();
      emit();
      return after;
    },
    async remove(col, id) {
      if (!CAN_CREATE.includes(col)) refuse(col === 'panels' ? 'panels (adding or removing them)' : 'that');
      const before = clone(find(col, id));
      if (!before) return;
      data = { ...data, [col]: data[col].filter((x) => x.id !== id) };
      queue.push({ col, id, before, after: null });
      schedule();
      emit();
    },
    // wait for pending saves (used before leaving)
    async settle() {
      if (timer) { clearTimeout(timer); flushing = flush(); }
      await flushing;
    },
    async getPhoto(id) {
      return backend.getPhoto ? backend.getPhoto(id) : null;
    },
    async putPhoto() {
      refuse('photos');
    },
    async removePhoto() {},
    async addMany() {
      refuse('that');
    },
    async replaceAll() {
      refuse('that');
    },
    async getShare(token) {
      return backend.getShare ? backend.getShare(token) : null;
    },
    async lookupPanelShare(panelId) {
      return backend.lookupPanelShare ? backend.lookupPanelShare(panelId) : null;
    },
    async createShare() {
      refuse('sharing');
    },
    async deleteShare() {
      refuse('sharing');
    },
    async signOut() {
      await store.settle().catch(() => {});
      if (unsub) unsub();
      await signOut();
    },
  };
  return store;
}
