// AI panel scan (Pro): turn the server's answer (api/scan-panel.js) into the same circuits the
// on-device label scan makes, so the same review grid and "build my panel" path is used.
// Pure functions only (no DOM).
import { keywordFor } from './labelScan.js';

export function aiToCircuits(result) {
  const list = (result && Array.isArray(result.circuits)) ? result.circuits : [];
  return list
    .filter((c) => c && Number(c.slot) > 0)
    .map((c) => {
      const label = String(c.label || '').trim() || 'Breaker';
      const kw = keywordFor(label);
      const poles = c.poles === '2' || (kw && kw.poles === '2' && !c.poles) ? '2' : '1';
      return {
        slot: Number(c.slot),
        poles,
        amps: String(c.amps || (kw && kw.amps) || (poles === '2' ? '30' : '20')),
        label,
        type: kw ? kw.type : '',
        device: kw ? kw.name : '',
        guessed: !!c.low,
      };
    })
    .sort((a, b) => a.slot - b.slot);
}

// One line for the scan screen: what the AI scan button says for this person right now.
export function aiScanNote(st) {
  const s = st || {};
  if (!s.enabled) return { on: false, text: 'AI scan coming soon' };
  if (!s.signedIn) return { on: false, text: 'Sign in to use AI scan' };
  const left = Number(s.left) || 0;
  if (s.unlimited) return { on: true, text: 'Unlimited AI scans (owner account)' };
  if (s.kind === 'trial') return { on: left > 0, text: left > 0 ? `${left} free AI scan${left === 1 ? '' : 's'} left` : 'Free AI scans used. Pro includes 20 a month' };
  return { on: left > 0, text: left > 0 ? `${left} of ${s.limit} AI scans left this month` : 'No AI scans left this month (resets on the 1st)' };
}

// Shrink a photo before upload (keeps the request well under the server's size cap).
export function uploadSize(w, h, max = 1600) {
  const big = Math.max(w, h);
  if (!big || big <= max) return { w, h };
  const k = max / big;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
