// Search across breakers and devices. Understands "breaker 7", "#7", "slot 7",
// and plain words ("bathroom fan", "gfci", "dead").
import { labelOf, DEVICE_TYPES, STATUS_OPTIONS, GFCI_OPTIONS, styleOf } from './options.js';
import { slotsFor, layoutOf } from './panel.js';

export function breakerSlots(b, layout = 'two') {
  return slotsFor(b, layout);
}

export function parseBreakerQuery(q) {
  const m = String(q || '').toLowerCase().match(/(?:breaker|slot|circuit|space|#)\s*#?\s*(\d{1,3})/);
  if (m) return parseInt(m[1], 10);
  const bare = String(q || '').trim().match(/^#?(\d{1,3})$/);
  return bare ? parseInt(bare[1], 10) : null;
}

const STOP = new Set(['what', 'whats', "what's", 'is', 'on', 'the', 'which', 'breaker', 'a', 'an', 'of', 'for', 'does', 'do', 'go', 'goes', 'to', 'in', 'my', 'where', 'and', 'circuit', 'slot']);

export function tokens(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9#\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

function stem(t) {
  return t.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');
}

function hayFor(parts) {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function score(hay, toks) {
  if (!toks.length) return 0;
  let s = 0;
  for (const t of toks) {
    const st = stem(t);
    if (hay.includes(t)) s += 2;
    else if (st.length > 2 && hay.includes(st)) s += 1;
    else return 0; // every word must match something
  }
  return s;
}

export function search(query, data) {
  const { breakers = [], devices = [], panels = [], fuses = true } = data;
  const panelName = (id) => (panels.find((p) => p.id === id) || {}).name || '';
  const layoutFor = (b) => layoutOf(panels.find((p) => p.id === b.panelId));
  const breakerById = new Map(breakers.map((b) => [b.id, b]));
  const results = [];
  const fm = String(query || '').toLowerCase().match(/fuse\s*#?\s*(\d{1,3})/);
  if (fm) {
    for (const p of panels) (p.fuses || []).forEach((f, index) => { if (String(f.num) === fm[1]) results.push({ kind: 'fuse', item: f, panel: p, index, score: 100 }); });
    return results;
  }
  const slot = parseBreakerQuery(query);

  if (slot != null) {
    for (const b of breakers) {
      if (breakerSlots(b, layoutFor(b)).includes(slot)) {
        results.push({ kind: 'breaker', item: b, score: 100 });
        for (const d of devices.filter((d) => d.breakerId === b.id)) {
          results.push({ kind: 'device', item: d, breaker: b, score: 90 });
        }
      }
    }
    return results;
  }

  const toks = tokens(query);
  if (!toks.length) return [];
  for (const b of breakers) {
    const hay = hayFor([b.label, (b.rooms || []).join(' '), b.notes, b.amps + 'a', b.amps + ' amp', panelName(b.panelId), (b.loads || []).map((l) => l.name).join(' '), b.kind]);
    const s = score(hay, toks);
    if (s) results.push({ kind: 'breaker', item: b, score: s + 1 });
  }
  for (const d of devices) {
    const b = breakerById.get(d.breakerId);
    const hay = hayFor([
      d.name,
      d.room,
      d.location,
      labelOf(DEVICE_TYPES, d.type),
      d.type,
      d.notes,
      labelOf(STATUS_OPTIONS, d.status),
      d.gfci && d.gfci !== 'no' && d.gfci !== 'unknown' ? 'gfci ' + labelOf(GFCI_OPTIONS, d.gfci) : '',
      d.afci && d.afci !== 'no' && d.afci !== 'unknown' ? 'afci' : '',
      (d.readings || []).map((r) => r.text).join(' '),
      (d.loads || []).map((l) => l.name).join(' '),
      styleOf(d) ? styleOf(d).label : '',
      d.replace === 'yes' ? 'replace needs replacing' : '',
    ]);
    const s = score(hay, toks);
    if (s) results.push({ kind: 'device', item: d, breaker: b, score: s + 2 });
  }
  if (fuses) {
    for (const p of panels) {
      (p.fuses || []).forEach((f, index) => {
        const hay = hayFor(['fuse', '12v', 'dc', f.num ? 'fuse ' + f.num : '', f.amps + 'a', f.powers, f.notes, p.name]);
        const s = score(hay, toks);
        if (s) results.push({ kind: 'fuse', item: f, panel: p, index, score: s });
      });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
