// Edit codes, homeowner hand-off and edit history: the pure logic (no Firebase here).
//
// Security model (see firestore.rules):
//  * A code is never stored. We store sha256("ampmap:v1:" + link token + ":" + CODE) in a
//    document only the owner can read; the electrician's device sends the same hash and the
//    security rules compare the two. The link token is a per-home salt, so one hash says
//    nothing about another home's code.
//  * Every attempt is counted per link: at most GUARD_MAX tries per GUARD_WINDOW_MS for
//    everyone together, then a lockout until the hour is up (or the owner makes a new code).

export const GUARD_MAX = 10;
export const GUARD_WINDOW_MS = 60 * 60 * 1000;
export const TEMP_CODE_DIGITS = 6;
export const CLAIM_CODE_LEN = 8;
// No 0/O, 1/I/L: easy to read off a sticker and type.
export const CLAIM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CLAIM_DAYS = 30;
export const MIN_CUSTOM_CODE = 6;
export const MAX_CUSTOM_CODE = 32;

export const EXPIRY_CHOICES = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: 'off', label: 'Until I turn it off' },
];

// Codes are typed on phones: ignore case, spaces and dashes.
export function normalizeCode(code) {
  return String(code == null ? '' : code).toUpperCase().replace(/[\s\-–—]+/g, '');
}

export function hashInput(token, code) {
  return `ampmap:v1:${token}:${normalizeCode(code)}`;
}

export async function sha256Hex(text) {
  const c = globalThis.crypto;
  const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function codeHash(token, code) {
  return sha256Hex(hashInput(token, code));
}

// Unbiased random index in [0, n).
function randIndex(n, rand) {
  if (rand) return Math.floor(rand() * n) % n;
  const max = Math.floor(256 / n) * n;
  const a = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(a);
    if (a[0] < max) return a[0] % n;
  }
}

export function makeTempCode(rand) {
  let s = '';
  for (let i = 0; i < TEMP_CODE_DIGITS; i++) s += String(randIndex(10, rand));
  return s;
}

export function makeClaimCode(rand) {
  let s = '';
  for (let i = 0; i < CLAIM_CODE_LEN; i++) s += CLAIM_ALPHABET[randIndex(CLAIM_ALPHABET.length, rand)];
  return s;
}

