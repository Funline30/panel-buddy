// Scan a panel label photo: turn the text read off a breaker panel directory (on-device OCR)
// into numbered circuits the person reviews before anything is saved.
// Pure functions only (no DOM): parseLabel(text) -> circuits, toBulkRows(circuits) -> rows for
// bulk.js planBulk (same breakers as typing them in), plus small image helpers (grayscale,
// contrast stretch) used before OCR. Printed labels read well; handwriting often doesn't.

// Words on a label that mean a big 240V appliance (2-pole) or a known piece of equipment.
// type = the Breakerly device type to suggest (pro.js), name = what to call that device.
export const SCAN_KEYWORDS = [
  { re: /\bdryers?\b/i, poles: '2', amps: '30', type: 'appliance', name: 'Dryer' },
  { re: /\b(range|stove)\b/i, poles: '2', amps: '50', type: 'appliance', name: 'Range' },
  { re: /\b(wall ?oven|ovens?|cook ?top)\b/i, poles: '2', amps: '40', type: 'appliance', name: 'Oven / cooktop' },
  { re: /(^|[^a-z])(a\/c|a\.c\.?|ac unit|ac|air ?cond\w*|condenser|compressor|heat ?pump|hvac)(?![a-z])/i, poles: '2', amps: '30', type: 'hvac', name: 'AC / heat pump' },
  { re: /\b(air ?handler|ahu|heat ?strips?|elec(tric)? heat|baseboard heat)\b/i, poles: '2', amps: '30', type: 'hvac', name: 'Air handler / heat' },
  { re: /\b(water ?heater|hot ?water|hwh|w\/h)(?![a-z])/i, poles: '2', amps: '30', type: 'waterheater', name: 'Water heater' },
  { re: /\b(ev|ev charger|car charger|charger|tesla)\b/i, poles: '2', amps: '50', type: 'ev', name: 'EV charger' },
  { re: /\bwell( ?pump)?\b/i, poles: '2', amps: '20', type: 'wellpump', name: 'Well pump' },
  { re: /\bsub[ -]?panel\b/i, poles: '2', amps: '60', type: 'subpanel', name: 'Sub-panel' },
  { re: /\b(hot ?tub|spa|jacuzzi)\b/i, poles: '2', amps: '50', type: 'appliance', name: 'Hot tub' },
  { re: /\b(welder|shop 240)\b/i, poles: '2', amps: '50', type: 'appliance', name: 'Welder' },
  { re: /\bfurnace\b/i, poles: '1', amps: '15', type: 'hvac', name: 'Furnace' },
  { re: /\bdish ?washer\b/i, poles: '1', amps: '20', type: 'appliance', name: 'Dishwasher' },
  { re: /\b(disposal|disposer|garbage disp\w*)\b/i, poles: '1', amps: '20', type: 'appliance', name: 'Disposal' },
  { re: /\bmicro(wave)?\b/i, poles: '1', amps: '20', type: 'appliance', name: 'Microwave' },
  { re: /\b(refrigerator|refrig|fridge|freezer)\b/i, poles: '1', amps: '20', type: 'appliance', name: 'Refrigerator' },
  { re: /\bwasher\b/i, poles: '1', amps: '20', type: 'appliance', name: 'Washer' },
  { re: /\bsump( ?pump)?\b/i, poles: '1', amps: '20', type: 'appliance', name: 'Sump pump' },
  { re: /\bsmoke|\bco det/i, poles: '1', amps: '15', type: 'smoke', name: 'Smoke detectors' },
];

const LIGHT_WORDS = /\b(lights?|lighting|ltg|lts|bedroom|bdrm|br|hall|closet|smoke|fan|porch|attic|stairs?)\b/i;

// Abbreviations electricians write -> plain words (keeps the label short).
const ABBR = [
  [/\bkit\b\.?/gi, 'kitchen'],
  [/\bbdrm\b|\bbedrm\b/gi, 'bedroom'],
  [/\bm(aste)?r? ?bdrm\b|\bmbr\b|\bmstr\b/gi, 'master bedroom'],
  [/\brecepts?\b|\brcpts?\b|\brecep\b|\brec\b|\bplugs\b/gi, 'outlets'],
  [/\blts\b|\bltg\b/gi, 'lights'],
  [/\bgar\b/gi, 'garage'],
  [/\bext\b\.?/gi, 'exterior'],
  [/\bbsmt\b/gi, 'basement'],
  [/\bliv(ing)? ?rm\b|\blr\b/gi, 'living room'],
  [/\bdin(ing)? ?rm\b/gi, 'dining room'],
  [/\bfam(ily)? ?rm\b/gi, 'family room'],
  [/\brm\b/gi, 'room'],
  [/\bw\/d\b/gi, 'washer / dryer'],
  [/\bd\/w\b|\bdw\b/gi, 'dishwasher'],
];
const KEEP_UPPER = ['A/C', 'AC', 'GFCI', 'GFI', 'AFCI', 'EV', 'HVAC', 'USB', 'TV', 'CO', 'AHU', 'HWH', 'MDP', 'LP', 'HP', 'SPD', 'RV', 'II', 'III'];

