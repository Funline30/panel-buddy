// Demo / local mode: everything lives in this browser's localStorage.
import { seedData } from '../lib/seed.js';

const KEY = 'panelbuddy:data:v1';
const PHOTO = 'panelbuddy:photo:';
const COLS = ['homes', 'panels', 'breakers', 'devices', 'customers'];
const SHARE = 'panelbuddy:share:';

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
