import { habitOf } from './habits.js';
// Load math. amps = watts / 120 for single pole, watts / 240 for double pole.
// 80% guideline: NEC treats a load running 3+ hours as "continuous", and continuous
// load on a breaker should not exceed 80% of its rating.

export function voltsFor(poles) {
  return String(poles) === '2' ? 240 : 120;
}

export function breakerAmps(breaker) {
  if (!breaker) return 0;
  const raw = breaker.amps === 'other' ? breaker.ampsOther : breaker.amps;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// On / off: a load with on === false is listed but switched off / unplugged right now.
// Missing field = on, so every load saved before this feature reads as on.
export const isOn = (l) => !(l && l.on === false);

function lineWatts(l) {
  const w = Number(l && l.watts) || 0;
  const q = Number(l && l.qty) || 1;
  return w * q;
}

// Every listed load (on or off). onlyOn: count only loads that are on.
export function totalWatts(loads = [], { onlyOn = false } = {}) {
  return (loads || []).reduce((sum, l) => (onlyOn && !isOn(l) ? sum : sum + lineWatts(l)), 0);
}

// Watts of loads that are on right now ("Using now").
export function onWatts(loads = []) {
  return totalWatts(loads, { onlyOn: true });
}

// Watts plugged into one outlet / device (its own "what's plugged in" list).
// Default = every load (the max); { onlyOn: true } = what is on now.
export function deviceWatts(device, opts = {}) {
  return totalWatts((device && device.loads) || [], opts);
}

// Devices that belong to this breaker AND have something listed as plugged in (on or off).
export function devicesWithLoads(breaker, devices = []) {
  if (!breaker) return [];
  return (devices || []).filter((d) => d && d.breakerId === breaker.id && deviceWatts(d) > 0);
}

// Watts on a circuit = loads listed on the breaker itself + every outlet's own list.
// Each item lives in exactly one place (breaker OR outlet), so nothing is counted twice.
// Default = what is ON now (what warnings use); { all: true } = everything as if all on.
export function breakerWatts(breaker, devices = [], { all = false } = {}) {
  const opts = { onlyOn: !all };
  const own = totalWatts((breaker && breaker.loads) || [], opts);
  return own + devicesWithLoads(breaker, devices).reduce((s, d) => s + deviceWatts(d, opts), 0);
}

function levelOf(watts, pct, rating) {
  if (!watts) return 'none';
  if (rating && pct > 100) return 'over';
  if (rating && pct >= 80) return 'warn';
  return 'ok';
}

// devices is optional (older callers pass only the breaker): pass the home's devices to
// include what's plugged into each outlet on this circuit.
// watts / amps / pct / level = "Using now" (only loads that are on). The bar and color
// warnings follow these. allWatts / allAmps / allPct / allLevel = "If everything's on".
export function loadSummary(breaker, devices = []) {
  const volts = voltsFor(breaker && breaker.poles);
  const ownLoads = (breaker && breaker.loads) || [];
  const ownWatts = onWatts(ownLoads);
  const ownAllWatts = totalWatts(ownLoads);
  const outlets = devicesWithLoads(breaker, devices);
  const parts = outlets.map((d) => ({ device: d, watts: deviceWatts(d, { onlyOn: true }), allWatts: deviceWatts(d) }));
  const outletWatts = parts.reduce((s, x) => s + x.watts, 0);
  const outletAllWatts = parts.reduce((s, x) => s + x.allWatts, 0);
  const watts = ownWatts + outletWatts;
  const allWatts = ownAllWatts + outletAllWatts;
  const amps = watts / volts;
  const allAmps = allWatts / volts;
  const rating = breakerAmps(breaker);
  const pct = rating ? (amps / rating) * 100 : 0;
  const allPct = rating ? (allAmps / rating) * 100 : 0;
  const allLevel = levelOf(allWatts, allPct, rating);
  // Something is listed but all of it is off: 0% and OK, not "no loads listed".
  const level = !watts && allWatts ? 'ok' : levelOf(watts, pct, rating);
  const every = [...ownLoads, ...outlets.flatMap((d) => d.loads || [])];
  const loadCount = every.length;
  const offCount = every.filter((l) => !isOn(l)).length;
  return {
    volts,
    watts,
    amps,
    rating,
    pct,
    level,
    allWatts,
    allAmps,
    allPct,
    allLevel,
    loadCount,
    offCount,
    limit80: rating * 0.8,
    ownWatts,
    ownAllWatts,
    outletWatts,
    outletAllWatts,
    parts,
  };
}

export function levelText(level) {
  return (
    {
      none: 'No loads listed',
      ok: 'Under 80% - OK',
      warn: 'At or over 80% - too much for loads that run 3+ hours',
      over: 'Over 100% - expect the breaker to trip',
    }[level] || ''
  );
}

export function fmtAmps(a) {
  return (Math.round(a * 10) / 10).toFixed(1);
}

// RV shore power check: adds up every 120V breaker's listed load and compares it to the
// shore power service. 30A service = 30A at 120V. 50A service = 50A on each of two legs;
// a double-pole (240V) load counts on both legs. Single-pole loads count on the leg the
// user picked; loads with no leg picked are reported separately.
export function shoreCapacity(panel) {
  const v = panel && panel.shorePower;
  if (!v) return null;
  if (v === 'pole') {
    const m = panel.mainAmps === 'other' ? Number(panel.mainAmpsOther) : Number(panel.mainAmps);
    return m > 0 ? { amps: m, legs: 2 } : null;
  }
  if (v === 'other') {
    const n = Number(panel.shorePowerOther);
    return n > 0 ? { amps: n, legs: 1 } : null;
  }
  const n = Number(v);
  if (!(n > 0)) return null;
  return { amps: n, legs: v === '50' ? 2 : 1 };
}

function levelFor(amps, cap) {
  if (!amps) return 'none';
  const pct = (amps / cap) * 100;
  return pct > 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
}

// opts.mode: 'main' = Typical readings (what the app shows); default = the older
// "loads switched on, at full draw" math.
export function shoreSummary(panel, breakers, devices = [], opts = {}) {
  const cap = shoreCapacity(panel);
  const bw = (b) => (opts.mode ? readings(b, devices).watts : breakerWatts(b, devices));
  if (!cap) return null;
  if (cap.legs === 1) {
    let amps = 0;
    for (const b of breakers) amps += bw(b) / voltsFor(b.poles);
    return { legs: [{ name: 'Total', amps, cap: cap.amps, pct: (amps / cap.amps) * 100, level: levelFor(amps, cap.amps) }], unassigned: 0 };
  }
  let l1 = 0, l2 = 0, unassigned = 0;
  for (const b of breakers) {
    const w = bw(b);
    if (!w) continue;
    if (String(b.poles) === '2') {
      l1 += w / 240;
      l2 += w / 240;
    } else if (b.leg === '1') l1 += w / 120;
    else if (b.leg === '2') l2 += w / 120;
    else unassigned += w / 120;
  }
  return {
    legs: [
      { name: 'Leg 1', amps: l1, cap: cap.amps, pct: (l1 / cap.amps) * 100, level: levelFor(l1, cap.amps) },
      { name: 'Leg 2', amps: l2, cap: cap.amps, pct: (l2 / cap.amps) * 100, level: levelFor(l2, cap.amps) },
    ],
    unassigned,
  };
}


// ---------------------------------------------------------------- Idle / Typical / Peak
// No switches needed: each load has a running number (watts), an idle/standby number
// (idleW, or a catalog estimate) and "how much is it on" (use: always / cycles / hours /
// sometimes). Per breaker:
//   Idle    = everything at standby (an "Always" device counts its running watts)
//   Typical = running × share + idle × (1 - share)   <- the MAIN number, bar and color
//   Peak    = everything running at once (the old "max if all on")
// "Right now" override (optional): the small On/Off chip writes on + nowAt. For
// NOW_HOURS after the tap, that load counts as running (on) or idle (off) in the main
// number; then it goes back to Typical by itself. on/off saved by the older switch has no
// nowAt and is ignored here, so nobody has to undo old taps.

export const NOW_HOURS = 4;
const NOW_MS = NOW_HOURS * 3600 * 1000;

// 'on' | 'off' | null (no active override)
export function nowOverride(l, t = Date.now()) {
  if (!l || !l.nowAt) return null;
  const at = Number(l.nowAt);
  if (!Number.isFinite(at) || t - at >= NOW_MS || t - at < -NOW_MS) return null;
  return l.on === false ? 'off' : 'on';
}

// Watts of one load line (× qty) in a mode: 'idle' | 'typical' | 'peak' | 'main'.
export function loadReading(l, mode = 'main', t = Date.now()) {
  if (!l) return 0;
  const q = Number(l.qty) || 1;
  const h = habitOf(l);
  if (mode === 'peak') return h.run * q;
  if (mode === 'idle') return h.idle * q;
  const typ = (h.run * h.share + h.idle * (1 - h.share)) * q;
  if (mode === 'typical') return typ;
  const o = nowOverride(l, t);
  return o === 'on' ? h.run * q : o === 'off' ? h.idle * q : typ;
}

export function readingWatts(loads = [], mode = 'main', t = Date.now()) {
  return (loads || []).reduce((s, l) => s + loadReading(l, mode, t), 0);
}

export function deviceReading(device, mode = 'main', t = Date.now()) {
  return readingWatts((device && device.loads) || [], mode, t);
}

function part(watts, volts, rating) {
  const amps = watts / volts;
  const pct = rating ? (amps / rating) * 100 : 0;
  return { watts, amps, pct, level: levelOf(watts, pct, rating) };
}

// The breaker readings every screen uses. watts / amps / pct / level = the MAIN number
// (Typical, with any active "Right now" taps), so older screen code keeps working.
// typ* = pure Typical, idle* = Idle, all* = Peak (everything running).
export function readings(breaker, devices = [], { t = Date.now() } = {}) {
  const volts = voltsFor(breaker && breaker.poles);
  const rating = breakerAmps(breaker);
  const own = (breaker && breaker.loads) || [];
  const outlets = devicesWithLoads(breaker, devices);
  const every = [...own, ...outlets.flatMap((d) => d.loads || [])];
  const sum = (mode) => readingWatts(every, mode, t);
  const main = part(sum('main'), volts, rating);
  const typ = part(sum('typical'), volts, rating);
  const idle = part(sum('idle'), volts, rating);
  const peak = part(sum('peak'), volts, rating);
  const loadCount = every.length;
  const fix = (p) => (loadCount && p.level === 'none' ? { ...p, level: 'ok' } : p);
  const M = fix(main), T = fix(typ), I = fix(idle);
  const overrides = every.filter((l) => nowOverride(l, t)).length;
  return {
    volts,
    rating,
    limit80: rating * 0.8,
    watts: M.watts,
    amps: M.amps,
    pct: M.pct,
    level: M.level,
    typWatts: T.watts,
    typAmps: T.amps,
    typPct: T.pct,
    typLevel: T.level,
    idleWatts: I.watts,
    idleAmps: I.amps,
    idlePct: I.pct,
    idleLevel: I.level,
    allWatts: peak.watts,
    allAmps: peak.amps,
    allPct: peak.pct,
    allLevel: peak.level,
    loadCount,
    overrides,
    offCount: 0,
    ownWatts: readingWatts(own, 'main', t),
    ownAllWatts: readingWatts(own, 'peak', t),
    outletWatts: outlets.reduce((s, d) => s + deviceReading(d, 'main', t), 0),
    outletAllWatts: outlets.reduce((s, d) => s + deviceReading(d, 'peak', t), 0),
    parts: outlets.map((d) => ({ device: d, watts: deviceReading(d, 'main', t), allWatts: deviceReading(d, 'peak', t), idleWatts: deviceReading(d, 'idle', t) })),
  };
}

// What adding (or moving in) one load does to a breaker: { pct, peakPct } after.
export function projectLoad(s, l, t = Date.now()) {
  if (!s || !s.rating) return { pct: 0, peakPct: 0 };
  const add = (w) => ((w / s.volts) / s.rating) * 100;
  return { pct: s.pct + add(loadReading(l, 'main', t)), peakPct: s.allPct + add(loadReading(l, 'peak', t)) };
}