// "K7MP-3QXR" for printing; typing it with or without the dash both work.
export function prettyClaimCode(code) {
  const c = normalizeCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export function randomToken(bytes = 18) {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
}

// Problem with a code the homeowner typed, or '' if it's fine.
export function customCodeProblem(code) {
  const c = normalizeCode(code);
  if (c.length < MIN_CUSTOM_CODE) return `Use at least ${MIN_CUSTOM_CODE} characters.`;
  if (c.length > MAX_CUSTOM_CODE) return `Use ${MAX_CUSTOM_CODE} characters or fewer.`;
  if (/^(\d)\1+$/.test(c) || ['123456', '1234567', '12345678', '654321', 'PASSWORD', 'QWERTY'].includes(c)) return 'That one is too easy to guess. Try another.';
  return '';
}

export function expiryFor(choice, now = Date.now()) {
  if (choice === '24h') return now + 24 * 3600 * 1000;
  if (choice === '7d') return now + 7 * 24 * 3600 * 1000;
  return null;
}

export const toMillis = (t) => {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
  const n = Date.parse(t);
  return Number.isNaN(n) ? null : n;
};

function whenText(ms, now) {
  const d = new Date(ms);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today ${time}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

// What the homeowner sees about their edit code.
export function codeStatus(c, now = Date.now()) {
  if (!c) return { state: 'none', on: false, text: 'Off. Nobody can edit with a code.' };
  if (!c.on) return { state: 'off', on: false, text: 'Off. The old code no longer works.' };
  const exp = toMillis(c.exp);
  if (exp != null && exp <= now) return { state: 'expired', on: false, text: `Expired ${whenText(exp, now)}. The code no longer works.` };
  const kind = c.kind === 'temp' ? 'Temporary code' : 'Your own code';
  return { state: 'on', on: true, text: `On · ${kind} · ${exp == null ? 'works until you turn it off' : 'works until ' + whenText(exp, now)}` };
}

// What to write to codeGuards/{token} for the next attempt, or a lockout.
export function guardNext(guard, now = Date.now()) {
  const since = guard && toMillis(guard.since);
  if (!guard || since == null || now - since >= GUARD_WINDOW_MS) return { locked: false, n: 1, newWindow: true, create: !guard };
  if ((guard.n || 0) >= GUARD_MAX) return { locked: true, until: since + GUARD_WINDOW_MS };
  return { locked: false, n: (guard.n || 0) + 1, newWindow: false, create: false };
}

export function triesLeft(guard, now = Date.now()) {
  const g = guardNext(guard, now);
  if (g.locked) return 0;
  return GUARD_MAX - g.n;
}

// ---------------------------------------------------------------- edit history
const FIELD_NAMES = {
  breakers: { label: 'label', amps: 'amps', ampsOther: 'amps', slot: 'spot', poles: 'poles', size: 'size', half: 'half', btype: 'type', rooms: 'rooms', kind: 'kind', notes: 'notes', wire: 'wire', panelId: 'panel', on: 'on/off', loads: 'items', groupId: 'tandem' },
  devices: { name: 'name', type: 'type', room: 'room', breakerId: 'breaker', wire: 'wire', notes: 'notes', style: 'style', qty: 'qty', box: 'box', replace: 'needs replacing', pos: 'map spot', loads: 'plugged in', wall: 'wall', gfci: 'GFCI', photoId: 'photo' },
  panels: { name: 'name', location: 'location', mainAmps: 'main amps', mainAmpsOther: 'main amps', spaces: 'spaces', type: 'type', numbering: 'numbering', layout: 'layout', fuses: 'fuses', notes: 'notes' },
};
const SKIP = new Set(['id', 'updatedAt', 'createdAt', 'homeId']);
const KIND_WORD = { breakers: 'breaker', devices: 'outlet', panels: 'panel', homes: 'home' };

// Blank-ish values ('' / null / [] / {}) count as the same, and 20 equals "20": an edit form
// that re-saves untouched fields shouldn't show up as a change.
function norm(v) {
  if (v == null || v === '') return null;
  if (Array.isArray(v)) { const a = v.map(norm).filter((x) => x != null); return a.length ? a : null; }
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) { const n = norm(v[k]); if (n != null) o[k] = n; }
    return Object.keys(o).length ? o : null;
  }
  return String(v);
}
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const short = (v) => {
  if (v == null || v === '') return '(blank)';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(none)';
  if (typeof v === 'object') return '…';
  const s = String(v);
  return s.length > 40 ? s.slice(0, 39) + '…' : s;
};

