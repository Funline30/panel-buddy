// Demo / local mode: everything lives in this browser's localStorage.
import { seedData, houseExample, commercialExample, sampleSources, sampleSourceBreakers, SAMPLE_BACKUP } from '../lib/seed.js';
import { codeHash, guardNext, toMillis, randomToken, CLAIM_DAYS, grantId } from '../lib/access.js';

const KEY = 'panelbuddy:data:v1';
const PHOTO = 'panelbuddy:photo:';
const COLS = ['homes', 'panels', 'breakers', 'devices', 'customers'];
const SHARE = 'panelbuddy:share:';
const HIST = 'panelbuddy:history';
const GRANTS = 'panelbuddy:grants';
const jget = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const jset = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export function createLocalStore() {
  let data = null;
  const listeners = new Set();
  const emit = () => listeners.forEach((cb) => cb(data));
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      alert('This browser ran out of local storage space. Try removing some photos.');
      throw e;
    }
  };
  return {
    mode: 'demo',
    user: null,
    get data() {
      return data;
    },
    async init() {
      try {
        data = JSON.parse(localStorage.getItem(KEY) || 'null');
      } catch {
        data = null;
      }
      if (!data || !Array.isArray(data.homes)) {
        data = seedData();
        save();
      }
      for (const c of COLS) data[c] = data[c] || [];
      // ?example=house (or the older ?example=tandem) puts the example house (2-per-row
      // panel + rooms and plugs for the House Map) into a demo started before it existed.
      // Only the example's own ids are written; nothing else is touched.
      if (typeof location !== 'undefined' && /[?&]example=(tandem|house)/.test(location.search)) {
        const ex = houseExample();
        let changed = false;
        for (const c of ['homes', 'panels', 'breakers', 'devices'])
          for (const it of ex[c]) {
            const i = data[c].findIndex((x) => x.id === it.id);
            const cur = i === -1 ? null : data[c][i];
            // older demos had the example panel inside the sample home: move it over
            if (!cur) { data[c].push(it); changed = true; }
            else if (cur.homeId !== it.homeId) { data[c][i] = it; changed = true; }
            // floor plan (home.floorplan, device.pos) added later: fill it in if missing
            else if ((it.floorplan && !cur.floorplan) || (it.pos && !cur.pos)) {
              data[c][i] = { ...cur, ...(it.floorplan ? { floorplan: it.floorplan } : {}), ...(it.pos ? { pos: it.pos } : {}) };
              changed = true;
            }
          }
        if (changed) save();
      }
      // ?example=commercial adds the sample commercial building (3-phase, MDP -> LP-1 / HP-1)
      // to a demo started before it existed. Only its own ids are written.
      if (typeof location !== 'undefined' && /[?&]example=commercial/.test(location.search)) {
        const cx = commercialExample();
        let changed = false;
        for (const c of ['homes', 'panels', 'breakers', 'devices'])
          for (const it of cx[c]) if (!data[c].find((x) => x.id === it.id)) { data[c].push(it); changed = true; }
        if (changed) save();
      }
      // ?example=wire fills the sample home's wire (breaker.wire / device.wire, added later)
      // into a demo started before it existed. Only sample items with no wire are touched.
      if (typeof location !== 'undefined' && /[?&]example=wire/.test(location.search)) {
        const ex = seedData();
        let changed = false;
        for (const c of ['breakers', 'devices'])
          for (const it of ex[c]) {
            if (!it.wire) continue;
            const i = data[c].findIndex((x) => x.id === it.id && x.homeId === it.homeId);
            if (i !== -1 && !data[c][i].wire) { data[c][i] = { ...data[c][i], wire: it.wire }; changed = true; }
          }
        if (changed) save();
      }
      // ?example=solar adds the sample power sources (solar + battery + generator) and their
      // breakers to the sample home of a demo started before they existed. Only touches the
      // sample main panel when it has no power-source list yet, and only adds missing ids.
      if (typeof location !== 'undefined' && /[?&]example=solar/.test(location.search)) {
        let changed = false;
        const pi = data.panels.findIndex((p) => p.id === 'p_main' && p.homeId === 'h_sample');
        if (pi !== -1 && !Array.isArray(data.panels[pi].sources)) {
          const p = data.panels[pi];
          data.panels[pi] = { ...p, sources: sampleSources(), spaces: ['24', '20', '16'].includes(String(p.spaces)) ? '28' : p.spaces };
          changed = true;
        }
        if (pi !== -1) {
          for (const b of sampleSourceBreakers()) if (!data.breakers.find((x) => x.id === b.id)) { data.breakers.push(b); changed = true; }
          data.breakers = data.breakers.map((b) => (b.homeId === 'h_sample' && SAMPLE_BACKUP.includes(b.id) && b.backup == null ? ((changed = true), { ...b, backup: true }) : b));
        }
        if (changed) save();
      }
      data.settings = data.settings || { accountType: 'personal' };
      emit();
    },
    get settings() {
      return (data && data.settings) || { accountType: 'personal' };
    },
    async saveSettings(next) {
      data.settings = { ...this.settings, ...next };
      save();
      emit();
    },
    async addMany(extra) {
      for (const c of COLS) for (const it of extra[c] || []) if (!data[c].find((x) => x.id === it.id)) data[c].push(it);
      save();
      emit();
    },
    async createShare(token, payload, panelIds = []) {
      localStorage.setItem(SHARE + token, JSON.stringify({ ...payload, updatedAt: Date.now() }));
      for (const pid of panelIds) localStorage.setItem('panelbuddy:sharedPanel:' + pid, token);
    },
    // ---- edit codes, history, hand-off: the demo keeps them in this browser, same shapes as the cloud
    async getEditCode(token) {
      return jget('panelbuddy:editcode:' + token);
    },
    async saveEditCode(token, { homeId, code, kind, exp }) {
      jset('panelbuddy:editcode:' + token, { owner: 'demo', homeId, codeHash: await codeHash(token, code), on: true, kind, exp: exp == null ? null : exp, setAt: Date.now() });
      localStorage.removeItem('panelbuddy:guard:' + token);
      if (kind === 'temp') jset('panelbuddy:private:edit_' + homeId, { code, token, exp });
      else localStorage.removeItem('panelbuddy:private:edit_' + homeId);
    },
    async deleteEditCode(token, homeId) {
      localStorage.removeItem('panelbuddy:editcode:' + token);
      localStorage.removeItem('panelbuddy:guard:' + token);
      if (homeId) localStorage.removeItem('panelbuddy:private:edit_' + homeId);
    },
    async getPrivate(key) {
      return jget('panelbuddy:private:' + key);
    },
    async getGuard(token) {
      return jget('panelbuddy:guard:' + token);
    },
    async clearGuard(token) {
      localStorage.removeItem('panelbuddy:guard:' + token);
    },
    // one code attempt, counted like the cloud lockout; resolves the hash or throws ampmap/locked
    async demoTry(token, code) {
      const g = jget('panelbuddy:guard:' + token);
      const plan = guardNext(g);
      if (plan.locked) throw Object.assign(new Error('locked'), { code: 'ampmap/locked', until: plan.until });
      jset('panelbuddy:guard:' + token, { n: plan.n, since: plan.newWindow ? Date.now() : g.since, last: Date.now() });
      return codeHash(token, code);
    },
    async demoEnter(token, code) {
      const share = jget(SHARE + token);
      if (!share) throw Object.assign(new Error('gone'), { code: 'ampmap/gone' });
      const hash = await this.demoTry(token, code);
      const left = Math.max(0, 10 - ((jget('panelbuddy:guard:' + token) || {}).n || 0));
      const c = jget('panelbuddy:editcode:' + token);
      const exp = c && toMillis(c.exp);
      if (!c || !c.on || (exp != null && exp <= Date.now()) || c.codeHash !== hash || c.homeId !== share.homeId) throw Object.assign(new Error('wrong'), { code: 'ampmap/wrong', left });
      return { ownerUid: 'demo', homeId: c.homeId, editorUid: 'demo-guest', hash };
    },
    demoCodeStillValid(token, hash) {
      const c = jget('panelbuddy:editcode:' + token);
      const exp = c && toMillis(c.exp);
      return !!c && c.on && (exp == null || exp > Date.now()) && c.codeHash === hash;
    },
    async listHistory(homeId) {
      return (jget(HIST) || []).filter((e) => e.homeId === homeId).sort((a, b) => b.at - a.at);
    },
    async markUndone(id) {
      jset(HIST, (jget(HIST) || []).map((e) => (e.id === id ? { ...e, undoneAt: Date.now() } : e)));
    },
    addHistory(entry) {
      jset(HIST, [entry, ...(jget(HIST) || [])].slice(0, 300));
    },
    async listGrants(homeId) {
      return (jget(GRANTS) || []).filter((g) => g.homeId === homeId);
    },
    async listMyGrants() {
      return [];
    },
    async removeGrant(id) {
      jset(GRANTS, (jget(GRANTS) || []).filter((g) => g.id !== id));
    },
    async createClaim(homeId, code, { homeName = '', fromName = '' } = {}) {
      const claimId = randomToken();
      const exp = Date.now() + CLAIM_DAYS * 86400000;
      jset('panelbuddy:claim:' + claimId, { from: 'demo', homeId, codeHash: await codeHash(claimId, code), exp, homeName, fromName, at: Date.now() });
      jset('panelbuddy:private:claim_' + homeId, { code, claimId, exp });
      return { claimId, exp };
    },
    async listClaims(homeId) {
      return Object.keys(localStorage).filter((k) => k.startsWith('panelbuddy:claim:')).map((k) => ({ ...jget(k), id: k.slice('panelbuddy:claim:'.length) })).filter((c) => c.homeId === homeId);
    },
    async cancelClaim(claimId, homeId) {
      localStorage.removeItem('panelbuddy:claim:' + claimId);
      localStorage.removeItem('panelbuddy:guard:' + claimId);
      localStorage.removeItem('panelbuddy:private:claim_' + homeId);
    },
    // Demo hand-off: there's only this browser, so the home stays here; it just stops
    // being the installer's customer job, and the code is used up.
    async claimHome(claimId, code, { keepInstaller = true } = {}) {
      const claim = jget('panelbuddy:claim:' + claimId);
      const hash = await this.demoTry(claimId, code);
      if (!claim || claim.codeHash !== hash) throw Object.assign(new Error('wrong'), { code: 'ampmap/wrong' });
      if (toMillis(claim.exp) <= Date.now()) throw Object.assign(new Error('expired'), { code: 'ampmap/expired' });
      const home = data.homes.find((h) => h.id === claim.homeId);
      if (!home) throw Object.assign(new Error('gone'), { code: 'ampmap/gone' });
      const { customerId: _c, ...rest } = home;
      void _c;
      await this.put('homes', { ...rest, claimedAt: Date.now() });
      if (home.shareToken) await this.deleteEditCode(home.shareToken, claim.homeId);
      if (keepInstaller) jset(GRANTS, [...(jget(GRANTS) || []).filter((g) => g.homeId !== claim.homeId), { id: grantId('demo-owner', claim.homeId, 'installer'), owner: 'demo-owner', homeId: claim.homeId, editor: 'installer', editorName: claim.fromName || 'Installer', homeName: home.name, at: Date.now() }]);
      await this.cancelClaim(claimId, claim.homeId);
      return { homeId: claim.homeId, fromName: claim.fromName || '', homeName: home.name };
    },
    // the demo guest editor reads/writes this browser's data, one home only
    localBackend(homeId) {
      const self = this;
      return {
        subscribe(onData) {
          const send = () => onData({
            home: data.homes.find((h) => h.id === homeId) || null,
            panels: data.panels.filter((x) => x.homeId === homeId),
            breakers: data.breakers.filter((x) => x.homeId === homeId),
            devices: data.devices.filter((x) => x.homeId === homeId),
          });
          setTimeout(send, 0);
          listeners.add(send);
          return () => listeners.delete(send);
        },
        async commit(changes, entry) {
          for (const c of changes) {
            if (c.after) await self.put(c.col, c.after);
            else await self.remove(c.col, c.id);
          }
          self.addHistory(entry);
        },
        async getPhoto(id) {
          return localStorage.getItem(PHOTO + id) || null;
        },
        async putPhoto(id, dataUrl) {
          return self.putPhoto(id, dataUrl);
        },
        async removePhoto(id) {
          return self.removePhoto(id);
        },
        async stillHasAccess() {
          return true;
        },
        async registerPanels(token, panelIds) {
          for (const pid of panelIds) if (!localStorage.getItem('panelbuddy:sharedPanel:' + pid)) localStorage.setItem('panelbuddy:sharedPanel:' + pid, token);
        },
        async lookupPanelShare(panelId) {
          return localStorage.getItem('panelbuddy:sharedPanel:' + panelId);
        },
        async getShare(token) {
          return jget(SHARE + token);
        },
        async refreshShare(token, payload) {
          localStorage.setItem(SHARE + token, JSON.stringify({ ...payload, updatedAt: Date.now() }));
        },
      };
    },
    async lookupPanelShare(panelId) {
      return localStorage.getItem('panelbuddy:sharedPanel:' + panelId);
    },
    async getShare(token) {
      try { return JSON.parse(localStorage.getItem(SHARE + token) || 'null'); } catch { return null; }
    },
    async deleteShare(token, panelIds = []) {
      for (const pid of panelIds) localStorage.removeItem('panelbuddy:sharedPanel:' + pid);
      localStorage.removeItem(SHARE + token);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async put(col, obj) {
      const list = data[col];
      const i = list.findIndex((x) => x.id === obj.id);
      const clean = JSON.parse(JSON.stringify({ ...obj, updatedAt: Date.now() }));
      if (i >= 0) list[i] = clean;
      else list.push(clean);
      save();
      emit();
      return clean;
    },
    async remove(col, id) {
      data[col] = data[col].filter((x) => x.id !== id);
      save();
      emit();
    },
    async getPhoto(id) {
      return localStorage.getItem(PHOTO + id) || null;
    },
    async putPhoto(id, dataUrl) {
      try {
        localStorage.setItem(PHOTO + id, dataUrl);
      } catch (e) {
        alert('Not enough space on this device for another photo in demo mode.');
        throw e;
      }
    },
    async removePhoto(id) {
      localStorage.removeItem(PHOTO + id);
    },
    async replaceAll(next) {
      const settings = (next && next.settings) || (data && data.settings) || { accountType: 'personal' };
      data = { homes: [], panels: [], breakers: [], devices: [], customers: [], settings };
      for (const c of COLS) data[c] = Array.isArray(next[c]) ? next[c] : [];
      save();
      emit();
    },
    async resetDemo() {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PHOTO))
        .forEach((k) => localStorage.removeItem(k));
      const settings = data && data.settings;
      data = seedData();
      if (settings) data.settings = settings;
      save();
      emit();
    },
  };
}
