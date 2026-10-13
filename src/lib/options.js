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
  { value: 'main', label: 'Main panel' },
  { value: 'sub', label: 'Sub-panel' },
];

export const SPACE_OPTIONS = ['8', '12', '16', '20', '24', '30', '32', '40', '42'];
export const MAIN_AMP_OPTIONS = ['60', '100', '125', '150', '200', '225', '400', 'other'];

export function labelOf(list, value) {
  const hit = list.find((o) => (typeof o === 'string' ? o === value : o.value === value));
  if (!hit) return value || '';
  return typeof hit === 'string' ? hit : hit.label;
}

export function deviceIcon(type) {
  const hit = DEVICE_TYPES.find((d) => d.value === type);
  return hit ? hit.icon : '⚡';
}
