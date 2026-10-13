// Dropdown option lists (Caleb prefers dropdowns over toggles).
export const AMP_OPTIONS = ['15', '20', '30', '40', '50', '60', 'other'];

export const POLE_OPTIONS = [
  { value: '1', label: 'Single pole (120V)' },
  { value: '2', label: 'Double pole (240V)' },
];

export const BREAKER_KINDS = [
  { value: 'standard', label: 'Standard' },
  { value: 'gfci', label: 'GFCI breaker' },
  { value: 'afci', label: 'AFCI breaker' },
  { value: 'dual', label: 'Dual function (AFCI + GFCI)' },
  { value: 'spare', label: 'Spare / unused' },
];

export const DEVICE_TYPES = [
  { value: 'outlet', label: 'Outlet', icon: '🔌' },
  { value: 'light', label: 'Light', icon: '💡' },
  { value: 'switch', label: 'Switch', icon: '🎚️' },
  { value: 'fan', label: 'Fan', icon: '🌀' },
  { value: 'appliance', label: 'Appliance', icon: '🧺' },
  { value: 'smoke', label: 'Smoke / CO alarm', icon: '🚨' },
  { value: 'junction', label: 'Junction box', icon: '📦' },
  { value: 'other', label: 'Other', icon: '⚡' },
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
  { value: 'other', label: 'Other (shop, shed, cabin...)' },
];

export const LAYOUT_OPTIONS = [
  { value: 'auto', label: 'Automatic (1 column for RV, 2 for home panels)' },
  { value: 'one', label: 'One column (stacked)' },
  { value: 'two', label: 'Two columns (odd left, even right)' },
];

export const SPACE_OPTIONS = ['4', '6', '8', '12', '16', '20', '24', '30', '32', '40', '42', 'other'];
export const MAIN_AMP_OPTIONS = ['60', '100', '125', '150', '200', '225', '400', 'other'];
export const RV_MAIN_AMP_OPTIONS = ['15', '20', '30', '50', 'other'];

// Shore power service for RVs. 30A = 30 amps at 120V. 50A = 50 amps on EACH of two
// 120V legs (120/240V). Household = a regular 120V outlet on a 15A or 20A circuit.
export const SHORE_POWER_OPTIONS = [
  { value: '30', label: '30A / 120V (TT-30 plug)' },
  { value: '50', label: '50A / 120/240V (two legs, 14-50 plug)' },
  { value: '20', label: '20A household outlet (120V)' },
  { value: '15', label: '15A household outlet (120V)' },
  { value: 'other', label: 'Other' },
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
