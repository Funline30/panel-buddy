// Dropdown option lists (Caleb prefers dropdowns over toggles).
export const AMP_OPTIONS = ['15', '20', '30', '40', '50', '60', 'other'];

export const POLE_OPTIONS = [
  { value: '1', label: 'Single pole (120V)' },
  { value: '2', label: 'Double pole (240V)' },
  { value: '3', label: 'Three-pole (3-phase)' },
];

// "Breaker type" dropdown. Tandem = 2 half-size breakers in 1 space, each its own circuit.
export const BTYPE_OPTIONS = [
  { value: 'single', label: 'Single (1 breaker, 120V)' },
  { value: 'tandem', label: 'Tandem / twin (2 in 1 space)' },
  { value: 'double', label: '2-pole (240V)' },
  { value: 'quad', label: 'Quad (2-pole + 2 singles)' },
];

export const BREAKER_KINDS = [
  { value: 'standard', label: 'Standard' },
  { value: 'gfci', label: 'GFCI breaker' },
  { value: 'afci', label: 'AFCI breaker' },
  { value: 'dual', label: 'Dual function (AFCI + GFCI)' },
  { value: 'gfpe', label: 'Ground-fault (equipment)' },
  { value: 'spare', label: 'Spare / unused' },
];

// group: where it shows in the Add picker (common first, the rest under "More types").
export const DEVICE_TYPES = [
  { value: 'outlet', label: 'Outlet', icon: '🔌', group: 'common' },
  { value: 'light', label: 'Light', icon: '💡', group: 'common' },
  { value: 'switch', label: 'Switch', icon: '🎚️', group: 'common' },
  { value: 'fan', label: 'Fan', icon: '🌀', group: 'common' },
  { value: 'appliance', label: 'Appliance', icon: '🧺', group: 'common' },
  { value: 'smoke', label: 'Smoke / CO alarm', icon: '🚨', group: 'safety' },
  { value: 'junction', label: 'Junction box', icon: '📦', group: 'other' },
  { value: 'ev', label: 'EV charger', icon: '🚗', group: 'equipment' },
  { value: 'hvac', label: 'AC / heat pump', icon: '❄️', group: 'equipment' },
  { value: 'waterheater', label: 'Water heater', icon: '🚿', group: 'equipment' },
  { value: 'wellpump', label: 'Well pump', icon: '💧', group: 'equipment' },
  { value: 'solar', label: 'Solar / inverter', icon: '☀️', group: 'equipment' },
  { value: 'generator', label: 'Generator / inlet', icon: '⛽', group: 'equipment' },
  { value: 'subpanel', label: 'Sub-panel / disconnect', icon: '🗄️', group: 'equipment' },
  { value: 'other', label: 'Other', icon: '⚡', group: 'other' },
];

export const GFCI_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'no', label: 'No' },
  { value: 'gfci_outlet', label: 'Yes - GFCI outlet (has test/reset)' },
  { value: 'downstream', label: 'Yes - protected by a GFCI upstream' },
  { value: 'gfci_breaker', label: 'Yes - GFCI breaker' },
];

export const AFCI_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'no', label: 'No' },
  { value: 'afci_breaker', label: 'Yes - AFCI breaker' },
  { value: 'afci_outlet', label: 'Yes - AFCI outlet' },
];

export const STATUS_OPTIONS = [
  { value: 'working', label: 'Working' },
  { value: 'dead', label: 'Dead / not working' },
  { value: 'repair', label: 'Needs repair' },
  { value: 'unknown', label: 'Unknown' },
];

export const PANEL_TYPES = [
  { value: 'main', label: 'Home panel (main)' },
  { value: 'sub', label: 'Sub-panel' },
  { value: 'rv', label: 'RV / camper distribution center' },
  { value: 'other', label: 'Other' },
];

export const HOME_TYPES = [
  { value: 'house', label: 'House' },
  { value: 'mobile', label: 'Mobile / manufactured home' },
  { value: 'rv', label: 'RV / camper / travel trailer' },
  { value: 'commercial', label: 'Commercial building (store, office, plant)' },
  { value: 'other', label: 'Other (shop, shed, cabin...)' },
];

export const LAYOUT_OPTIONS = [
  { value: 'auto', label: 'Automatic (1 column for RV, 2 for home panels)' },
  { value: 'one', label: 'One column (stacked)' },
  { value: 'two', label: 'Two columns (odd left, even right)' },
];

