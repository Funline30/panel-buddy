// Pro / commercial electrical: service type (single- or three-phase), 3-pole breakers,
// phase A/B/C per breaker, per-phase totals, which panel feeds which, generator hookup,
// surge protector, grounding, wire runs and device-type defaults.
// Everything here is OPTIONAL and additive: a panel / breaker / device saved before this
// file existed has none of these fields and reads exactly as before (single-phase
// 120/240V, legs L1 / L2, no feed, no generator).
import { layoutOf, numberingOf, cellsFor } from './panel.js';

// ---------------------------------------------------------------- service type
export const SERVICE_TYPES = [
  { value: '1ph240', label: 'Single-phase 120/240V', short: '120/240V', hint: 'Most homes', three: false, ln: 120, ll: 240 },
  { value: '3ph208', label: 'Three-phase 120/208V', short: '120/208V 3Ø', hint: 'Offices, stores, apartments', three: true, ln: 120, ll: 208 },
  { value: '3ph480', label: 'Three-phase 277/480V', short: '277/480V 3Ø', hint: 'Big buildings, warehouses, plants', three: true, ln: 277, ll: 480 },
  { value: '3phHL', label: '120/240V high-leg delta', short: '120/240V high-leg', hint: 'Older shops. B is the high leg: no 120V loads on B', three: true, ln: 120, ll: 240, highLeg: 'B' },
];
export const DEFAULT_SERVICE = '1ph240';

export function serviceOf(panel) {
  const v = panel && typeof panel === 'object' ? panel.service : '';
  return SERVICE_TYPES.find((s) => s.value === v) || SERVICE_TYPES[0];
}
export const isThreePhase = (panel) => !!(panel && panel.type !== 'rv' && serviceOf(panel).three);