const SPACE_WORDS = /^(space|spc|blank|empty|none|n\/a|-+|—+)$/i;
const SPARE_WORDS = /^(spare|unused|not used)$/i;
const HEADER_WORDS = /\b(use copper|copper conductors|torque|warning|caution|danger|listed|ul |directory|circuit|description|location|schedule|panel ?board|load ?center|breaker no|ckt|no\.?\s*$|amps?\s*$|volts|phase|wire size|main breaker|main lugs?|square d|siemens|eaton|cutler|ge |homeline|qo |murray|challenger|zinsco)\b/i;

// ---------------------------------------------------------------- text clean-up
// Things OCR mixes up inside a number: O->0, l/I/|->1, S->5, B->8 (only next to digits).
export function fixNumberToken(tok) {
  const t = String(tok || '');
  if (/^[lI|!]$/.test(t)) return '1';
  if (!/^[0-9OoIlSB|!]+$/.test(t)) return t;
  if (!/\d/.test(t) && !/[lI|!]/.test(t) && t.length > 1) return t;
  return t.replace(/[Oo]/g, '0').replace(/[Il|!]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
}

export function cleanLine(line) {
  return String(line || '')
    .replace(/\t+| {3,}/g, ' | ') // a wide gap = next column
    .replace(/[\u2014\u2013\u2012]/g, '-')
    .replace(/[\u2018\u2019`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[_~=*•·°¤]+/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\[|\]|\{|\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceCase(s) {
  s = s.replace(/\bGF[CI]{1,2}[)|l1!]?(?![a-z])/gi, 'GFCI').replace(/\bAF[CI]{1,2}[)|l1!]?(?![a-z])/gi, 'AFCI');
  const letters = s.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  let out = s;
  if (letters.length && upper / letters.length > 0.6) {
    out = s.toLowerCase().replace(/[a-z][a-z/.']*/g, (w) => {
      const W = w.toUpperCase();
      return KEEP_UPPER.includes(W.replace(/\.$/, '')) ? W : w;
    });
  }
  for (const [re, to] of ABBR) out = out.replace(re, to);
  out = out.replace(/\s+/g, ' ').trim().replace(/^[-:.,)#\s]+|[-:,(#\s]+$/g, '');
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}

// Pull amps / poles hints out of a label. -> { label, amps, poles }
export function splitHints(text) {
  let s = ` ${text} `;
  let amps = '';
  let poles = '';
  const am = s.match(/[\s(,/-]([0-9OoSIlB]{2,3})\s*-?\s*(?:a|amps?)(?![a-z/])/i);
  const an = am && /\d/.test(am[1]) ? Number(fixNumberToken(am[1])) : NaN;
  if (an >= 10 && an <= 400) { amps = String(an); s = s.replace(am[0], ' '); }
  const pm = s.match(/[\s(,/-](2|3|1)\s*-?\s*(?:p|pole|pl)(?![a-z])|\b(dp|double pole|2-pole)\b/i);
  if (pm) { poles = pm[2] ? '2' : pm[1]; s = s.replace(pm[0], ' '); }
  if (!poles && /\b240\s*v?\b/i.test(s)) { poles = '2'; s = s.replace(/\b240\s*v?\b/i, ' '); }
  s = s.replace(/\b120\s*v\b/i, ' ');
  return { label: s.replace(/\s+/g, ' ').trim(), amps, poles };
}

export function keywordFor(label) {
  return SCAN_KEYWORDS.find((k) => k.re.test(label)) || null;
}

// ---------------------------------------------------------------- line -> entries
// A slot number at the start of an entry: "1 Kitchen", "1. Kitchen", "#1 - Kitchen",
// "No. 1 Kitchen", "1) Kitchen", "1/3 Range" (2-pole pair). Not "20A" (that's amps).
const NUM = '(?:#\\s*|No\\.?\\s*|Ckt\\.?\\s*)?([0-9OoIlSB|!]{1,2}(?:\\s*[/&,+-]\\s*[0-9OoIl]{1,2})?)';
const START = new RegExp(`(^|\\s|\\|)${NUM}(?=\\s*[-.:)]?\\s*["'(]?[A-Za-z])`, 'g');

function readNumber(tok) {
  const pair = tok.match(/^(.+?)\s*[/&,+-]\s*(.+)$/);
  if (pair) {
    const a = parseInt(fixNumberToken(pair[1].trim()), 10);
    const b = parseInt(fixNumberToken(pair[2].trim()), 10);
    if (Number.isFinite(a) && Number.isFinite(b)) return { slot: Math.min(a, b), pair: Math.max(a, b) };
  }
  const n = parseInt(fixNumberToken(tok.trim()), 10);
  return Number.isFinite(n) ? { slot: n, pair: 0 } : null;
}

// All candidate entry starts in a line: [{ index, end, slot, pair }]
function starts(line) {
  const out = [];
  START.lastIndex = 0;
  let m;
  while ((m = START.exec(line))) {
    const tok = m[2];
    const after = line.slice(m.index + m[0].length);
    // "20A", "30 AMP", "2P" are hints, not slot numbers
    if (/^\s*(a|amps?|p|pole|v|volts?)(?![a-z/])/i.test(after)) continue;
    // a word glued in front ("Bedroom2") is part of the label
    const before = line.slice(0, m.index + m[1].length);
    if (/[A-Za-z]$/.test(before)) continue;
    // single letters that only look like numbers need a separator right after ("l. Kitchen")
    if (!/\d/.test(tok) && !/^\s*[-.:)]/.test(after)) {
      if (!(m.index === 0 && /^\s+[A-Za-z]{2}/.test(after))) continue;
    }
    const n = readNumber(tok);
    if (!n || n.slot < 1 || n.slot > 84) continue;
    out.push({ index: m.index + m[1].length, end: m.index + m[0].length, slot: n.slot, pair: n.pair });
  }
  return out;
}

function entryText(line, from, to) {
  return line.slice(from, to).replace(/^\s*[-.:)]\s*/, '').replace(/\|/g, ' ').trim();
}

// ---------------------------------------------------------------- the parser
// text: what OCR read. opts.layout 'two' (odd left / even right, the usual) or 'one'.
// -> { circuits, skipped, twoColumn, quality, numbered, lines }
export function parseLabel(text, opts = {}) {
  const layout = opts.layout === 'one' ? 'one' : 'two';
  const step2 = layout === 'two' ? 2 : 1; // distance between the two halves of a 2-pole
  let rawLines = String(text || '').split(/\r?\n/).map(cleanLine).filter(Boolean);
  // a number alone on its line belongs to the name on the next line ("13" / "RANGE 50A")
  const joined = [];
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i].replace(/^\|\s*|\s*\|$/g, '');
    const nx = rawLines[i + 1];
    if (/^(?:#\s*)?[0-9OoIlSB]{1,2}[.):-]?$/.test(l) && /\d/.test(fixNumberToken(l.replace(/[^0-9OoIlSB]/g, ''))) && nx && /[A-Za-z]{3}/.test(nx) && !HEADER_WORDS.test(nx) && !starts(nx).some((s) => s.index === 0)) {
      joined.push(`${l.replace(/[.):-]$/, '')} ${nx}`);
      i++;
    } else joined.push(rawLines[i]);
  }
  rawLines = joined.filter((l) => /[A-Za-z][^A-Za-z]?[A-Za-z]/.test(l));

  // Is it a two-column directory read across (odd | even on one line)?
  const found = rawLines.map((l) => ({ line: l, st: starts(l) }));
  const across = found.filter((f) => f.st.length >= 2 && f.st[1].slot === f.st[0].slot + 1 && f.st[0].slot % 2 === 1).length;
  const numberedLines = found.filter((f) => f.st.length >= 1).length;
  const twoColumn = across >= 2 && across >= numberedLines * 0.4;

  const entries = []; // { slot|null, pair, text, line }
  const skipped = [];
  for (const f of found) {
    const { line } = f;
    // a number in the middle of a line starts an entry only after a column gap ("|", wide space)
    let st = f.st.filter((s) => s.index === 0 || twoColumn || /^[\s|]*$/.test(line.slice(0, s.index)) || /\|\s*$/.test(line.slice(0, s.index)));
    if (twoColumn && st.length >= 2) {
      // keep only the second start that continues the first (1 | 2), ignore numbers inside labels
      const a = st[0];
      const b = st.slice(1).find((s) => s.slot === a.slot + 1 || (s.slot > a.slot && s.slot - a.slot <= 3));
      st = b ? [a, b] : [a];
    } else if (st.length > 1) st = [st[0]];
    if (!st.length) {
      const t = line.replace(/\|/g, ' ').trim();
      if (HEADER_WORDS.test(t) || t.replace(/[^A-Za-z]/g, '').length < 3 || t.split(/\s+/).length > 6) skipped.push(t);
      else entries.push({ slot: null, pair: 0, text: t, line });
      continue;
    }
    if (st[0].index > 0) {
      const lead = line.slice(0, st[0].index).replace(/\|/g, ' ').trim();
      if (lead && /[A-Za-z]{3,}/.test(lead) && !HEADER_WORDS.test(lead)) {
        // "KITCHEN 20A   | 2 DISHWASHER": the left column's number didn't read; it's the odd one before
        const even = st[0].slot % 2 === 0 && st[0].slot > 1;
        entries.push(even ? { slot: st[0].slot - 1, pair: 0, text: lead, line, inferred: true } : { slot: null, pair: 0, text: lead, line });
      }
    }
    st.forEach((s, i) => {
      const to = i + 1 < st.length ? st[i + 1].index : line.length;
      entries.push({ slot: s.slot, pair: s.pair, text: entryText(line, s.end, to), line });
    });
  }

  // A number that breaks the order (…9, 10, 1, 13…) probably lost a digit: 1 -> 11.
  const seq = entries.filter((e) => e.slot != null && !e.inferred);
  for (let i = 1; i < seq.length - 1; i++) {
    const p = seq[i - 1].slot, n = seq[i + 1].slot, e = seq[i];
    if (!(p < n && n - p <= 4 && (e.slot < p || e.slot > n))) continue;
    const digits = String(e.slot);
    for (let c = p + 1; c < n; c++) if (String(c).includes(digits)) { e.slot = c; e.inferred = true; break; }
  }

  // Unnumbered lines: fill a gap between numbered neighbours; drop headers above the first number.
  const numbered = entries.filter((e) => e.slot != null);
  const diffs = [];
  for (let i = 1; i < numbered.length; i++) diffs.push(numbered[i].slot - numbered[i - 1].slot);
  const twos = diffs.filter((d) => d === 2).length;
  const ones = diffs.filter((d) => d === 1).length;
  const step = !twoColumn && twos > ones ? 2 : 1;
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.slot != null) { out.push({ ...e, guessed: !!e.inferred }); continue; }
    if (!numbered.length) { out.push({ ...e, slot: out.length ? out[out.length - 1].slot + 1 : 1, guessed: true }); continue; }
    const prev = [...out].reverse().find((x) => x.slot != null);
    const nextIdx = entries.findIndex((x, j) => j > i && x.slot != null);
    if (!prev) { skipped.push(e.text); continue; }
    let k = 0; // unnumbered in this run (from the first one), including me
    let pos = 0;
    for (let j = i - 1; j >= 0 && entries[j].slot == null; j--) pos++;
    for (let j = i - pos; j < entries.length && entries[j].slot == null; j++) k++;
    const gap = nextIdx >= 0 ? entries[nextIdx].slot - prev.slot : 0;
    const gstep = gap && gap % (k + 1) === 0 && gap / (k + 1) <= 2 ? gap / (k + 1) : 0;
    if (gstep) out.push({ ...e, slot: prev.slot + gstep, guessed: true });
    else out.push({ ...e, slot: prev.slot + step, guessed: true, unsure: nextIdx >= 0 });
  }

  // -> circuits; first one at a slot wins, the rest go to skipped
  const bySlot = new Map();
  for (const e of out) {
    const hint = splitHints(e.text);
    let raw = hint.label.replace(/^\W+/, '');
    if (!raw || SPACE_WORDS.test(raw)) continue; // empty space in the panel
    if (raw.replace(/[^A-Za-z]/g, '').length < 2) { skipped.push(e.text); continue; }
    if (bySlot.has(e.slot)) {
      const first = bySlot.get(e.slot);
      if (!first.guessed || e.guessed) { skipped.push(e.text); continue; }
      skipped.push(first.label);
    }
    const spare = SPARE_WORDS.test(raw);
    const kw = spare ? null : keywordFor(raw);
    let poles = hint.poles || (e.pair ? '2' : '') || (kw ? kw.poles : '') || '1';
    if (poles === '3') poles = '3';
    const label = spare ? 'Spare' : sentenceCase(raw);
    const amps = hint.amps || (kw ? kw.amps : '') || (LIGHT_WORDS.test(raw) ? '15' : '20');
    bySlot.set(e.slot, { slot: e.slot, poles, amps, ampsFound: !!hint.amps, label, type: kw ? kw.type : '', device: kw ? kw.name : '', guessed: !!e.guessed, ...(e.unsure ? { unsure: true } : {}), pairHint: e.pair || 0 });
  }
  let circuits = [...bySlot.values()].sort((a, b) => a.slot - b.slot);

  // Merge the two halves of a 2-pole written twice ("3 Dryer" + "5 Dryer", or "5 -" under it).
  const merged = [];
  const used = new Set();
  for (const c of circuits) {
    if (used.has(c.slot)) continue;
    const mate = circuits.find((x) => x.slot === c.slot + step2 && !used.has(x.slot));
    const sameName = mate && norm(mate.label) === norm(c.label);
    // same name twice = one 2-pole only when it sounds like a 240V load, or the second line just
    // repeats the name ("DRYER 30A" / "DRYER"); two "KITCHEN 20A" lines are two circuits
    const twin = sameName && (c.poles === '2' || (c.ampsFound && !mate.ampsFound));
    if (mate && (twin || (c.poles === '2' && c.pairHint === mate.slot))) {
      used.add(mate.slot);
      merged.push({ ...c, poles: c.poles === '3' ? '3' : '2', amps: c.ampsFound ? c.amps : mate.ampsFound ? mate.amps : c.amps, ampsFound: c.ampsFound || mate.ampsFound });
      continue;
    }
    // a 2-pole guess only if the space under it is free
    if (c.poles === '2' && mate && !c.pairHint) {
      merged.push({ ...c, poles: '1', maybe2: true });
      continue;
    }
    merged.push(c);
  }
  circuits = merged.map(({ pairHint, ...c }) => { void pairHint; return c; });

  const letterLines = rawLines.length || 1;
  const numberedCount = circuits.filter((c) => !c.guessed).length;
  const quality = circuits.length < 3 ? 'little' : numberedCount >= 6 && numberedCount / letterLines >= 0.5 ? 'good' : 'some';
  return { circuits, skipped: skipped.filter(Boolean), twoColumn, quality, numbered: numberedCount, lines: rawLines.length };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Two reads of the same photo (different page modes): keep the better one and fill its gaps
// with sure entries from the other.
export function mergeScans(a, b, layout = 'two') {
  if (!a) return b;
  if (!b) return a;
  const score = (r) => r.numbered * 2 + r.circuits.length;
  const [base, other] = score(b) > score(a) ? [b, a] : [a, b];
  const step2 = layout === 'one' ? 1 : 2;
  const covers = (list) => {
    const m = new Map();
    list.forEach((c) => { m.set(Number(c.slot), c); if (c.poles === '2') m.set(Number(c.slot) + step2, c); });
    return m;
  };
  let circuits = base.circuits.map((c) => {
    if (!c.guessed) return c;
    const sure = other.circuits.find((o) => o.slot === c.slot && !o.guessed);
    if (sure && (c.unsure || norm(sure.label) === norm(c.label))) return { ...c, guessed: false, unsure: false };
    return c;
  });
  // a sure entry the other read put somewhere else (and that spot is free here): trust the
  // spot that both reads don't fight over (e.g. "24 SMOKE" misread as "1 SMOKE")
  const count = (list, label) => list.filter((x) => norm(x.label) === norm(label)).length;
  circuits = circuits.map((c) => {
    if (c.guessed) return c;
    const alt = other.circuits.filter((o) => !o.guessed && norm(o.label) === norm(c.label));
    if (!alt.length || alt.some((o) => o.slot === c.slot) || count(circuits, c.label) > 1) return c;
    const o = alt[0];
    const taken = covers(circuits.filter((x) => x !== c));
    return taken.has(o.slot) ? c : { ...c, slot: o.slot };
  });
  for (const o of other.circuits) {
    if (o.guessed && count(other.circuits, o.label) <= count(circuits, o.label)) continue;
    const taken = covers(circuits);
    const spots = [o.slot, ...(o.poles === '2' ? [o.slot + step2] : [])];
    if (spots.some((n) => taken.has(n))) continue;
    circuits.push(o);
  }
  circuits = circuits.sort((x, y) => x.slot - y.slot);
  const numbered = circuits.filter((c) => !c.guessed).length;
  const quality = circuits.length < 3 ? 'little' : numbered >= 6 ? 'good' : 'some';
  return { ...base, circuits, numbered, quality, skipped: base.skipped };
}

// ---------------------------------------------------------------- review helpers
export const scanPoleText = (c) => (c.poles === '2' ? '240V · 2-pole' : c.poles === '3' ? '3-pole' : '');

// Next free number for an added row.
export function nextScanSlot(circuits, layout = 'two') {
  const step2 = layout === 'one' ? 1 : 2;
  const taken = new Set();
  for (const c of circuits || []) {
    taken.add(Number(c.slot));
    if (c.poles === '2') taken.add(Number(c.slot) + step2);
    if (c.poles === '3') { taken.add(Number(c.slot) + step2); taken.add(Number(c.slot) + 2 * step2); }
  }
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

// -> rows for bulk.js planBulk (btype single/double, same as the "Several at once" screen).
// 3-pole circuits (commercial) go in as 2-pole + a note; the person can fix the 3rd leg after.
export function toBulkRows(circuits) {
  return (circuits || [])
    .filter((c) => String(c.label || '').trim() && Number(c.slot) >= 1)
    .map((c) => ({ slot: String(c.slot), btype: c.poles === '2' || c.poles === '3' ? 'double' : 'single', amps: String(c.amps || (c.poles === '2' ? '30' : '20')), label: String(c.label).trim(), rooms: '' }));
}

// Smallest panel (spaces) that fits every scanned circuit.
export function spacesNeeded(circuits, layout = 'two') {
  const step2 = layout === 'one' ? 1 : 2;
  let max = 0;
  for (const c of circuits || []) max = Math.max(max, Number(c.slot) + (c.poles === '2' ? step2 : c.poles === '3' ? 2 * step2 : 0));
  if (layout === 'one') return max;
  return max % 2 ? max + 1 : max;
}

// ---------------------------------------------------------------- image helpers (before OCR)
// rgba: Uint8ClampedArray (canvas ImageData.data). Returns a Uint8ClampedArray of gray values.
export function toGray(rgba) {
  const n = rgba.length / 4;
  const g = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) g[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  return g;
}

// Stretch contrast so the darkest 2% become black and the brightest 2% white.
export function stretchContrast(gray, cut = 0.02) {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * cut) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * cut) { hi = v; break; } }
  if (hi <= lo) return Uint8ClampedArray.from(gray);
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = ((gray[i] - lo) * 255) / (hi - lo);
  return out;
}

