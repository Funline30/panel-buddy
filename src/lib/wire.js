// Wire: what wire feeds a circuit (breaker.wire) and, optionally, one outlet / device
// (device.wire = an override). Everything is optional and blank by default; a missing
// or empty wire object = not recorded, so every home saved before this loads unchanged.
// An outlet with no wire of its own uses its breaker's wire.

export const WIRE_SIZES = [
  { value: '', label: 'Not set' },
  { value: '14', label: '14 AWG' },
  { value: '12', label: '12 AWG' },
  { value: '10', label: '10 AWG' },
  { value: '8', label: '8 AWG' },
  { value: '6', label: '6 AWG' },
  { value: 'other', label: 'Other' },
];
export const WIRE_TYPES = [
  { value: '', label: 'Not set' },
  { value: 'nm', label: 'NM-B (Romex)', short: 'NM-B' },
  { value: 'mc', label: 'MC cable', short: 'MC' },
  { value: 'thhn', label: 'THHN in conduit', short: 'THHN' },
  { value: 'uf', label: 'UF (outdoor / buried)', short: 'UF' },
  { value: 'al', label: 'Aluminum', short: 'Aluminum' },
  { value: 'other', label: 'Other' },
];
export const WIRE_CONDUCTORS = [
  { value: '', label: 'Not set' },
  { value: '2g', label: '2 + ground' },
  { value: '3g', label: '3 + ground' },
  { value: '2', label: '2, no ground (old)' },
  { value: 'single', label: 'Singles (conduit)' },
  { value: 'other', label: 'Other' },
];
export const WIRE_COLORS = [
  { value: '', label: 'Not set' },
  { value: 'white', label: 'White', size: '14' },
  { value: 'yellow', label: 'Yellow', size: '12' },
  { value: 'orange', label: 'Orange', size: '10' },
  { value: 'black', label: 'Black' },
  { value: 'gray', label: 'Gray (UF)' },
  { value: 'other', label: 'Other' },
];
// Romex (NM-B) jacket color code, newer cable: white 14, yellow 12, orange 10, black 8 or 6.
export const JACKET_SIZE = { white: '14', yellow: '12', orange: '10' };

const FIELDS = ['size', 'sizeOther', 'type', 'typeOther', 'cond', 'condOther', 'color', 'note'];
const lab = (list, v) => (list.find((o) => o.value === v) || {}).label || '';

// Keep only filled-in fields; null when nothing is set (so nothing extra gets saved).
export function cleanWire(w) {
  if (!w || typeof w !== 'object') return null;
  const out = {};
  for (const k of FIELDS) {
    const v = w[k] == null ? '' : String(w[k]).trim();
    if (v) out[k] = v;
  }
  if (out.size !== 'other') delete out.sizeOther;
  if (out.type !== 'other') delete out.typeOther;
  if (out.cond !== 'other') delete out.condOther;
  return Object.keys(out).length ? out : null;
}
export const hasWire = (w) => !!cleanWire(w);

// Read the wire fields off a form (names prefixed, e.g. "wsize", "wtype"...).
export function wireFromForm(v, p = 'w') {
  return cleanWire({ size: v[p + 'size'], sizeOther: v[p + 'sizeOther'], type: v[p + 'type'], typeOther: v[p + 'typeOther'], cond: v[p + 'cond'], condOther: v[p + 'condOther'], color: v[p + 'color'], note: v[p + 'note'] });
}

export function sizeText(w) {
  w = cleanWire(w) || {};
  if (!w.size) return '';
  if (w.size === 'other') return w.sizeOther || 'Other size';
  return `${w.size} AWG`;
}
export function typeText(w, short = false) {
  w = cleanWire(w) || {};
  if (!w.type) return '';
  if (w.type === 'other') return w.typeOther || 'Other';
  const t = WIRE_TYPES.find((o) => o.value === w.type) || {};
  return (short ? t.short : t.label) || '';
}
export function condText(w) {
  w = cleanWire(w) || {};
  if (!w.cond) return '';
  if (w.cond === 'other') return w.condOther || 'Other';
  return { '2g': '2 + ground', '3g': '3 + ground', 2: '2, no ground', single: 'Single wires' }[w.cond] || '';
}
export const colorText = (w) => { w = cleanWire(w) || {}; return w.color ? lab(WIRE_COLORS, w.color).replace(' (UF)', '') : ''; };