export const NUMBERING_OPTIONS = [
  { value: 'space', label: '1 number per space (most panels)' },
  { value: 'half', label: '2 numbers per space (1 & 3 share a space)' },
];

export const SPACE_OPTIONS = ['4', '6', '8', '12', '16', '20', '24', '30', '32', '40', '42', 'other'];
export const MAIN_AMP_OPTIONS = ['60', '100', '125', '150', '200', '225', '400', 'other'];
export const RV_MAIN_AMP_OPTIONS = ['15', '20', '30', '50', '100', '200', 'other'];

// Shore power service for RVs. 30A = 30 amps at 120V. 50A = 50 amps on EACH of two
// 120V legs (120/240V). Household = a regular 120V outlet on a 15A or 20A circuit.
export const SHORE_POWER_OPTIONS = [
  { value: '30', label: '30A / 120V (TT-30 plug)' },
  { value: '50', label: '50A / 120/240V (two legs, 14-50 plug)' },
  { value: '20', label: '20A household outlet (120V)' },
  { value: '15', label: '15A household outlet (120V)' },
  { value: 'pole', label: 'Power pole / hardwired service (uses main breaker size)' },
  { value: 'other', label: 'Other' },
];

// Where a home panel gets its power from (shown on all non-RV panels).
export const POWER_SOURCE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'pole', label: 'Utility power pole (meter on pole)' },
  { value: 'house_meter', label: 'Meter on the house / home' },
  { value: 'pedestal', label: 'Underground to meter pedestal' },
  { value: 'subfeed', label: 'Fed from another panel' },
  { value: 'generator', label: 'Generator / solar / other' },
];

export const LEG_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: '1', label: 'Leg 1 (L1)' },
  { value: '2', label: 'Leg 2 (L2)' },
];

export const FUSE_AMP_OPTIONS = ['3', '5', '7.5', '10', '15', '20', '25', '30', '40', 'other'];
export const FUSE_USES = [
  'Interior lights', 'Exterior lights', 'Water pump', 'Furnace fan', 'Vent fan', 'Slide-out', 'Awning',
  'Tongue jack', 'Leveling jacks', 'Refrigerator (12V)', 'Water heater (12V control)', 'LP / CO detector',
  'Radio / stereo', 'TV antenna booster', 'USB / 12V outlets', 'Step', 'Other',
];

export const HOME_ROOMS = ['Kitchen', 'Living room', 'Dining room', 'Master bedroom', 'Master bath', 'Bedroom 2', 'Bedroom 3', 'Bathroom', 'Hallway', 'Laundry / utility', 'Garage', 'Office', 'Basement', 'Attic', 'Exterior'];
export const RV_ROOMS = ['Galley', 'Bedroom', 'Bath', 'Living / dinette', 'Exterior', 'Basement / storage', 'Bunkhouse', 'Front cap'];

export function labelOf(list, value) {
  const hit = list.find((o) => (typeof o === 'string' ? o === value : o.value === value));
  if (!hit) return value || '';
  return typeof hit === 'string' ? hit : hit.label;
}

export function deviceIcon(type) {
  const hit = DEVICE_TYPES.find((d) => d.value === type);
  return hit ? hit.icon : '⚡';
}

