// Power sources: solar, wind, battery backup, generator, other - beside the utility.
// Stored on the PANEL doc (panel.sources = [{ id, kind, label, ...details }], panel.offGrid)
// and on breakers (breaker.backfeed = kind, breaker.backfeedSrc = source id, breaker.backup).
// Everything is OPTIONAL: a panel saved before this file existed has no sources and reads
// as "Utility only". A panel that only has the older generator fields (genHookup / genSize /
// genInlet) shows that generator as a source until the list is saved once.
// Nothing here gives electrical advice: the safety note is general info.
import { GEN_HOOKUPS } from './pro.js';

export const SOURCE_KINDS = [
  { value: 'solar', label: 'Solar', icon: '☀️', noun: 'solar', add: 'solar' },
  { value: 'wind', label: 'Wind', icon: '🌬️', noun: 'wind turbine', add: 'wind turbine' },
  { value: 'battery', label: 'Battery backup', icon: '🔋', noun: 'battery', add: 'battery' },
  { value: 'generator', label: 'Generator', icon: '⛽', noun: 'generator', add: 'generator' },
  { value: 'other', label: 'Other', icon: '⚡', noun: 'other source', add: 'other source' },
];
export const kindOf = (k) => SOURCE_KINDS.find((x) => x.value === k) || null;
export const UTILITY = { value: 'utility', label: 'Utility (power company)', icon: '🏭' };

// Breaker tag "what is this breaker for": shown on the map + stickers.
export const BACKFEED_KINDS = [
  { value: 'solar', label: 'Solar backfeed', short: 'SOLAR', icon: '☀️' },
  { value: 'wind', label: 'Wind backfeed', short: 'WIND', icon: '🌬️' },
  { value: 'battery', label: 'Battery / inverter', short: 'BATTERY', icon: '🔋' },
  { value: 'generator', label: 'Generator inlet / interlock', short: 'GEN', icon: '⛽' },
  { value: 'other', label: 'Other source', short: 'SOURCE', icon: '⚡' },
];
export const backfeedOf = (b) => (b && BACKFEED_KINDS.find((k) => k.value === b.backfeed)) || null;
export const isOnBackup = (b) => !!(b && b.backup === true);

// ---------------------------------------------------------------- choices (tap chips)
export const SOLAR_SIZES = ['4 kW', '6 kW', '8 kW', '10 kW', '12 kW', 'other'];
export const SOLAR_INVERTERS = [
  { value: 'micro', label: 'Microinverters (one per panel)' },
  { value: 'string', label: 'String inverter (one box)' },
  { value: 'hybrid', label: 'Hybrid (solar + battery)' },
  { value: '', label: 'Not sure' },
];
export const SOLAR_CONNECTIONS = [
  { value: 'breaker', label: 'Breaker in this panel' },
  { value: 'tap', label: 'Tap before the main (line side)' },
  { value: 'other_panel', label: 'Another panel' },
  { value: '', label: 'Not sure' },
];
export const BACKFEED_AMPS = ['20', '30', '40', '50', '60', 'other'];
export const SHUTOFF_PLACES = ['By the meter', 'Outside wall', 'Garage', 'Next to the panel', 'other'];
export const WIND_SIZES = ['1 kW', '2.5 kW', '5 kW', '10 kW', 'other'];
export const BATTERY_TYPES = [
  { value: 'home', label: 'Whole-home battery (Powerwall, Enphase, Franklin…)' },
  { value: 'portable', label: 'Portable power station (EcoFlow, Jackery…)' },
  { value: 'other', label: 'Other' },
];
export const BATTERY_BRANDS = ['Tesla Powerwall', 'Enphase IQ Battery', 'FranklinWH', 'Generac PWRcell', 'EcoFlow', 'Jackery', 'other'];
export const BATTERY_KWH = ['5 kWh', '10 kWh', '13.5 kWh', '20 kWh', 'other'];
export const BATTERY_BACKUP = [
  { value: 'whole', label: 'Whole home' },
  { value: 'partial', label: 'Some circuits (backup panel)' },
  { value: '', label: 'Not sure' },
];
export const BATTERY_HOOKUPS = [
  { value: 'gateway', label: 'Gateway / automatic switch' },
  { value: 'transfer', label: 'Transfer switch' },
  { value: 'inlet', label: 'Inlet + interlock' },
  { value: '', label: 'Not sure' },
];
export const GEN_TYPES = [
  { value: 'portable', label: 'Portable (you roll it out)' },
  { value: 'standby', label: 'Standby (stays outside, starts itself)' },
];
// generator hookup = the same values the panel used before (pro.js GEN_HOOKUPS), minus "None"
export const GEN_HOOKUP_PICKS = GEN_HOOKUPS.filter((g) => g.value !== 'none').map((g) => ({ value: g.value, label: g.short }));
export const GEN_FUELS = ['Gas', 'Propane', 'Natural gas', 'Diesel', 'Dual fuel', 'other'];
export const YES_NO_SURE = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: '', label: 'Not sure' }];

