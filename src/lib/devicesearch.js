// Device search: forgiving type-ahead over the built-in catalog of household devices,
// plus "where is it plugged in" matching against the user's own outlets, breakers and
// the loads they've listed. Pure functions (no DOM) so they can be tested in Node.
import { CATALOG, CATEGORIES } from './catalog.js';
import { search as homeSearch, parseBreakerQuery } from './search.js';

const STOP = new Set([
  'a', 'an', 'the', 'my', 'our', 'is', 'are', 'was', 's', 'it', 'its', 'i', 'me', 'we', 'of', 'for', 'to', 'do', 'does',
  'where', 'wheres', 'what', 'whats', 'which', 'who', 'how', 'much', 'many', 'find', 'show', 'see', 'can', 'could',
  'plugged', 'plug', 'plugs', 'plugin', 'in', 'into', 'on', 'at', 'located', 'location', 'goes', 'go', 'use', 'uses',
  'using', 'draw', 'draws', 'pull', 'pulls', 'power', 'watts', 'watt', 'wattage', 'amps', 'amp', 'amperage', 'need', 'needs',
  'run', 'runs', 'running', 'and', 'or', 'with', 'there', 'this', 'that', 'be', 'typical', 'usually',
]);

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/(\d)\s*("|''|”|inch(es)?\b|in\b)/g, '$1 inch ')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function queryTokens(q) {
  return normalize(q)
    .split(' ')
    .filter((t) => t && !STOP.has(t) && t !== 'inch');
}

function stem(t) {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && /(ches|shes|xes|sses)$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

// Optimal-string-alignment distance, bailing out once it passes `max`.
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

function wordsOf(phrase) {
  const w = phrase.split(' ').filter(Boolean);
  const out = new Set(w);
  for (let i = 0; i < w.length - 1; i++) out.add(w[i] + w[i + 1]); // "air fryer" also matches "airfryer"
  return out;
}

// One token vs one set of words. Returns 0 when nothing matches.
function tokenScore(t, words) {
  const st = stem(t);
  let best = 0;
  for (const w of words) {
    let s = 0;
    if (w === t || w === st || stem(w) === st) s = 10;
    else if (t.length >= 2 && w.startsWith(t)) s = 7;
    else if (st.length >= 3 && w.startsWith(st)) s = 6;
    else if (t.length >= 4 && w.length >= 4) {
      const max = t.length >= 7 ? 2 : 1;
      if (editDistance(t, w, max) <= max || editDistance(st, stem(w), max) <= max) s = 4;
      else if (t.length >= 5 && w.length > t.length && editDistance(t, w.slice(0, t.length), 1) <= 1) s = 3; // typo while still typing
    }
    if (s > best) best = s;
    if (best === 10) break;
  }
  return best;
}

function prep(entry) {
  const name = normalize(entry.name);
  const aka = entry.aka.map(normalize);
  const cat = (CATEGORIES.find((c) => c.id === entry.cat) || {}).label || '';
  return {
    entry,
    name,
    aka,
    nameWords: wordsOf(name),
    akaWords: wordsOf(aka.join(' ')),
    catWords: wordsOf(normalize(cat)),
    flat: [name, ...aka].map((p) => p.replace(/ /g, '')),
  };
}
let PREPPED = null;
const prepped = () => (PREPPED ||= CATALOG.map(prep));

function scoreEntry(p, toks, phrase) {
  if (!toks.length) return 0;
  let s = 0;
  const whole = (txt) => (' ' + txt + ' ').includes(' ' + phrase + ' ');
  if (p.name === phrase) s += 100;
  else if (p.aka.includes(phrase)) s += 90;
  else if (p.name.startsWith(phrase)) s += 70;
  else if (whole(p.name)) s += 60;
  else if (p.aka.some((a) => a.startsWith(phrase))) s += 50;
  else if (p.aka.some(whole)) s += 42;
  else if (phrase.length >= 3 && p.name.includes(phrase)) s += 35;
  else if (phrase.length >= 4 && p.flat.some((f) => f.includes(phrase.replace(/ /g, '')))) s += 30;
  let tokSum = 0;
  for (const t of toks) {
    const n = tokenScore(t, p.nameWords);
    const a = tokenScore(t, p.akaWords);
    const c = tokenScore(t, p.catWords);
    const best = Math.max(n ? n + 2 : 0, a, c ? c - 3 : 0);
    if (best <= 0) {
      if (s >= 30) continue; // phrase already matched
      return 0; // every word has to match something
    }
    tokSum += best;
  }
  return s + tokSum;
}

// Catalog matches for a query, best first: [{ entry, score }]
export function searchCatalog(query, { limit = 40, cat = '' } = {}) {
  const toks = queryTokens(query);
  const pool = prepped().filter((p) => !cat || p.entry.cat === cat);
  if (!toks.length) return cat ? pool.map((p) => ({ entry: p.entry, score: 1 })) : [];
  const phrase = toks.join(' ');
  const out = [];
  for (const p of pool) {
    const s = scoreEntry(p, toks, phrase);
    if (s > 0) out.push({ entry: p.entry, score: s });
  }
  if (!out.length && toks.length > 1) {
    // Nothing matched every word (e.g. a brand + model like "Ninja Foodi XL Pro grill"):
    // fall back to the entries that match the most words, flagged as partial.
    const FILLER = new Set(['pro', 'xl', 'xxl', 'max', 'plus', 'mini', 'smart', 'deluxe', 'ultra', 'series', 'new', 'old', 'big', 'small', 'large', 'model', 'x', 's', 'inch']);
    const keyToks = toks.filter((t) => !FILLER.has(t));
    for (const p of pool) {
      let hits = 0;
      let sum = 0;
      for (const t of keyToks) {
        const n = tokenScore(t, p.nameWords);
        let v = Math.max(n ? n + 5 : 0, tokenScore(t, p.akaWords));
        if (p.name === t || p.aka.includes(t)) v += 10; // the word IS this thing ("fridge")
        if (v >= 6) { hits++; sum += v; }
      }
      if (hits) out.push({ entry: p.entry, score: hits * 20 + sum, partial: true });
    }
    out.sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length);
    return out.slice(0, Math.min(limit, 6));
  }
  out.sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length);
  return out.slice(0, limit);
}

