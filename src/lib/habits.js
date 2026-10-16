// "How much is it on?" + standby watts. Lets every breaker show realistic readings
// (Idle / Typical / Peak) without anyone flipping switches.
//
// Optional load fields (old loads simply don't have them):
//   idleW: number  -> watts when idle / standby, per item (TV ~0.5W, fridge between cycles ~5W)
//   use:   'always' | 'cycles' | 'hours' | 'sometimes'  -> how much of the day it runs
// Missing -> a default guessed from the device catalog by name (TYPICAL ESTIMATES), else
// idle 0W and "A few hours a day".
import { CATALOG } from './catalog.js';
import { matchCatalog } from './devicesearch.js';

export const USE_OPTIONS = [
  { id: 'always', label: 'Always', sub: 'On all the time', share: 1 },
  { id: 'cycles', label: 'Cycles', sub: 'Fridge, freezer, AC', share: 0.45 },
  { id: 'hours', label: 'A few hours a day', sub: 'TV, lights, computer', share: 0.15 },
  { id: 'sometimes', label: 'Now and then', sub: 'Hair dryer, microwave', share: 0.05 },
];
export const DEFAULT_USE = 'hours';
export const HABIT_NOTE = 'Idle watts and how much it runs are typical estimates. Change them if you know better.';

export const useOption = (id) => USE_OPTIONS.find((o) => o.id === id) || null;
export const useShare = (id) => (useOption(id) || useOption(DEFAULT_USE)).share;
export const useLabel = (id) => (useOption(id) || useOption(DEFAULT_USE)).label;

// Rules run against "<load name> <catalog id>" (lowercase). First match wins.
// [pattern, use, idle watts per item]
const RULES = [
  [/freeze[- ]?dryer/, 'cycles', 5],
  [/water[- ]heater|water-heater/, 'hours', 0],
  [/hair|curling|flat-iron|straightener|hot-rollers|hot-air-brush|shampoo|carpet-cleaner|vacuum|steam-mop|iron\b|clothes-iron|steamer/, 'sometimes', 0],
  [/washing-machine|washer|dryer-combo|clothes dryer|electric-dryer|gas-dryer|heat-pump-dryer|\bdryer\b/, 'hours', 1],
  [/fridge|refrigerator|freezer|wine|kegerator|beverage cooler|medication-fridge/, 'cycles', 5],
  [/window[- ]ac|air[- ]?condition|\bac\b|a\/c|mini[- ]split|central-ac|heat pump|geothermal|swamp cooler/, 'cycles', 2],
  [/dehumidifier/, 'cycles', 1],
  [/furnace|heat[- ]strips|baseboard|wall-heater|radiant|space[- ]heater|oil-filled|quartz|desk-under-desk-heater|garage-heater|\bheater\b|electric-fireplace/, 'cycles', 0],
  [/hot tub|hot-tub|spa\b|sauna-heater|pool-heater|waterbed|stock-tank|heated-water|waterer|aquarium-heater|reptile-heat|heat-mat|heat tape|heat-tape|heated-hose|de-icing|pump-house-heater|greenhouse-heater|coop-panel|brooder|heat-lamp/, 'cycles', 0],
  [/sump|ejector|well[- ]pump|jet-pump|lift-pump|booster/, 'sometimes', 0],
  [/router|modem|mesh|starlink|network-switch|\bnas\b|home-server|ups-battery|crypto|filter-pump|pet-water-fountain|smoke|doorbell|security-camera|camera|alarm|smart-home-hub|hub\b|radon|erv|fence|septic-aerator|uv-water|pond|fountain-pump|clock|cordless-phone|baby-monitor|smart-speaker|smart-display|echo|alexa|water-softener|recirculation|circulator|aerator|incubator|oxygen-concentrator-home|alternating-pressure/, 'always', 0],
  [/cable|satellite|dvr/, 'hours', 15],
  [/\btv\b|tv-|television|plasma|crt|projector/, 'hours', 0.5],
  [/soundbar|sound bar|subwoofer|receiver|speakers|stereo/, 'hours', 1],
  [/playstation|ps5|ps4|xbox|nintendo|switch-docked|console/, 'hours', 1],
  [/laptop|desktop|computer|gaming-pc|imac|mac-mini|\bpc\b|monitor/, 'hours', 1],
  [/printer/, 'sometimes', 2],
  [/garage-door|garage door/, 'sometimes', 4],
  [/charger|charging|tender|power-bank|power-station/, 'hours', 0.3],
  [/microwave/, 'sometimes', 2],
  [/range|stove|oven|cooktop/, 'sometimes', 3],
  [/dishwasher/, 'hours', 1],
  [/coffee|keurig|espresso|instant pot|instant-pot|bread/, 'sometimes', 1],
  [/ceiling[- ]fan/, 'hours', 0.5],
  [/fan\b|fan-|purifier|humidifier/, 'hours', 0],
  [/light|lamp|bulb|lantern|sign|christmas|inflatable/, 'hours', 0],
  [/cpap|bipap|white-noise|sound-machine|electric-blanket|mattress-pad|bed-cooling/, 'hours', 0],
  [/grow/, 'hours', 0],
  [/pool-pump|pool pump|salt-chlorinator/, 'hours', 0],
];