// Main / service size: homes up to 400A, commercial up to 4000A (+ type your own).
export const SERVICE_AMP_OPTIONS = ['100', '150', '200', '400', '600', '800', '1200', '1600', '2000', '2500', '3000', '4000', 'other'];
export const HOME_MAIN_AMPS = ['60', '100', '125', '150', '200', '225', '400', 'other'];
export function mainAmpsNum(panel) {
  if (!panel) return 0;
  const raw = panel.mainAmps === 'other' ? panel.mainAmpsOther : panel.mainAmps;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
// Show the commercial choices? Only when the building or panel says so.
export function isCommercial(home, panel) {
  return !!((home && home.type === 'commercial') || isThreePhase(panel) || mainAmpsNum(panel) > 400);
}
export function mainAmpChoices(home, panel) {
  return isCommercial(home, panel) ? SERVICE_AMP_OPTIONS : HOME_MAIN_AMPS;
}

// ---------------------------------------------------------------- poles + phases
export function polesOf(b) {
  const p = String(b && b.poles);
  return p === '3' ? 3 : p === '2' ? 2 : 1;
}
export const PHASES3 = ['A', 'B', 'C'];
export const LEGS = ['1', '2'];

// Space (row) index of a half-row: one breaker space = 2 half-rows in every numbering.
const spaceOfHalfRow = (h) => Math.floor(h / 2);

// Phase / leg of the space a slot number sits in. Bus bars alternate by space:
//  single-phase: L1, L2, L1, L2 ... (both columns of a row share the leg)
//  three-phase:  A, B, C, A, B, C ...
export function phaseAt(slot, panel) {
  const n = parseInt(slot, 10);
  if (!Number.isFinite(n) || n < 1) return '';
  const c = cellsFor({ slot: n, poles: '1' }, panel || 'two');
  if (!c) return '';
  const space = spaceOfHalfRow(c.start);
  return isThreePhase(panel) ? PHASES3[space % 3] : LEGS[space % 2];
}

// The phases a breaker touches from where it sits (one per pole).
export function autoPhases(b, panel) {
  const c = cellsFor(b, panel || 'two');
  if (!c) return [];
  const list = isThreePhase(panel) ? PHASES3 : LEGS;
  const out = [];
  for (let h = c.start; h < c.start + c.len; h++) {
    const ph = list[spaceOfHalfRow(h) % list.length];
    if (!out.includes(ph)) out.push(ph);
  }
  return out.slice(0, polesOf(b));
}

// A hand-picked phase: b.phase = 'A', 'BC', 'ABC' (three-phase) or b.leg = '1' / '2'.
// Used only if it fits the panel and the number of poles; otherwise it's automatic.
export function phaseOverride(b, panel) {
  if (!b) return null;
  if (isThreePhase(panel)) {
    const v = String(b.phase || '').toUpperCase();
    if (!v || !/^[ABC]{1,3}$/.test(v)) return null;
    const list = [...new Set(v.split(''))];
    return list.length === polesOf(b) ? list : null;
  }
  if (polesOf(b) === 1 && (b.leg === '1' || b.leg === '2')) return [b.leg];
  return null;
}
export function breakerPhases(b, panel) {
  return phaseOverride(b, panel) || autoPhases(b, panel);
}
export const isAutoPhase = (b, panel) => !phaseOverride(b, panel);
export function phaseText(phases, panel) {
  if (!phases || !phases.length) return '';
  return isThreePhase(panel) ? phases.join('') : phases.map((p) => 'L' + p).join('·');
}
// Choices for "Change phase" on a breaker with this many poles.
export function phaseChoices(poles) {
  if (poles === 3) return ['ABC'];
  if (poles === 2) return ['AB', 'BC', 'AC'];
  return ['A', 'B', 'C'];
}

// Volts of a circuit: line-to-neutral for 1 pole, line-to-line for 2 or 3 poles.
export function breakerVolts(b, panel) {
  const s = serviceOf(panel && panel.type !== 'rv' ? panel : null);
  const p = polesOf(b);
  if (p === 1) return s.ln;
  return s.ll;
}
// Amps from watts. A balanced 3-pole load: W / (V x 1.732).
export function ampsFromWatts(watts, b, panel) {
  const v = breakerVolts(b, panel);
  const w = Number(watts) || 0;
  if (!v) return 0;
  return polesOf(b) === 3 ? w / (v * Math.sqrt(3)) : w / v;
}

// Per-phase totals (informational): breaker sizes added up per phase, and listed load amps
// per phase. loadAmpsOf(b) = the load amps on that circuit (0 if nothing is listed).
export function phaseTotals(panel, breakers = [], loadAmpsOf = () => 0) {
  const names = isThreePhase(panel) ? PHASES3 : LEGS;
  const rows = names.map((ph) => ({ phase: ph, breakerAmps: 0, loadAmps: 0, count: 0 }));
  const at = (ph) => rows.find((r) => r.phase === ph);
  for (const b of breakers || []) {
    if (!b || b.kind === 'spare') continue;
    const amps = ampsOfBreaker(b);
    const load = Number(loadAmpsOf(b)) || 0;
    for (const ph of breakerPhases(b, panel)) {
      const r = at(ph);
      if (!r) continue;
      r.breakerAmps += amps;
      r.loadAmps += load;
      r.count += 1;
    }
  }
  const loads = rows.map((r) => r.loadAmps);
  const max = Math.max(...loads), min = Math.min(...loads);
  const avg = loads.reduce((s, x) => s + x, 0) / (loads.length || 1);
  const imbalance = avg > 0 ? Math.round(((max - min) / avg) * 100) : 0;
  return { phases: names, rows, imbalance, three: isThreePhase(panel) };
}
function ampsOfBreaker(b) {
  const n = Number(b.amps === 'other' ? b.ampsOther : b.amps);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------- what feeds what
// panel.fedFrom = id of the panel that feeds it, panel.fedBreaker = the breaker there,
// panel.feeder = the feeder wire ("4/0 AL"). All optional.
export const FEEDER_SIZES = ['#6 Cu', '#4 Cu', '#2 Cu', '#2 AL', '1/0 AL', '2/0 AL', '4/0 AL', '250 kcmil', '350 kcmil', '500 kcmil', 'Parallel sets', 'other'];

export function feedParent(panel, panels = []) {
  if (!panel || !panel.fedFrom || panel.fedFrom === panel.id) return null;
  return (panels || []).find((p) => p.id === panel.fedFrom) || null;
}
// Would feeding panelId from fromId make a loop (A feeds B feeds A)?
export function wouldLoop(panels = [], panelId, fromId) {
  if (!fromId) return false;
  if (fromId === panelId) return true;
  const seen = new Set([panelId]);
  let cur = (panels || []).find((p) => p.id === fromId);
  while (cur) {
    if (seen.has(cur.id)) return true;
    seen.add(cur.id);
    cur = cur.fedFrom ? (panels || []).find((p) => p.id === cur.fedFrom) : null;
  }
  return false;
}
// Flat list for the tree view: [{ panel, depth, parent }] - roots first (the main / MDP),
// each panel's children right under it. Broken links and loops show as roots.
export function feedRows(panels = []) {
  const list = (panels || []).filter(Boolean);
  const ids = new Set(list.map((p) => p.id));
  const validParent = (p) => p.fedFrom && ids.has(p.fedFrom) && !wouldLoop(list.filter((x) => x.id !== p.id), p.id, p.fedFrom) && p.fedFrom !== p.id;
  const rank = (p) => (p.type === 'main' ? 0 : p.type === 'sub' ? 1 : 2);
  const sortP = (a, b) => rank(a) - rank(b) || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
  const kids = new Map();
  const roots = [];
  for (const p of list) {
    if (validParent(p)) kids.set(p.fedFrom, [...(kids.get(p.fedFrom) || []), p]);
    else roots.push(p);
  }
  const out = [];
  const seen = new Set();
  const walk = (p, depth, parent) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    out.push({ panel: p, depth, parent });
    for (const k of (kids.get(p.id) || []).sort(sortP)) walk(k, depth + 1, p);
  };
  for (const r of roots.sort(sortP)) walk(r, 0, null);
  for (const p of list) if (!seen.has(p.id)) walk(p, 0, null); // anything left (a loop)
  return out;
}
export function feedText(panel, panels = [], breakers = [], slotLabelOf = (b) => b.slot) {
  const parent = feedParent(panel, panels);
  if (!parent) return '';
  const b = panel.fedBreaker ? (breakers || []).find((x) => x.id === panel.fedBreaker) : null;
  return [`Fed from ${parent.name || 'panel'}`, b ? `breaker ${slotLabelOf(b)}${b.amps ? ` (${b.amps === 'other' ? b.ampsOther : b.amps}A)` : ''}` : '', feederText(panel)].filter(Boolean).join(' · ');
}
export const feederText = (p) => (p && p.feeder ? (p.feeder === 'other' ? p.feederOther || '' : p.feeder) : '');

// ---------------------------------------------------------------- generator, surge, grounding
export const GEN_HOOKUPS = [
  { value: 'none', label: 'No generator hookup', short: 'None' },
  { value: 'interlock', label: 'Interlock kit (slide plate by the main)', short: 'Interlock kit' },
  { value: 'manual', label: 'Manual transfer switch', short: 'Manual transfer switch' },
  { value: 'ats', label: 'Automatic transfer switch (standby generator)', short: 'Automatic transfer switch' },
];
export const GEN_INLETS = ['Outside wall', 'By the meter', 'Garage', 'Other'];
export const GEN_SIZES = ['5 kW', '7.5 kW', '10 kW', '14 kW', '22 kW', '26 kW', 'other'];
export const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: '', label: 'Not sure' }];
export const GROUND_RODS = [{ value: '1', label: '1 rod' }, { value: '2', label: '2 rods' }, { value: 'ufer', label: 'Foundation (Ufer)' }, { value: 'no', label: 'None found' }, { value: '', label: 'Not sure' }];

