// Sample home for demo mode, loosely based on a real single-wide/double-wide setup.
// Everything here is example data a user can edit or delete.
export function seedData() {
  const now = Date.now();
  const H = 'h_sample';
  const P = 'p_main';
  const homes = [{ id: H, name: 'Sample mobile home', address: 'Riesel, TX (example)', notes: 'Example data - edit or delete anything.', createdAt: now }];
  const panels = [
    { id: P, homeId: H, name: 'Main panel', type: 'main', mainAmps: '200', spaces: '24', location: 'Hall closet by back door', notes: 'Main breaker at top. Spaces 23-24 empty.', createdAt: now },
  ];
  const b = (id, slot, poles, amps, label, rooms, extra = {}) => ({
    id, homeId: H, panelId: P, slot: String(slot), poles: String(poles), amps: String(amps), label, rooms, kind: 'standard', notes: '', loads: [], createdAt: now, ...extra,
  });
  const breakers = [
    b('b1', 1, 2, 40, 'Range / oven', ['Kitchen']),
    b('b2', 2, 2, 30, 'Water heater', ['Utility room']),
    b('b5', 5, 2, 30, 'Dryer', ['Utility room']),
    b('b6', 6, 1, 20, 'Kitchen counter outlets', ['Kitchen'], { kind: 'standard', loads: [{ name: 'Coffee maker', watts: 1000, qty: 1 }, { name: 'Toaster', watts: 1000, qty: 1 }] }),
    b('b8', 8, 1, 20, 'Refrigerator', ['Kitchen'], { loads: [{ name: 'Refrigerator (running)', watts: 400, qty: 1 }], notes: 'Dedicated fridge circuit. New GFCI installed Oct 12; outlet reads 120V.' }),
    b('b9', 9, 1, 15, 'Master bedroom + master bath + closet lights', ['Master bedroom', 'Master bath', 'Master closet'], { notes: 'One circuit feeds the master bedroom, the master bath lights and the closet light.', loads: [{ name: 'LED bulb', watts: 10, qty: 6 }, { name: 'TV', watts: 150, qty: 1 }, { name: 'Phone charger', watts: 20, qty: 2 }] }),
    b('b10', 10, 1, 20, 'Dining room outlets', ['Dining room'], { notes: 'First outlet is a GFCI. Its LOAD side feeds the rest of the dining outlets.', loads: [{ name: 'Space heater', watts: 1500, qty: 1 }] }),
    b('b11', 11, 1, 15, 'Bedroom 2 - computer, 3D printer, WiFi', ['Bedroom 2'], { notes: 'Office/bedroom. PC, 3D printer and WiFi share this one. Also feeds the ceiling light.', loads: [{ name: 'Gaming PC', watts: 600, qty: 1 }, { name: 'Computer monitor', watts: 40, qty: 2 }, { name: '3D printer (heated bed)', watts: 300, qty: 1 }, { name: 'WiFi router / modem', watts: 15, qty: 1 }, { name: 'LED bulb', watts: 10, qty: 2 }] }),
    b('b12', 12, 1, 20, 'Bathroom outlets', ['Hall bath'], { kind: 'gfci', loads: [{ name: 'Hair dryer', watts: 1500, qty: 1 }] }),
    b('b13', 13, 1, 15, 'Living room outlets + lights', ['Living room'], { loads: [{ name: 'TV', watts: 150, qty: 1 }, { name: 'Game console', watts: 200, qty: 1 }, { name: 'LED bulb', watts: 10, qty: 4 }] }),
    b('b14', 14, 1, 20, 'Microwave', ['Kitchen'], { loads: [{ name: 'Microwave', watts: 1200, qty: 1 }] }),
    b('b15', 15, 1, 15, 'Hall bath lights + vent fan', ['Hall bath'], { notes: 'Vent fan motor is dead (switch tests good).' }),
    b('b16', 16, 1, 20, 'Washer', ['Utility room'], { loads: [{ name: 'Washer', watts: 500, qty: 1 }] }),
    b('b17', 17, 1, 15, 'Kids bedrooms', ['Bedroom 3', 'Bedroom 4'], { notes: 'Example: a space heater plus the TV and console is too much for 15A.', loads: [{ name: 'Space heater', watts: 1500, qty: 1 }, { name: 'TV', watts: 150, qty: 1 }, { name: 'Game console', watts: 200, qty: 1 }] }),
    b('b18', 18, 1, 20, 'Spare', [], { kind: 'spare' }),
    b('b19', 19, 2, 60, 'Furnace / heat strip', ['Hallway']),
    b('b20', 20, 2, 30, 'AC condenser', ['Outside']),
  ];
  const d = (id, breakerId, type, name, room, location, extra = {}) => ({
    id, homeId: H, breakerId, type, name, room, location, gfci: 'no', afci: 'unknown', status: 'working', notes: '', readings: [], createdAt: now, ...extra,
  });
  const breakersById = breakers;
  void breakersById;
  const devices = [
    d('d1', 'b9', 'light', 'Ceiling light', 'Master bedroom', 'Center of ceiling', { notes: 'Wall switch by the door.' }),
    d('d2', 'b9', 'outlet', 'Outlet by bed', 'Master bedroom', 'North wall by bed'),
    d('d3', 'b9', 'light', 'Vanity light', 'Master bath', 'Over the sink', { notes: 'Swapping for a 2-light vanity fixture.' }),
    d('d4', 'b9', 'light', 'Closet light', 'Master closet', 'Ceiling, just inside door'),
    d('d5', 'b10', 'outlet', 'GFCI outlet (first in line)', 'Dining room', 'East wall by window', { gfci: 'gfci_outlet', notes: 'LINE = power in from panel. LOAD terminals feed the other dining outlets, so if this one trips, they all go dead. Reset here.' }),
    d('d6', 'b10', 'outlet', 'Outlet', 'Dining room', 'South wall, center', { gfci: 'downstream', notes: 'Fed from the LOAD side of the dining GFCI.' }),
    d('d7', 'b10', 'outlet', 'Outlet', 'Dining room', 'West wall by hutch', { gfci: 'downstream', notes: 'Fed from the LOAD side of the dining GFCI.' }),
    d('d8', 'b15', 'fan', 'Bathroom vent fan', 'Hall bath', 'Ceiling over tub', {
      status: 'dead',
      notes: 'Motor dead. Mobile-home style fan (vents through roof). Looking at a full swap: measure ceiling hole (~10.5") first.',
      readings: [
        { text: '30V with switch OFF (ghost voltage - no real power behind it)', date: '2026-10-12' },
        { text: '130V with switch ON - switch and wiring OK, fan motor is the problem', date: '2026-10-12' },
      ],
    }),
    d('d9', 'b15', 'light', 'Bath light', 'Hall bath', 'Over mirror'),
    d('d10', 'b11', 'outlet', 'Desk outlet', 'Bedroom 2', 'Behind desk, west wall', { notes: 'PC, monitors, 3D printer on a power strip here.' }),
    d('d11', 'b11', 'outlet', 'WiFi outlet', 'Bedroom 2', 'By the window', { notes: 'WiFi router + modem.' }),
    d('d12', 'b11', 'light', 'Ceiling light', 'Bedroom 2', 'Center of ceiling', { notes: 'Bulb was out: fixed by prying up the socket tab (Oct 12).', readings: [{ text: '120V brass tab to threads with switch ON', date: '2026-10-12' }] }),
    d('d13', 'b8', 'outlet', 'Fridge outlet', 'Kitchen', 'Behind refrigerator', { gfci: 'gfci_outlet', notes: 'New GFCI installed Oct 12. Reads 120V.' }),
    d('d14', 'b6', 'outlet', 'Counter outlet', 'Kitchen', 'Left of sink', { gfci: 'gfci_outlet' }),
    d('d15', 'b12', 'outlet', 'Bathroom outlet', 'Hall bath', 'Next to sink', { gfci: 'gfci_breaker' }),
    d('d16', 'b13', 'outlet', 'TV outlet', 'Living room', 'Under the TV'),
    d('d17', 'b14', 'appliance', 'Microwave', 'Kitchen', 'Over the range'),
  ];
  return { homes, panels, breakers, devices, photos: [] };
}
