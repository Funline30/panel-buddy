import { ampsText } from './util.js';
import { slotLabel, layoutOf, breakerType } from './panel.js';
import { labelOf, DEVICE_TYPES, GFCI_OPTIONS, AFCI_OPTIONS, STATUS_OPTIONS, BOX_OPTIONS, styleOf, qtyOf } from './options.js';
import { readings, fmtAmps, deviceWatts, breakerAmps } from './load.js';
import { cleanWire, sizeText, typeText, condText, colorText, cableText, effectiveWire, wireChecks } from './wire.js';

const WIRE_HEAD = ['Wire size', 'Wire type', 'Conductors', 'Cable', 'Jacket color', 'Wire note', 'Wire check'];
function wireCells(w, amps) {
  w = cleanWire(w);
  if (!w) return ['', '', '', '', '', '', ''];
  return [sizeText(w), typeText(w), condText(w), cableText(w), colorText(w), w.note || '', wireChecks(w, amps).map((c) => c.text).join('; ')];
}

const BTYPE_NAMES = { single: 'Single', double: '2-pole', tandem: 'Tandem half', quad: 'Quad' };

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
  const out = [['Panel', 'Slot', 'Poles', 'Amps', 'Label', 'Rooms', 'Type', 'Typical watts', 'Typical amps', 'Typical %', 'Idle %', 'Peak %', 'Notes', 'Breaker type', ...WIRE_HEAD]];
  for (const b of data.breakers) {
    const s = readings(b, data.devices || []);
    out.push([panel(b.panelId), slotLabel(b, P(b.panelId) || layoutOf(null)), b.poles, ampsText(b), b.label, (b.rooms || []).join('; '), b.kind, Math.round(s.watts), fmtAmps(s.amps), Math.round(s.pct), Math.round(s.idlePct), Math.round(s.allPct), b.notes, BTYPE_NAMES[breakerType(b)] + (b.size === 'half' && b.btype === 'quad' ? (String(b.poles) === '2' ? ' (2-pole part)' : ' (single part)') : ''), ...wireCells(b.wire, breakerAmps(b))]);
  }
  return rows(out);
}

export function devicesCsv(data) {
  const br = new Map(data.breakers.map((b) => [b.id, b]));
  const slotText = (b) => slotLabel(b, data.panels.find((p) => p.id === b.panelId) || layoutOf(null));
  const out = [['Room', 'Name', 'Type', 'Location', 'Breaker', 'Breaker label', 'Style', 'Quantity', 'Box', 'Needs replacing', 'GFCI', 'AFCI', 'Status', 'Plugged in', 'Plugged in watts', 'Notes', 'Readings', 'Wire from', ...WIRE_HEAD]];
  for (const d of data.devices) {
    const b = br.get(d.breakerId);
    out.push([d.room, d.name, labelOf(DEVICE_TYPES, d.type), d.location, b ? slotText(b) : '', b ? b.label : '', styleOf(d) ? styleOf(d).label : '', qtyOf(d), d.box ? labelOf(BOX_OPTIONS, d.box) : '', d.replace === 'yes' ? 'Yes' : 'No', labelOf(GFCI_OPTIONS, d.gfci), labelOf(AFCI_OPTIONS, d.afci), labelOf(STATUS_OPTIONS, d.status), (d.loads || []).map((l) => `${l.name}${Number(l.qty) > 1 ? ' x' + l.qty : ''} (${(Number(l.watts) || 0) * (Number(l.qty) || 1)}W)`).join('; '), deviceWatts(d) || '', d.notes, (d.readings || []).map((r) => (r.date ? r.date + ': ' : '') + r.text).join(' | '), ...devWire(d, b)]);
  }
  return rows(out);
}

function devWire(d, b) {
  const e = effectiveWire(d, b);
  return [e.from === 'outlet' ? 'This outlet' : e.from === 'circuit' ? 'Breaker' : '', ...wireCells(e.wire, breakerAmps(b))];
}

export function fusesCsv(data) {
  const out = [['Panel', 'Fuse #', 'Amps', 'Powers', 'Notes']];
  for (const p of data.panels) for (const f of p.fuses || []) out.push([p.name, f.num, f.amps === 'other' ? f.ampsOther : f.amps, f.powers, f.notes]);
  return rows(out);
}