// Size to scale a photo to before OCR: long side about 1800px (sharper than tiny, faster than huge).
export function scanSize(w, h, target = 1800) {
  const long = Math.max(w, h) || 1;
  const k = long > target ? target / long : long < 1000 ? Math.min(2, 1000 / long) : 1;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

// Otsu threshold: the gray level that best splits ink from paper.
export function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let wb = 0, sb = 0, best = -1, th = 128;
  for (let t = 0; t < 256; t++) {
    wb += hist[t];
    if (!wb) continue;
    const wf = total - wb;
    if (!wf) break;
    sb += t * hist[t];
    const mb = sb / wb, mf = (sum - sb) / wf;
    const v = wb * wf * (mb - mf) * (mb - mf);
    if (v > best) { best = v; th = t; }
  }
  return th;
}

// Black/white (0/255) with long straight lines removed: table borders and grid lines on a
// panel label confuse the reader much more than the words do. Strokes of letters are short.
export function cleanForOcr(gray, w, h) {
  const th = otsu(gray);
  const dark = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) dark[i] = gray[i] <= th ? 1 : 0;
  const L = Math.max(40, Math.round(Math.min(w, h) / 25));
  const kill = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!dark[y * w + x]) { x++; continue; }
      let e = x;
      while (e < w && dark[y * w + e]) e++;
      if (e - x >= L) for (let k = x; k < e; k++) kill[y * w + k] = 1;
      x = e;
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!dark[y * w + x]) { y++; continue; }
      let e = y;
      while (e < h && dark[e * w + x]) e++;
      if (e - y >= L) for (let k = y; k < e; k++) kill[k * w + x] = 1;
      y = e;
    }
  }
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = dark[i] && !kill[i] ? 0 : 255;
  return out;
}