const CAT_DEFAULT = {
  kitchen: ['sometimes', 0],
  laundry: ['hours', 1],
  hvac: ['cycles', 0],
  bath: ['sometimes', 0],
  ent: ['hours', 1],
  office: ['hours', 1],
  charge: ['hours', 0.3],
  light: ['hours', 0],
  bed: ['hours', 0],
  clean: ['sometimes', 0],
  tools: ['sometimes', 0],
  yard: ['sometimes', 0],
  farm: ['cycles', 0],
  pool: ['hours', 0],
  water: ['cycles', 0],
  medical: ['hours', 0],
  kids: ['sometimes', 0],
  pets: ['always', 0],
  hobby: ['sometimes', 0],
};

function ruleFor(text) {
  for (const [re, use, idle] of RULES) if (re.test(text)) return { use, idle };
  return null;
}

// Catalog entry -> { use, idle } (estimate). Used to fill the device search too.
export function catalogHabit(entry) {
  if (!entry) return null;
  const r = ruleFor(`${entry.name} ${entry.id}`.toLowerCase());
  if (r) return r;
  const [use, idle] = CAT_DEFAULT[entry.cat] || [DEFAULT_USE, 0];
  return { use, idle };
}

const cache = new Map();
// Default habit for a free-text load name: name words first ("porch light"), then the
// closest catalog device, then "A few hours a day" with 0W idle.
export function guessHabit(name) {
  const key = String(name || '').trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  let out = null;
  if (key) {
    const direct = ruleFor(key);
    const cat = matchCatalog(key);
    if (direct) out = { ...direct, source: 'guess', catalogId: cat ? cat.id : null };
    else if (cat) out = { ...catalogHabit(cat), source: 'catalog', catalogId: cat.id };
  }
  if (!out) out = { use: DEFAULT_USE, idle: 0, source: 'default', catalogId: null };
  cache.set(key, out);
  return out;
}

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

// Everything the readings need for one load, per ITEM (multiply by qty yourself).
// { run, idle, use, share, idleIsGuess, useIsGuess }
export function habitOf(l) {
  const run = Math.max(0, Number(l && l.watts) || 0);
  const g = guessHabit(l && l.name);
  const ownIdle = num(l && l.idleW);
  const hasIdle = Number.isFinite(ownIdle) && ownIdle >= 0;
  const hasUse = !!useOption(l && l.use);
  const use = hasUse ? l.use : g.use;
  let idle = hasIdle ? ownIdle : g.idle;
  if (use === 'always') idle = run; // never idles: standby = running
  idle = Math.min(idle, run);
  return { run, idle, use, share: useShare(use), idleIsGuess: !hasIdle, useIsGuess: !hasUse };
}

export function catalogIdleOf(id) {
  const c = CATALOG.find((x) => x.id === id);
  return c ? catalogHabit(c) : null;
}