// Best catalog guess for a free-text label like "Refrigerator (running)" or "kids PS5".
export function matchCatalog(label) {
  const toks = queryTokens(label);
  if (!toks.length) return null;
  const phrase = toks.join(' ');
  let best = null;
  for (const p of prepped()) {
    // a label matches an entry when most of the label's words hit the entry's words
    let hits = 0;
    let sum = 0;
    for (const t of toks) {
      const v = Math.max(tokenScore(t, p.nameWords), tokenScore(t, p.akaWords));
      if (v >= 6) { hits++; sum += v; }
    }
    let s = 0;
    if (p.name === phrase || p.aka.includes(phrase)) s = 200;
    else if (hits && hits >= Math.ceil(toks.length * 0.6)) s = sum + hits * 5 - (toks.length - hits) * 4;
    if (s > 0 && (!best || s > best.score)) best = { entry: p.entry, score: s };
  }
  return best ? best.entry : null;
}

// The catalog entries a query is "about" (the top hits), used to link user data to a query.
function topIds(query) {
  const hits = searchCatalog(query, { limit: 8 });
  if (!hits.length) return new Set();
  const top = hits[0].score;
  return new Set(hits.filter((h) => h.score >= top * 0.85).map((h) => h.entry.id));
}

function textMatch(text, toks) {
  if (!toks.length) return 0;
  const words = wordsOf(normalize(text));
  let s = 0;
  for (const t of toks) {
    const v = tokenScore(t, words);
    if (v < 4) return 0;
    s += v;
  }
  return s;
}