// ---- style / quantity / box (for a shopping list). Missing fields on older docs = qty 1, style unknown.
export const OUTLET_STYLES = [
  { value: '', label: 'Not set' },
  { value: 'duplex', label: 'Standard duplex', short: 'standard duplex outlet', plate: 'duplex' },
  { value: 'tr_duplex', label: 'Tamper-resistant duplex', short: 'TR duplex outlet', plate: 'duplex' },
  { value: 'decora', label: 'Decora / rocker-style', short: 'Decora outlet', plate: 'decora' },
  { value: 'gfci', label: 'GFCI', short: 'GFCI outlet', plate: 'decora' },
  { value: 'afci', label: 'AFCI', short: 'AFCI outlet', plate: 'decora' },
  { value: 'usb', label: 'USB combo', short: 'USB combo outlet', plate: 'decora' },
  { value: 'double', label: 'Double / quad (2-gang)', short: 'quad (2-gang) outlet', plate: 'duplex', gangs: 2 },
  { value: '20a', label: '20A', short: '20A outlet', plate: 'duplex' },
  { value: 'weatherproof', label: 'Weatherproof / outdoor', short: 'weatherproof outlet + in-use cover', plate: 'decora' },
  { value: '240dryer', label: '240V dryer (30A)', short: '30A dryer outlet', plate: 'other' },
  { value: '240range', label: '240V range (50A)', short: '50A range outlet', plate: 'other' },
  { value: '240welder', label: '240V welder / shop', short: '240V welder outlet', plate: 'other' },
  { value: '240ev', label: '240V EV (14-50)', short: '14-50 EV outlet', plate: 'other' },
  { value: 'other', label: 'Other', short: 'other outlet', plate: 'other' },
];
export const SWITCH_STYLES = [
  { value: '', label: 'Not set' },
  { value: 'toggle', label: 'Toggle single-pole', short: 'toggle switch (single-pole)', plate: 'toggle' },
  { value: 'rocker', label: 'Rocker (Decora) single-pole', short: 'rocker switch (single-pole)', plate: 'decora' },
  { value: '3way', label: '3-way', short: '3-way switch', plate: 'toggle' },
  { value: '4way', label: '4-way', short: '4-way switch', plate: 'toggle' },
  { value: 'dimmer', label: 'Dimmer', short: 'dimmer', plate: 'decora' },
  { value: 'combo', label: 'Combo switch / outlet', short: 'combo switch/outlet', plate: 'decora' },
  { value: 'smart', label: 'Smart', short: 'smart switch', plate: 'decora' },
  { value: 'other', label: 'Other', short: 'other switch', plate: 'other' },
];
export const BOX_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: 'existing', label: 'Existing box (reuse it)' },
  { value: 'oldwork', label: 'Needs new box - old-work (swing-tab / lever drywall box)', short: 'old-work box (swing-tab / lever)' },
  { value: 'mobile', label: 'Needs new box - mobile-home box', short: 'mobile-home box' },
  { value: 'surface', label: 'Surface / no box' },
];
export const NEW_BOX_VALUES = ['oldwork', 'mobile'];
export const REPLACE_OPTIONS = [
  { value: '', label: 'No' },
  { value: 'yes', label: 'Yes - needs replacing' },
];
export const PLATE_LABELS = { duplex: 'duplex outlet plate', decora: 'Decora (rocker) plate', toggle: 'toggle switch plate', other: 'other plate' };

export const LIGHT_STYLES = [
  { value: '', label: 'Not set' },
  { value: 'ceiling', label: 'Ceiling light', short: 'ceiling light' },
  { value: 'recessed', label: 'Recessed / can', short: 'recessed light' },
  { value: 'fixture', label: 'Wall / vanity fixture', short: 'wall fixture' },
  { value: 'exterior', label: 'Outdoor / flood', short: 'outdoor light' },
  { value: 'other', label: 'Other', short: 'other light' },
];
export const FAN_STYLES = [
  { value: '', label: 'Not set' },
  { value: 'ceiling', label: 'Ceiling fan', short: 'ceiling fan' },
  { value: 'ceiling_light', label: 'Ceiling fan + light', short: 'ceiling fan with light' },
  { value: 'vent', label: 'Bath / vent fan', short: 'vent fan' },
  { value: 'other', label: 'Other', short: 'other fan' },
];
export const SMOKE_STYLES = [
  { value: '', label: 'Not set' },
  { value: 'smoke', label: 'Smoke', short: 'smoke alarm' },
  { value: 'co', label: 'CO', short: 'CO alarm' },
  { value: 'combo', label: 'Smoke + CO', short: 'smoke + CO alarm' },
];
export function stylesFor(type) {
  if (type === 'outlet') return OUTLET_STYLES;
  if (type === 'switch') return SWITCH_STYLES;
  if (type === 'light') return LIGHT_STYLES;
  if (type === 'fan') return FAN_STYLES;
  if (type === 'smoke') return SMOKE_STYLES;
  return null;
}
export function styleOf(d) {
  const list = d && stylesFor(d.type);
  return (list && list.find((s) => s.value && s.value === d.style)) || null;
}
export function qtyOf(d) {
  const n = Math.floor(Number(d && d.qty));
  return Number.isFinite(n) && n > 0 ? n : 1;
}