// The fields each kind keeps (all optional). Anything else on a source is dropped on save.
export const FIELDS = {
  common: ['label', 'shutoff', 'shutoffOther', 'notes', 'installer', 'installerPhone'],
  solar: ['size', 'sizeOther', 'inverter', 'brand', 'connection', 'bfAmps', 'bfAmpsOther', 'bfSlot', 'netMeter'],
  wind: ['size', 'sizeOther', 'brand', 'bfAmps', 'bfAmpsOther', 'bfSlot'],
  battery: ['btype', 'brand', 'brandOther', 'model', 'kwh', 'kwhOther', 'backup', 'hookup'],
  generator: ['gtype', 'hookup', 'size', 'sizeOther', 'fuel', 'fuelOther', 'inlet'],
  other: ['what', 'bfAmps', 'bfAmpsOther'],
};

const str = (v) => (v == null ? '' : String(v).trim());
let n = 0;
export const newSourceId = () => 's_' + Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 6);

// Keep only known, non-empty fields. Returns null for an unknown kind.
export function cleanSource(s) {
  if (!s || !kindOf(s.kind)) return null;
  const out = { id: str(s.id) || newSourceId(), kind: s.kind };
  for (const k of [...FIELDS.common, ...FIELDS[s.kind]]) {
    const v = str(s[k]).slice(0, k === 'notes' ? 500 : 120);
    if (v) out[k] = v;
  }
  // "other" text only matters while "other" is picked
  for (const [pick, other] of [['size', 'sizeOther'], ['bfAmps', 'bfAmpsOther'], ['kwh', 'kwhOther'], ['brand', 'brandOther'], ['fuel', 'fuelOther'], ['shutoff', 'shutoffOther']])
    if (out[other] && out[pick] !== 'other') delete out[other];
  return out;
}

// The older generator fields as a source (only while the list was never saved).
function legacyGenerator(p) {
  if (!p || !p.genHookup || p.genHookup === 'none') return null;
  return cleanSource({ id: 'gen_legacy', kind: 'generator', hookup: p.genHookup, size: p.genSize, sizeOther: p.genSizeOther, inlet: p.genInlet });
}

export function sourcesOf(p) {
  if (!p || p.type === 'rv') return [];
  if (Array.isArray(p.sources)) return p.sources.map(cleanSource).filter(Boolean);
  const g = legacyGenerator(p);
  return g ? [g] : [];
}
export const hasUtility = (p) => !(p && p.offGrid === true);
export const hasSources = (p) => sourcesOf(p).length > 0;

