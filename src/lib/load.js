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
