// Panel layout helpers.
//  two columns: like most US home panels - odd spaces left, even right; a double-pole
//               breaker in space N also covers N+2.
//  one column:  stacked (typical small RV distribution center); a double-pole breaker
//               in space N also covers N+1.
export function layoutOf(panel) {
  if (!panel) return 'two';
  if (panel.layout === 'one' || panel.layout === 'two') return panel.layout;
  return panel.type === 'rv' ? 'one' : 'two';
}

export function panelSpaces(panel) {
  if (!panel) return 20;
  const raw = panel.spaces === 'other' ? panel.spacesOther : panel.spaces;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 84) : 20;
}

export function slotsFor(breaker, layout = 'two') {
  const start = parseInt(breaker && breaker.slot, 10);
  if (!Number.isFinite(start)) return [];
  if (String(breaker.poles) !== '2') return [start];
  return [start, start + (layout === 'one' ? 1 : 2)];
}

export function slotLabel(breaker, layout = 'two') {
  if (!breaker) return '';
  const s = slotsFor(breaker, layout);
  if (!s.length) return breaker.slot || '?';
  return s.join('/');
}