// Fields that changed, as friendly names (deduped, in a stable order).
// Values an edit form fills in by itself (same meaning as blank).
const DEFAULTS = { breakers: { size: 'full', btype: 'single', kind: 'standard' }, devices: { status: 'ok', qty: '1' } };
const dflt = (col, k, v) => (DEFAULTS[col] && DEFAULTS[col][k] === v ? null : v);
export function changedFields(col, before, after) {
  const names = FIELD_NAMES[col] || {};
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter((k) => !SKIP.has(k));
  const out = [];
  for (const k of keys) {
    if (same(dflt(col, k, (before || {})[k]), dflt(col, k, (after || {})[k]))) continue;
    const n = names[k] || k;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

// One plain line per change: "Breaker #9 Kitchen: label "Kitchen" → "Kitchen counter"".
// opts.name(col, obj) names the item; opts.wireText(w) formats wire.
export function describeChange({ col, before, after }, opts = {}) {
  const nameOf = (o) => (opts.name ? opts.name(col, o) : (o && (o.label || o.name)) || '');
  const kind = KIND_WORD[col] || 'item';
  const cap = kind[0].toUpperCase() + kind.slice(1);
  if (!before && after) return `Added ${kind} ${nameOf(after)}`.trim();
  if (before && !after) return `Removed ${kind} ${nameOf(before)}`.trim();
  const fields = changedFields(col, before, after);
  if (!fields.length) return `${cap} ${nameOf(after)}: no visible change`.trim();
  const parts = [];
  const plain = ['label', 'name', 'amps', 'room', 'location', 'notes', 'main amps', 'poles', 'type', 'kind', 'qty', 'style', 'box'];
  for (const f of fields) {
    const key = Object.keys(FIELD_NAMES[col] || {}).find((k) => (FIELD_NAMES[col] || {})[k] === f) || f;
    if (f === 'wire' && opts.wireText) parts.push(`wire ${short(opts.wireText(before.wire))} → ${short(opts.wireText(after.wire))}`);
    else if (plain.includes(f)) parts.push(`${f} ${quote(before[key])} → ${quote(after[key])}`);
    else if (f === 'rooms') parts.push(`rooms ${short(before.rooms)} → ${short(after.rooms)}`);
    else if (f === 'breaker' && opts.breakerName) parts.push(`moved to breaker ${opts.breakerName(after.breakerId)}`);
    else parts.push(`${f} changed`);
  }
  return `${cap} ${nameOf(after)}: ${parts.join(', ')}`.replace(/\s+:/, ':');
}
const quote = (v) => (v == null || v === '' ? '(blank)' : `"${short(v)}"`);

// A history entry from a batch of changes.
export function historyEntry({ id, homeId, by, uid, at, changes, lines }) {
  return { id, homeId, by: String(by || 'Someone').slice(0, 80), uid, at, changes, summary: lines.slice(0, 20) };
}

// The entry the owner can undo now: the newest one not undone yet.
export function undoable(entries) {
  const list = [...(entries || [])].sort((a, b) => (toMillis(b.at) || 0) - (toMillis(a.at) || 0));
  return list.find((e) => !e.undoneAt) || null;
}

// What undoing an entry writes: put the "before" back (or remove what was added), newest change first.
export function undoOps(entry) {
  return [...(entry.changes || [])].reverse().map((c) => (c.before ? { op: 'put', col: c.col, obj: { ...c.before, id: c.id } } : { op: 'remove', col: c.col, id: c.id }));
}

// Merge several changes to the same item (made within one save) into one before → after.
export function mergeChanges(list) {
  const map = new Map();
  for (const c of list) {
    const k = c.col + '/' + c.id;
    if (!map.has(k)) map.set(k, { ...c });
    else map.get(k).after = c.after;
  }
  return [...map.values()].filter((c) => !(c.before == null && c.after == null) && !same(c.before, c.after));
}

// ---------------------------------------------------------------- hand-off (claim)
// Copy of a home for its new owner: same ids (QR stickers keep working), minus the
// installer's own customer link.
export function claimCopy(src) {
  const home = { ...src.home };
  delete home.customerId;
  delete home.lastOpenedAt;
  delete home.openCount;
  return {
    home,
    panels: (src.panels || []).map((x) => ({ ...x })),
    breakers: (src.breakers || []).map((x) => ({ ...x })),
    devices: (src.devices || []).map((x) => ({ ...x })),
    photos: (src.photos || []).map((x) => ({ ...x })),
  };
}

// Photo ids a home uses (panel photos, outlet photos, floor plan photo).
export function homePhotoIds(home, panels = [], devices = []) {
  const ids = new Set();
  for (const p of panels) if (p.photoId) ids.add(p.photoId);
  for (const d of devices) if (d.photoId) ids.add(d.photoId);
  if (home && home.floorplan && home.floorplan.photoId) ids.add(home.floorplan.photoId);
  return [...ids];
}

export const grantId = (owner, homeId, editor) => `${owner}_${homeId}_${editor}`;

export function claimStatus(claim, now = Date.now()) {
  if (!claim) return { state: 'none', text: '' };
  const exp = toMillis(claim.exp);
  if (exp != null && exp <= now) return { state: 'expired', text: 'The setup code expired. Make a new one.' };
  return { state: 'on', text: `Waiting for the homeowner · code works until ${new Date(exp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` };
}