// The cable callout electricians write: "12/2 w/ground", "10/3 w/ground", "14/2 no ground".
export function cableText(w) {
  w = cleanWire(w) || {};
  const n = /^\d+$/.test(w.size || '') ? w.size : '';
  if (n && (w.cond === '2g' || w.cond === '3g')) return `${n}/${w.cond[0]} w/ground`;
  if (n && w.cond === '2') return `${n}/2 no ground`;
  return '';
}

// One short line: "12/2 w/ground · NM-B (Romex) · yellow". Empty string = not recorded.
export function wireText(w, { short = false } = {}) {
  w = cleanWire(w);
  if (!w) return '';
  const cable = cableText(w);
  const parts = cable ? [cable] : [sizeText(w), condText(w)];
  parts.push(typeText(w, short));
  if (w.color && !short) parts.push(colorText(w).toLowerCase() + ' jacket');
  const s = parts.filter(Boolean).join(' · ');
  return s || (w.note ? (short ? 'Note only' : w.note) : '');
}
// Tiny tag for rows / labels: "12/2", "12 AWG", "THHN"...
export function wireTag(w) {
  w = cleanWire(w);
  if (!w) return '';
  const n = /^\d+$/.test(w.size || '') ? w.size : '';
  if (n && (w.cond === '2g' || w.cond === '3g' || w.cond === '2')) return `${n}/${w.cond[0]}`;
  if (n) return `${n} AWG`;
  return w.size === 'other' ? (w.sizeOther || '') : typeText(w, true);
}

// Outlet / row label: "12/2 · 12 AWG" (cable + size), else the size or type alone.
export function wireShort(w) {
  w = cleanWire(w);
  if (!w) return '';
  const n = /^\d+$/.test(w.size || '') ? w.size : '';
  if (n && ['2g', '3g', '2'].includes(w.cond)) return `${n}/${w.cond[0]} · ${n} AWG`;
  return sizeText(w) || typeText(w, true) || condText(w) || '';
}

// The wire an outlet actually has: its own override, else its breaker's.
export function effectiveWire(device, breaker) {
  const own = cleanWire(device && device.wire);
  if (own) return { wire: own, from: 'outlet' };
  const b = cleanWire(breaker && breaker.wire);
  if (b) return { wire: b, from: 'circuit' };
  return { wire: null, from: '' };
}

// Usual max breaker for a wire size (general guidance, NEC 240.4(D) small-conductor
// limits and the common ampacity columns). Copper: 14->15A, 12->20A, 10->30A; 8 and 6
// depend on the cable (NM-B / UF use the 60C column: 8->40A, 6->55A; THHN / MC 75C:
// 8->50A, 6->65A). Aluminum: 12->15A, 10->25A, 8->40A, 6->50A.
const CU = { 14: 15, 12: 20, 10: 30 };
const CU_60 = { 8: 40, 6: 55 };
const CU_75 = { 8: 50, 6: 65 };
const AL = { 12: 15, 10: 25, 8: 40, 6: 50 };
export function usualMaxAmps(w) {
  w = cleanWire(w);
  if (!w || !/^\d+$/.test(w.size || '')) return 0;
  const n = Number(w.size);
  if (w.type === 'al') return AL[n] || 0;
  if (CU[n]) return CU[n];
  return (w.type === 'thhn' || w.type === 'mc' ? CU_75 : CU_60)[n] || 0;
}

export const WIRE_GUIDANCE = 'General guidance for typical wire, not a code ruling. Check the markings on the wire and your local code.';

// Gentle checks. Never blocks saving. Returns a list of { kind, text }.
// amps = the breaker's rating (number, 0 = unknown).
export function wireChecks(w, amps) {
  w = cleanWire(w);
  if (!w) return [];
  const out = [];
  const max = usualMaxAmps(w);
  const al = w.type === 'al' ? ' aluminum' : '';
  if (w.type === 'al' && w.size === '14') out.push({ kind: 'size', text: 'Check: 14 AWG aluminum is not a usual size for a circuit' });
  else if (max && amps > max) out.push({ kind: 'size', text: `Check: ${w.size} AWG${al} is usually rated for ${max}A, and this breaker is ${amps}A` });
  const jacket = JACKET_SIZE[w.color];
  if (jacket && /^\d+$/.test(w.size || '') && w.size !== jacket && (!w.type || w.type === 'nm'))
    out.push({ kind: 'color', text: `Check: a ${w.color} Romex jacket is usually ${jacket} AWG` });
  return out;
}
export const wireWarning = (w, amps) => (wireChecks(w, amps)[0] || null);