export const hasGenerator = (p) => !!(p && p.genHookup && p.genHookup !== 'none');
export function generatorText(p) {
  if (!hasGenerator(p)) return '';
  const h = GEN_HOOKUPS.find((g) => g.value === p.genHookup);
  const size = p.genSize === 'other' ? p.genSizeOther : p.genSize;
  return [h ? h.short : '', size || '', p.genInlet && p.genInlet !== 'Other' ? `inlet: ${p.genInlet}` : ''].filter(Boolean).join(' · ');
}
// Short facts for the panel header: "Generator: Interlock kit · Surge protector".
export function panelExtrasText(p) {
  if (!p) return [];
  const out = [];
  if (hasGenerator(p)) out.push(`Generator: ${(GEN_HOOKUPS.find((g) => g.value === p.genHookup) || {}).short}`);
  if (p.spd === 'yes') out.push('Surge protector');
  return out;
}
export function groundingText(p) {
  if (!p) return '';
  const rod = GROUND_RODS.find((r) => r.value && r.value === p.groundRod);
  return [rod ? `Ground rod: ${rod.label}` : '', p.waterBond === 'yes' ? 'Water pipe bonded' : p.waterBond === 'no' ? 'Water pipe NOT bonded' : '', p.groundNotes || ''].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- wire runs (panel.runs[])
export const CONDUIT_OPTIONS = [
  { value: 'no', label: 'No conduit' },
  { value: 'emt', label: 'EMT' },
  { value: 'pvc', label: 'PVC' },
  { value: 'rigid', label: 'Rigid' },
  { value: 'flex', label: 'Flex' },
  { value: 'mc', label: 'MC cable' },
];
export function cleanRun(r) {
  if (!r || typeof r !== 'object') return null;
  const s = (x) => String(x == null ? '' : x).trim().slice(0, 80);
  const out = { id: s(r.id) || 'r' + Math.random().toString(36).slice(2, 8), from: s(r.from), to: s(r.to), wire: s(r.wire), conduit: CONDUIT_OPTIONS.some((c) => c.value === r.conduit) ? r.conduit : '' };
  if (r.note) out.note = s(r.note);
  return out.from || out.to ? out : null;
}
export function runText(r) {
  const c = CONDUIT_OPTIONS.find((x) => x.value === r.conduit);
  return [r.wire, c ? c.label : ''].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- device types
// Groups for the "Add" picker: common first, the rest behind "More types".
export const DEVICE_GROUPS = [
  { value: 'common', label: 'Most used' },
  { value: 'safety', label: 'Safety' },
  { value: 'equipment', label: 'Equipment (own breaker)' },
  { value: 'other', label: 'Other' },
];
// Typical breaker for each kind of thing. Typical guidance only - the nameplate wins.
const DEF = (volts, amps, note = '', dedicated = false) => ({ volts, amps, poles: volts === 240 ? '2' : '1', note, dedicated });
const TYPE_DEFAULTS = {
  outlet: DEF(120, 20),
  light: DEF(120, 15),
  switch: DEF(120, 15),
  fan: DEF(120, 15),
  smoke: DEF(120, 15, 'Hardwired alarms are usually on a lighting circuit'),
  junction: DEF(120, 15),
  appliance: DEF(120, 20, 'Usually its own 20A breaker', true),
  ev: DEF(240, 50, 'Most Level 2 chargers: 40A or 50A double-pole', true),
  solar: DEF(240, 40, 'Back-fed breaker sized by the inverter', true),
  hvac: DEF(240, 30, 'Check the max breaker size on the unit label', true),
  waterheater: DEF(240, 30, 'Most electric tank heaters: 30A double-pole', true),
  wellpump: DEF(240, 20, 'Most 1 HP pumps: 20A double-pole', true),
  subpanel: DEF(240, 60, 'Breaker size = the feeder size', true),
  generator: DEF(240, 30, 'Backfeed breaker for the inlet', true),
  other: DEF(120, 15),
};
const STYLE_DEFAULTS = {
  'outlet:20a': DEF(120, 20),
  'outlet:240dryer': DEF(240, 30, 'Dryer outlet: 30A double-pole, 10 AWG', true),
  'outlet:240range': DEF(240, 50, 'Range outlet: 40-50A double-pole', true),
  'outlet:240welder': DEF(240, 50, 'Welder / shop outlet: 50A double-pole', true),
  'outlet:240ev': DEF(240, 50, 'EV outlet (14-50): 50A double-pole', true),
};
export function deviceDefaults(type, style = '') {
  return STYLE_DEFAULTS[`${type}:${style}`] || TYPE_DEFAULTS[type] || TYPE_DEFAULTS.other;
}
export const isEquipment = (type) => ['appliance', 'ev', 'solar', 'hvac', 'waterheater', 'wellpump', 'subpanel', 'generator'].includes(type);
// "Usually a 30A double-pole (240V)" for the add form.
export function defaultsHint(type, style = '') {
  const d = deviceDefaults(type, style);
  if (!d.dedicated) return '';
  return `Usually its own ${d.amps}A ${d.poles === '2' ? 'double-pole (240V)' : 'breaker (120V)'}${d.note ? '. ' + d.note : ''}.`;
}

// ---------------------------------------------------------------- old data
// View defaults for a panel / breaker / device: never written back, never drops a key.
export function panelView(p) {
  return { service: DEFAULT_SERVICE, genHookup: 'none', spd: '', groundRod: '', waterBond: '', fedFrom: '', fedBreaker: '', feeder: '', runs: [], ...(p || {}) };
}
export function breakerView(b) {
  const v = { ...(b || {}) };
  v.poles = String(polesOf(b));
  return v;
}

// ---------------------------------------------------------------- first-run tour
export const TOUR_KEY = 'ampmap:tour:v1';
export const TOUR_STEPS = [
  { icon: '⚡', title: 'Map your panel', text: 'Tap any space on the panel to add a breaker. Just a name and the amps. Everything else is optional.' },
  { icon: '🔌', title: 'Add what each breaker powers', text: 'Outlets, lights, switches, fans, smoke alarms, EV chargers… pick from the list and link it to its breaker.' },
  { icon: '🖨️', title: 'Print it for the panel door', text: 'Print the schedule and the QR sticker. Scan the sticker any time to pull up this panel.' },
];
export function shouldShowTour({ seen = false, guest = false, hasHome = false, view = '', force = false } = {}) {
  if (force) return true;
  if (seen || guest || !hasHome) return false;
  return view === 'panel';
}
