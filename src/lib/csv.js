import { ampsText } from './util.js';
import { slotLabel, layoutOf } from './panel.js';
import { labelOf, DEVICE_TYPES, GFCI_OPTIONS, AFCI_OPTIONS, STATUS_OPTIONS } from './options.js';
import { loadSummary, fmtAmps } from './load.js';

function cell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function rows(arr) {
  return arr.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

export function breakersCsv(data) {
  const P = (id) => data.panels.find((p) => p.id === id);
  const panel = (id) => (P(id) || {}).name || '';
  const out = [['Panel', 'Slot', 'Poles', 'Amps', 'Label', 'Rooms', 'Type', 'Load watts', 'Load amps', 'Load %', 'Notes']];
  for (const b of data.breakers) {
    const s = loadSummary(b);
    out.push([panel(b.panelId), slotLabel(b, layoutOf(P(b.panelId))), b.poles, ampsText(b), b.label, (b.rooms || []).join('; '), b.kind, s.watts, fmtAmps(s.amps), Math.round(s.pct), b.notes]);
  }
  return rows(out);
}

export function devicesCsv(data) {
  const br = new Map(data.breakers.map((b) => [b.id, b]));
  const slotText = (b) => slotLabel(b, layoutOf(data.panels.find((p) => p.id === b.panelId)));
  const out = [['Room', 'Name', 'Type', 'Location', 'Breaker', 'Breaker label', 'GFCI', 'AFCI', 'Status', 'Notes', 'Readings']];
  for (const d of data.devices) {
    const b = br.get(d.breakerId);
    out.push([d.room, d.name, labelOf(DEVICE_TYPES, d.type), d.location, b ? slotText(b) : '', b ? b.label : '', labelOf(GFCI_OPTIONS, d.gfci), labelOf(AFCI_OPTIONS, d.afci), labelOf(STATUS_OPTIONS, d.status), d.notes, (d.readings || []).map((r) => (r.date ? r.date + ': ' : '') + r.text).join(' | ')]);
  }
  return rows(out);
}

export function fusesCsv(data) {
  const out = [['Panel', 'Fuse #', 'Amps', 'Powers', 'Notes']];
  for (const p of data.panels) for (const f of p.fuses || []) out.push([p.name, f.num, f.amps === 'other' ? f.ampsOther : f.amps, f.powers, f.notes]);
  return rows(out);
}