// Saving the list: panel.sources (+ offGrid), and the older generator fields kept in step
// with the first generator so older copies of the app still show it.
export function applySources(p, list, { offGrid = false } = {}) {
  const sources = (list || []).map(cleanSource).filter(Boolean);
  const next = { ...p, sources };
  if (offGrid) next.offGrid = true; else delete next.offGrid;
  const g = sources.find((s) => s.kind === 'generator');
  if (g) {
    next.genHookup = g.hookup || (p.genHookup && p.genHookup !== 'none' ? p.genHookup : 'interlock');
    if (g.size) next.genSize = g.size; else delete next.genSize;
    if (g.size === 'other' && g.sizeOther) next.genSizeOther = g.sizeOther; else delete next.genSizeOther;
    if (g.inlet) next.genInlet = g.inlet; else delete next.genInlet;
  } else if (p.genHookup && p.genHookup !== 'none') {
    next.genHookup = 'none';
    delete next.genSize; delete next.genSizeOther; delete next.genInlet;
  }
  return next;
}

// ---------------------------------------------------------------- words
const other = (s, pick, oth) => (s[pick] === 'other' ? s[oth] || '' : s[pick] || '');
export function sourceName(s, list = []) {
  if (!s) return '';
  if (s.label) return s.label;
  const k = kindOf(s.kind);
  const base = s.kind === 'battery' && s.brand ? other(s, 'brand', 'brandOther') : s.kind === 'other' && s.what ? s.what : k ? k.label : 'Source';
  const same = list.filter((x) => x.kind === s.kind);
  return same.length > 1 ? `${base} ${same.findIndex((x) => x.id === s.id) + 1}` : base;
}
// "8 kW · Microinverters" - the short facts under a source's name
export function sourceFacts(s) {
  if (!s) return '';
  const out = [];
  if (s.kind === 'solar') {
    out.push(other(s, 'size', 'sizeOther'));
    const inv = SOLAR_INVERTERS.find((x) => x.value && x.value === s.inverter);
    if (inv) out.push(inv.label.replace(/ \(.*\)$/, ''));
    if (s.brand) out.push(s.brand);
    if (s.netMeter === 'yes') out.push('net metered');
  } else if (s.kind === 'wind') {
    out.push(other(s, 'size', 'sizeOther'), s.brand || '');
  } else if (s.kind === 'battery') {
    const t = BATTERY_TYPES.find((x) => x.value === s.btype);
    if (t && s.btype === 'portable') out.push('Portable power station');
    if (s.label) out.push(other(s, 'brand', 'brandOther'));
    out.push(s.model || '', other(s, 'kwh', 'kwhOther'));
    if (s.backup === 'whole') out.push('whole home');
    if (s.backup === 'partial') out.push('backup panel');
  } else if (s.kind === 'generator') {
    const t = GEN_TYPES.find((x) => x.value === s.gtype);
    if (t) out.push(t.value === 'standby' ? 'Standby' : 'Portable');
    out.push(other(s, 'size', 'sizeOther'));
    const h = GEN_HOOKUPS.find((x) => x.value === s.hookup);
    if (h && h.value !== 'none') out.push(h.short);
    out.push(other(s, 'fuel', 'fuelOther'));
  } else if (s.kind === 'other') {
    if (s.label && s.what) out.push(s.what);
  }
  return out.filter(Boolean).join(' · ');
}
export const shutoffText = (s) => (s ? (s.shutoff === 'other' ? s.shutoffOther || '' : s.shutoff || '') : '');
// "☀️ Solar 8 kW" chips for the panel header / sticker
export function sourceChip(s, list = []) {
  const k = kindOf(s.kind);
  const name = sourceName(s, list);
  const size = s.kind === 'solar' || s.kind === 'wind' || s.kind === 'generator' ? other(s, 'size', 'sizeOther') : s.kind === 'battery' ? other(s, 'kwh', 'kwhOther') : '';
  return `${k ? k.icon + ' ' : ''}${name}${size && !name.includes(size) ? ' ' + size : ''}`;
}
// "Utility + Solar + Battery backup" for headers and printed sheets
export function sourcesSummary(p) {
  const list = sourcesOf(p);
  const kinds = [...new Set(list.map((s) => s.kind))].map((k) => kindOf(k).label);
  const parts = [...(hasUtility(p) ? ['Utility'] : list.length ? ['No utility (off-grid)'] : []), ...kinds];
  return list.length || !hasUtility(p) ? parts.join(' + ') : '';
}

