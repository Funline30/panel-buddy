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

export function totalWatts(loads = []) {
  return loads.reduce((sum, l) => {
    const w = Number(l.watts) || 0;
    const q = Number(l.qty) || 1;
    return sum + w * q;
  }, 0);
}

export function loadSummary(breaker) {
  const volts = voltsFor(breaker && breaker.poles);
  const watts = totalWatts((breaker && breaker.loads) || []);
  const amps = watts / volts;
  const rating = breakerAmps(breaker);
  const pct = rating ? (amps / rating) * 100 : 0;
  let level = 'ok';
  if (rating && pct > 100) level = 'over';
  else if (rating && pct >= 80) level = 'warn';
  if (!watts) level = 'none';
  return {
    volts,
    watts,
    amps,
    rating,
    pct,
    level,
    limit80: rating * 0.8,
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

export function shoreSummary(panel, breakers) {
  const cap = shoreCapacity(panel);
  if (!cap) return null;
  if (cap.legs === 1) {
    let amps = 0;
    for (const b of breakers) amps += totalWatts(b.loads || []) / voltsFor(b.poles);
    return { legs: [{ name: 'Total', amps, cap: cap.amps, pct: (amps / cap.amps) * 100, level: levelFor(amps, cap.amps) }], unassigned: 0 };
  }
  let l1 = 0, l2 = 0, unassigned = 0;
  for (const b of breakers) {
    const w = totalWatts(b.loads || []);
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
