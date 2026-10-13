import { slotText, ampsText } from './util.js';
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
  const panel = (id) => (data.panels.find((p) => p.id === id) || {}).name || '';
  const out = [['Panel', 'Slot', 'Poles', 'Amps', 'Label', 'Rooms', 'Type', 'Load watts', 'Load amps', 'Load %', 'Notes']];
  for (const b of data.breakers) {
    const s = loadSummary(b);
    out.push([panel(b.panelId), slotText(b), b.poles, ampsText(b), b.label, (b.rooms || []).join('; '), b.kind, s.watts, fmtAmps(s.amps), Math.round(s.pct), b.notes]);
  }
  return rows(out);
}

export function devicesCsv(data) {
  const br = new Map(data.breakers.map((b) => [b.id, b]));
  const out = [['Room', 'Name', 'Type', 'Location', 'Breaker', 'Breaker label', 'GFCI', 'AFCI', 'Status', 'Notes', 'Readings']];
  for (const d of data.devices) {
    const b = br.get(d.breakerId);
    out.push([d.room, d.name, labelOf(DEVICE_TYPES, d.type), d.location, b ? slotText(b) : '', b ? b.label : '', labelOf(GFCI_OPTIONS, d.gfci), labelOf(AFCI_OPTIONS, d.afci), labelOf(STATUS_OPTIONS, d.status), d.notes, (d.readings || []).map((r) => (r.date ? r.date + ': ' : '') + r.text).join(' | ')]);
  }
  return rows(out);
}