// ---------------------------------------------------------------- safety note (general info)
// A source that can push power INTO the panel: everything except a source the person
// marked as feeding another panel (the note then shows on that home anyway, see homeNote).
export function backfeedSources(p) {
  return sourcesOf(p);
}
// Words for the shut-offs a person should know about. Returns null when there is nothing to say.
export function safetyNote(panels, breakers = []) {
  const ps = (Array.isArray(panels) ? panels : [panels]).filter(Boolean);
  const list = ps.flatMap((p) => sourcesOf(p).map((s) => ({ s, p, all: sourcesOf(p) })));
  const bfKinds = breakers.map((b) => b.backfeed).filter((k) => kindOf(k));
  const kinds = [...new Set([...list.map((x) => x.s.kind), ...bfKinds])];
  if (!kinds.length) return null;
  const words = kinds.map((k) => (k === 'battery' ? 'battery' : k === 'other' ? 'another power source' : kindOf(k).noun));
  const what = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];
  const shutoffs = list
    .map(({ s, p, all }) => {
      const where = shutoffText(s) || (s.kind === 'generator' && s.inlet && s.inlet !== 'Other' ? `inlet: ${s.inlet}` : '');
      const name = sourceName(s, all);
      const off = s.kind === 'solar' ? 'solar shut-off / AC disconnect' : s.kind === 'wind' ? 'wind disconnect' : s.kind === 'battery' ? 'battery off switch' : s.kind === 'generator' ? 'turn it off and unplug it' : 'its shut-off';
      return { kind: s.kind, icon: kindOf(s.kind).icon, text: `${name}: ${off}${where ? ` (${where})` : ''}`, where, panel: ps.length > 1 ? p.name : '' };
    });
  return {
    kinds,
    title: `This home has ${what} power`,
    body: shutoffs.length ? 'Turning off the main breaker may NOT make everything dead. Also shut off:' : 'Turning off the main breaker may NOT make everything dead. Shut off the other power source too (solar disconnect, battery, generator).',
    shutoffs,
    short: `${kinds.map((k) => kindOf(k).icon).join('')} ${what[0].toUpperCase()}${what.slice(1)} on site. Main off ≠ all off.`,
    disclaimer: 'General info, not electrical advice. Work inside a panel is for a licensed electrician.',
  };
}

// Informational only, behind More details: the "120% rule" many inspectors use for a solar
// breaker on the bus. Never enforced; worded as general info.
export function busHint(p, s) {
  const bus = parseInt(p && (p.mainAmps === 'other' ? p.mainAmpsOther : p.mainAmps), 10);
  const amps = parseInt(s && (s.bfAmps === 'other' ? s.bfAmpsOther : s.bfAmps), 10);
  if (!bus) return 'General info: many places limit how big a solar breaker on the panel can be (often called the "120% rule"). Your installer or inspector has the final word.';
  const room = Math.round(bus * 1.2 - bus);
  const base = `General info: with a ${bus}A main and ${bus}A bus, the "120% rule" many inspectors use allows about ${room}A of solar breaker at the far end of the bus.`;
  if (amps && amps > room) return `${base} ${amps}A is more than that, which is often handled with a smaller main or a line-side tap. Your installer or inspector has the final word.`;
  return `${base} Your installer or inspector has the final word.`;
}

// Breakers linked to a source: by id, or (when it's the only source of its kind on the
// panel) any breaker tagged with that kind and no specific source.
export function breakersFor(s, breakers, list = []) {
  const only = list.filter((x) => x.kind === s.kind).length <= 1;
  return breakers.filter((b) => b.backfeedSrc === s.id || (only && !b.backfeedSrc && b.backfeed === s.kind));
}
// The source a tagged breaker belongs to (or null).
export function sourceOfBreaker(b, list) {
  if (!b || !b.backfeed) return null;
  const same = (list || []).filter((s) => s.kind === b.backfeed);
  return same.find((s) => s.id === b.backfeedSrc) || (same.length === 1 ? same[0] : null);
}