// Search the user's own home: their listed loads ("what's plugged in"), outlets/devices and
// breakers. Results: { kind: 'load' | 'device' | 'breaker' | 'fuse', ... , score }
export function searchHome(query, data) {
  const { breakers = [], devices = [], panels = [] } = data;
  const raw = String(query || '');
  if (!raw.trim()) return [];
  // "breaker 7", "#7", "fuse 3": the original exact search handles those
  if (parseBreakerQuery(raw) != null || /fuse\s*#?\s*\d/i.test(raw)) return homeSearch(raw, data);

  const toks = queryTokens(raw);
  if (!toks.length) return [];
  const ids = topIds(raw);
  const phrase = toks.join(' ');
  const exact = (label) => (queryTokens(label).join(' ') === phrase ? 30 : 0);
  const linked = (label) => {
    if (!ids.size || !label) return false;
    const m = matchCatalog(label);
    return !!(m && ids.has(m.id));
  };
  const breakerById = new Map(breakers.map((b) => [b.id, b]));
  const out = [];
  const seen = new Set();
  const add = (r) => {
    const key = r.kind + ':' + (r.kind === 'load' ? `${r.device ? r.device.id : r.breaker.id}:${r.index}` : r.item.id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };

  const loadScore = (l) => {
    const t = textMatch(`${l.name} ${l.note || ''}`, toks);
    const k = linked(l.name) ? 25 : 0;
    return t || k ? t + k + exact(l.name) : 0;
  };
  // 1. things they've listed as plugged in (on an outlet or straight on a breaker)
  for (const d of devices) {
    (d.loads || []).forEach((l, index) => {
      const s = loadScore(l);
      if (s) add({ kind: 'load', load: l, index, device: d, breaker: breakerById.get(d.breakerId) || null, score: 300 + s });
    });
  }
  for (const b of breakers) {
    (b.loads || []).forEach((l, index) => {
      const s = loadScore(l);
      if (s) add({ kind: 'load', load: l, index, device: null, breaker: b, score: 300 + s });
    });
  }
  // 2. breakers / outlets whose own name is the thing ("Refrigerator", "Dryer")
  for (const b of breakers) {
    if (linked(b.label)) add({ kind: 'breaker', item: b, score: 200 + exact(b.label) });
  }
  for (const d of devices) {
    if (linked(d.name)) add({ kind: 'device', item: d, breaker: breakerById.get(d.breakerId) || null, score: 200 + exact(d.name) });
  }
  // 3. the original word search over breakers, outlets, rooms, notes, fuses
  const loadDeviceIds = new Set(out.filter((r) => r.kind === 'load' && r.device).map((r) => r.device.id));
  const loadBreakerIds = new Set(out.filter((r) => r.kind === 'load' && !r.device).map((r) => r.breaker.id));
  for (const r of homeSearch(toks.join(' '), { breakers, devices, panels, fuses: true })) {
    if (r.kind === 'device' && loadDeviceIds.has(r.item.id)) continue; // already shown via its load
    if (r.kind === 'breaker' && loadBreakerIds.has(r.item.id) && r.score < 200) continue;
    add({ ...r, score: 100 + (r.score || 0) });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// Everything the search screen needs: the user's own matches first, then the catalog.
export function searchAll(query, data, opts = {}) {
  return { home: searchHome(query, data), catalog: searchCatalog(query, opts) };
}

export function lookupUrl(text) {
  const q = `"${String(text || '').trim()}" watts amps nameplate specs`;
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}

// What adding `watts` to a breaker would do to its load check (for the "add to" picker).
export function projectedPct(summary, watts) {
  if (!summary || !summary.rating) return null;
  const amps = (summary.watts + (Number(watts) || 0)) / summary.volts;
  return (amps / summary.rating) * 100;
}

// amps -> watts helper for the add flow (120V unless the device is 240V)
export function wattsFromAmps(amps, volts = 120) {
  const a = Number(amps);
  return a > 0 ? Math.round(a * (Number(volts) || 120)) : 0;
}
