// A store for someone editing ONE home that belongs to another account: an electrician
// with an edit code, or a person the homeowner added under People with access.
// It looks like the normal store to the app, but:
//  * full access to that one home's content: add/change/remove panels, breakers, outlets
//    and other devices, change the home (name, rooms/map, wire runs live on panels), photos.
//    Owner-only: deleting the home, its sharing link, customers, codes (rules enforce it too),
//  * every save goes out in one batch together with an edit-history entry for the
//    homeowner ("Changed by: name · date · what changed"), with before/after so the
//    homeowner can undo it.
// The backend does the real reads/writes (Firestore for real accounts, localStorage in the demo).
import { mergeChanges, historyEntry, OWNER_ONLY_HOME_FIELDS } from '../lib/access.js';

export const EDITABLE = ['homes', 'panels', 'breakers', 'devices'];
export const CAN_CREATE = ['panels', 'breakers', 'devices'];

// Changes the older security rules (before Oct 17, 2026) refused for editors. If the server
// still has those rules, these are rolled back with a friendly note and the rest still saves.
export function needsNewRules(c) {
  if (c.col === 'homes') return true;
  if (c.col === 'panels') return !c.before || !c.after;
  return false;
}

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
    try {
      await commitAll(changes);
    } catch (e) {
      // Older rules on the server? Then panel add/remove and home edits are refused, but the
      // code itself still works: roll those back, save the rest, and say so kindly.
      const extra = changes.filter(needsNewRules);
      if (extra.length && isDenied(e) && backend.stillHasAccess && (await backend.stillHasAccess().catch(() => false))) {
        rollBack(extra);
        const rest = changes.filter((c) => !needsNewRules(c));
        try {
          if (rest.length) await commitAll(rest);
        } catch (e2) {
          onDenied(e2);
          throw e2;
        }
        const n = Object.assign(new Error('needs-owner'), { code: 'ampmap/needs-owner', saved: rest.length });
        onDenied(n);
        return;
      }
      onDenied(e);
      throw e;
    }
  }
  async function commitAll(changes) {
    const lines = changes.map((c) => describe(c, data)).filter(Boolean);
    const entry = historyEntry({ id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), homeId, by: name, uid: editorUid, at: Date.now(), changes, lines });
    await backend.commit(changes, entry);
    if (afterCommit) await Promise.resolve(afterCommit(data)).catch(() => {});
  }
  function isDenied(e) {
    return !!e && (e.code === 'permission-denied' || String(e.code || '').endsWith('permission-denied') || /permission/i.test(String(e.message || '')));
  }
  function rollBack(list) {
    for (const c of list) {
      const arr = (data[c.col] || []).filter((x) => x.id !== c.id);
      if (c.before) arr.push(c.before);
      data = { ...data, [c.col]: arr };
    }
    emit();
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
      if (!EDITABLE.includes(col)) refuse('that');
      if (col === 'homes' && obj.id !== homeId) refuse('another home');
      const before = clone(find(col, obj.id));
      if (!before && !CAN_CREATE.includes(col)) refuse('that');
      let after = clone({ ...obj, ...(col === 'homes' ? {} : { homeId: obj.homeId || homeId }), updatedAt: Date.now() });
      if (col === 'homes') {
        // the sharing link and customer stay exactly as the homeowner set them
        for (const k of OWNER_ONLY_HOME_FIELDS) {
          if (before && before[k] !== undefined) after[k] = before[k];
          else delete after[k];
        }
      } else if (after.homeId !== homeId) refuse('another home');
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
      if (col === 'homes') refuse('the whole home (only the homeowner can delete it)');
      if (!CAN_CREATE.includes(col)) refuse('that');
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
    async putPhoto(id, dataUrl) {
      if (!backend.putPhoto) refuse('photos');
      return backend.putPhoto(id, dataUrl, homeId);
    },
    async removePhoto(id) {
      if (backend.removePhoto) await backend.removePhoto(id).catch(() => {});
    },
    // add several panels/breakers/devices at once (e.g. a scanned panel label)
    async addMany(extra) {
      for (const c of CAN_CREATE) for (const it of (extra && extra[c]) || []) if (!find(c, it.id)) await store.put(c, it);
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
