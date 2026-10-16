// Sample home for demo mode, loosely based on a real single-wide/double-wide setup.
// Everything here is example data a user can edit or delete.
export function seedData() {
  const now = Date.now();
  const H = 'h_sample';
  const P = 'p_main';
  const homes = [{ id: H, type: 'mobile', name: 'Sample mobile home', address: 'Riesel, TX (example)', notes: 'Example data - edit or delete anything.', createdAt: now, portables: [{ name: 'Vacuum (upright)', watts: 1000, qty: 1, note: 'Typical estimate', portable: true }, { name: 'Carpet cleaner', watts: 1200, qty: 1, note: 'Typical estimate', portable: true }] }];
  const panels = [
    { id: P, homeId: H, name: 'Main panel', type: 'main', layout: 'auto', mainAmps: '200', spaces: '24', location: 'Hall closet by back door', notes: 'Main breaker at top. Spaces 23-24 empty.', createdAt: now },
  ];
  const b = (id, slot, poles, amps, label, rooms, extra = {}) => ({
    id, homeId: H, panelId: P, slot: String(slot), poles: String(poles), amps: String(amps), label, rooms, kind: 'standard', notes: '', loads: [], createdAt: now, ...extra,
  });
  const breakers = [
    b('b1', 1, 2, 40, 'Range / oven', ['Kitchen'], { loads: [{ name: 'Range (GE GRF40HSVSS)', watts: 5760, qty: 1, note: '240V · 24A running' }] }),
    b('b2', 2, 2, 30, 'Water heater', ['Utility room']),
    b('b5', 5, 2, 30, 'Dryer', ['Utility room']),
    b('b6', 6, 1, 20, 'Kitchen counter outlets', ['Kitchen'], { kind: 'standard', loads: [{ name: 'Coffee maker', watts: 1000, qty: 1 }, { name: 'Toaster', watts: 1000, qty: 1 }] }),
    b('b8', 8, 1, 20, 'Refrigerator', ['Kitchen'], { loads: [{ name: 'Refrigerator', watts: 600, qty: 1, note: 'Label: 5.0A' }], notes: 'Dedicated fridge circuit. New GFCI installed Oct 12; outlet reads 120V.' }),
    b('b9', 9, 1, 15, 'Master bedroom + master bath + closet lights', ['Master bedroom', 'Master bath', 'Master closet'], { notes: 'One circuit feeds the master bedroom, the master bath lights and the closet light.', loads: [{ name: 'LED bulb', watts: 10, qty: 6 }, { name: 'TV', watts: 150, qty: 1 }, { name: 'Phone charger', watts: 20, qty: 2 }] }),
    b('b10', 10, 1, 20, 'Dining room outlets', ['Dining room'], { notes: 'First outlet is a GFCI. Its LOAD side feeds the rest of the dining outlets.', loads: [{ name: 'Space heater', watts: 1500, qty: 1 }] }),
    b('b11', 11, 1, 15, 'Bedroom 2 - computer, 3D printer, WiFi', ['Bedroom 2'], { notes: 'Office/bedroom. PC, 3D printer and WiFi share this one. Also feeds the ceiling light. What is plugged in is listed on each outlet.', loads: [{ name: 'LED bulb', watts: 10, qty: 2 }] }),
    b('b12', 12, 1, 20, 'Bathroom outlets', ['Hall bath'], { kind: 'gfci', loads: [{ name: 'Hair dryer', watts: 1500, qty: 1, portable: true, on: false }] }),
    b('b13', 13, 1, 15, 'Living room outlets + lights', ['Living room'], { loads: [{ name: 'Window AC', watts: 900, qty: 1, on: false }, { name: 'Ceiling fan', watts: 75, qty: 1 }, { name: 'Porch light', watts: 15, qty: 1 }] }),
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
    d('d5', 'b10', 'outlet', 'GFCI outlet (first in line)', 'Dining room', 'East wall by window', { gfci: 'gfci_outlet', style: 'gfci', replace: 'yes', box: 'existing', notes: 'LINE = power in from panel. LOAD terminals feed the other dining outlets, so if this one trips, they all go dead. Reset here.' }),
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
    d('d10', 'b11', 'outlet', 'Desk outlet', 'Bedroom 2', 'Behind desk, west wall', { notes: 'PC, monitors, 3D printer on a power strip here.', loads: [{ name: 'Gaming PC', watts: 600, qty: 1 }, { name: 'Computer monitor', watts: 40, qty: 2 }, { name: '3D printer (heated bed)', watts: 300, qty: 1 }] }),
    d('d11', 'b11', 'outlet', 'WiFi outlet', 'Bedroom 2', 'By the window', { notes: 'WiFi router + modem.', loads: [{ name: 'WiFi router / modem', watts: 15, qty: 1 }] }),
    d('d12', 'b11', 'light', 'Ceiling light', 'Bedroom 2', 'Center of ceiling', { notes: 'Bulb was out: fixed by prying up the socket tab (Oct 12).', readings: [{ text: '120V brass tab to threads with switch ON', date: '2026-10-12' }] }),
    d('d13', 'b8', 'outlet', 'Fridge outlet', 'Kitchen', 'Behind refrigerator', { gfci: 'gfci_outlet', notes: 'New GFCI installed Oct 12. Reads 120V.' }),
    d('d14', 'b6', 'outlet', 'Counter outlet', 'Kitchen', 'Left of sink', { gfci: 'gfci_outlet' }),
    d('d15', 'b12', 'outlet', 'Bathroom outlet', 'Hall bath', 'Next to sink', { gfci: 'gfci_breaker' }),
    d('d16', 'b13', 'outlet', 'TV outlet', 'Living room', 'Under the TV', { notes: 'TV, soundbar and chargers on a power strip.', loads: [{ name: 'TV', watts: 120, qty: 1 }, { name: 'Vizio soundbar + sub', watts: 60, qty: 1 }, { name: 'MSI laptop charger', watts: 360, qty: 1, portable: true, note: 'Label: 3A' }, { name: 'Phone chargers', watts: 288, qty: 1, note: 'Label: 2.4A' }] }),
    d('d17', 'b14', 'appliance', 'Microwave', 'Kitchen', 'Over the range'),
    d('d18', 'b9', 'outlet', 'Bedroom outlets', 'Master bedroom', 'Around the room', { style: 'tr_duplex', qty: 7, box: 'oldwork', replace: 'yes', notes: 'Old loose outlets. Swapping all 7 for tamper-resistant; boxes are cracked.' }),
    d('d19', 'b9', 'switch', 'Light switches', 'Master bedroom', 'By doors', { style: 'toggle', qty: 2, box: 'existing', replace: 'yes' }),
    d('d20', 'b10', 'switch', 'Dining light switch', 'Dining room', 'By the hallway', { style: 'rocker', box: 'mobile', replace: 'yes' }),
  ];
  // ---- sample camper (RV panel, 30A shore power, 12V fuses)
  const R = 'h_camper';
  const RP = 'p_rv';
  homes.push({ id: R, type: 'rv', name: 'Sample camper', address: 'Travel trailer (example)', notes: 'Example RV data - edit or delete anything.', createdAt: now });
  panels.push({
    id: RP, homeId: R, name: 'RV distribution center', type: 'rv', layout: 'auto', shorePower: '30', mainAmps: '30', spaces: '6', location: 'Under the bed, front of the base', createdAt: now,
    notes: 'Example: AC + microwave + electric water heater together is more than 30A shore power can carry.',
    fuses: [
      { num: '1', amps: '15', powers: 'Interior lights', notes: 'Front half' },
      { num: '2', amps: '15', powers: 'Interior lights', notes: 'Rear half + bath' },
      { num: '3', amps: '10', powers: 'Water pump', notes: '' },
      { num: '4', amps: '15', powers: 'Furnace fan', notes: '' },
      { num: '5', amps: '20', powers: 'Slide-out', notes: '' },
      { num: '6', amps: '10', powers: 'LP / CO detector', notes: 'Also radio memory' },
      { num: '7', amps: '15', powers: 'Awning', notes: 'And porch light' },
    ],
  });
  const rb = (id, slot, amps, label, rooms, extra = {}) => ({ id, homeId: R, panelId: RP, slot: String(slot), poles: '1', amps: String(amps), label, rooms, kind: 'standard', notes: '', loads: [], createdAt: now, ...extra });
  breakers.push(
    rb('rb1', 1, 20, 'Air conditioner', ['Living / dinette'], { loads: [{ name: 'RV rooftop AC (running)', watts: 1500, qty: 1 }] }),
    rb('rb2', 2, 20, 'Microwave', ['Galley'], { loads: [{ name: 'Microwave', watts: 1200, qty: 1 }] }),
    rb('rb3', 3, 20, 'Water heater (electric)', ['Basement / storage'], { loads: [{ name: 'RV water heater element', watts: 1400, qty: 1 }] }),
    rb('rb4', 4, 15, 'Converter / battery charger', ['Basement / storage']),
    rb('rb5', 5, 15, 'Galley + bath outlets (GFCI)', ['Galley', 'Bath'], { kind: 'standard' }),
    rb('rb6', 6, 15, 'Bedroom + exterior outlets', ['Bedroom', 'Exterior'])
  );
  devices.push(
    d('rd1', 'rb5', 'outlet', 'GFCI outlet', 'Galley', 'Backsplash by sink', { homeId: R, gfci: 'gfci_outlet', notes: 'Reset here if the bath or outside outlets die.' }),
    d('rd2', 'rb5', 'outlet', 'Bath outlet', 'Bath', 'By the mirror', { homeId: R, gfci: 'downstream' }),
    d('rd3', 'rb6', 'outlet', 'Outside outlet', 'Exterior', 'Door side, by the awning', { homeId: R, gfci: 'downstream' }),
    d('rd4', 'rb2', 'appliance', 'Microwave', 'Galley', 'Above the stove', { homeId: R })
  );

  const ex = tandemExample(H, now);
  panels.push(...ex.panels);
  breakers.push(...ex.breakers);
  return { homes, panels, breakers, devices, customers: [], photos: [] };
}

// Example of a tandem-ready panel for the demo home (also added on request with
// ?example=tandem to a demo that was started before it existed; adds only missing ids).
// Laid out like a real Cutler-Hammer BR 40-circuit panel whose sticker numbers 2 per row
// (left 1/3, 5/7...; right 2/4, 6/8...): full-size singles fill a row (1/3), tandems put 2
// circuits in one row (2 and 4), full-size double-poles span 2 rows (Dryer 5–11), and a
// quad has 2 singles with a 240V in the middle (13, 15–17, 19).
export function tandemExample(H = 'h_sample', now = Date.now()) {
  const TP = 'p_rows';
  const panels = [{ id: TP, homeId: H, name: 'Example: 2 numbers per row', type: 'sub', layout: 'two', numbering: 'half', mainAmps: '200', spaces: '40', location: 'Example panel - edit or delete', notes: 'Example: the sticker numbers 2 per row (1/3, 5/7 on the left; 2/4, 6/8 on the right), so tandem breakers fit.', createdAt: now }];
  const t = (id, slot, amps, label, extra = {}) => ({ id, homeId: H, panelId: TP, slot: String(slot), poles: '1', amps: String(amps), label, rooms: [], kind: 'standard', notes: '', loads: [], createdAt: now, ...extra });
  const dbl = { poles: '2', btype: 'double' };
  const tan = (g, half) => ({ size: 'half', btype: 'tandem', groupId: g, half });
  const quad = (g, half, poles = '1') => ({ size: 'half', btype: 'quad', groupId: g, half, poles });
  const breakers = [
    // left side
    t('pr1', 1, 15, 'Gen #4', { btype: 'single', loads: [{ name: 'Lights', watts: 300, qty: 1 }] }),
    t('pr5', 5, 30, 'Dryer', { ...dbl, rooms: ['Laundry / utility'], loads: [{ name: 'Clothes dryer (electric)', watts: 5000, qty: 1 }] }),
    t('pr13', 13, 15, 'GFI #8 Bath', { ...quad('gq13', 'A'), rooms: ['Bathroom'], loads: [{ name: 'Hair dryer', watts: 1500, qty: 1, on: false, portable: true }] }),
    t('pr15', 15, 30, 'Furnace', { ...quad('gq13', 'B', '2'), loads: [{ name: 'Furnace blower', watts: 1200, qty: 1 }] }),
    t('pr19', 19, 15, 'Dishwasher', { ...quad('gq13', 'B'), rooms: ['Kitchen'], loads: [{ name: 'Dishwasher', watts: 1200, qty: 1, on: false }] }),
    t('pr21', 21, 60, 'Furnace heat', { ...dbl, loads: [{ name: 'Electric heat strips', watts: 9600, qty: 1, on: false }] }),
    // right side
    t('pr2', 2, 20, 'GFI #1 Kitchen', { ...tan('gt2', 'A'), rooms: ['Kitchen'], loads: [{ name: 'Coffee maker', watts: 900, qty: 1 }, { name: 'Toaster', watts: 1100, qty: 1, on: false }] }),
    t('pr4', 4, 20, '#2 Dining room', { ...tan('gt2', 'B'), rooms: ['Dining room'] }),
    t('pr6', 6, 20, 'Washer', { ...tan('gt6', 'A'), rooms: ['Laundry / utility'], loads: [{ name: 'Washing machine', watts: 500, qty: 1 }] }),
    t('pr8', 8, 20, 'Microwave', { ...tan('gt6', 'B'), rooms: ['Kitchen'], loads: [{ name: 'Microwave', watts: 1200, qty: 1 }] }),
    t('pr10', 10, 40, 'Range', { ...dbl, rooms: ['Kitchen'], loads: [{ name: 'Range (GE GRF40HSVSS)', watts: 5760, qty: 1, note: '240V · 24A running' }] }),
    t('pr18', 18, 20, 'Water heater', { ...dbl, loads: [{ name: 'Water heater (electric)', watts: 3500, qty: 1 }] }),
    t('pr26', 26, 15, '', { btype: 'single' }),
    t('pr30', 30, 15, '', { btype: 'single' }),
  ];
  return { panels, breakers };
}

export function sampleHome(now = Date.now()) {
  return seedData().homes.find((h) => h.id === 'h_sample') || { id: 'h_sample', type: 'mobile', name: 'Sample mobile home', createdAt: now };
}

// Sample customers for Tech / Pro mode demo.
export function seedPro() {
  const now = Date.now();
  const day = 86400000;
  return {
    customers: [
      { id: 'c_smith', name: 'Dana Smith (example)', phone: '555-0101', email: '', notes: 'Gate code 1234. Dog in backyard.', visits: [{ date: '2026-09-30', notes: 'Added 20A circuit for garage freezer. Labeled panel.' }], lastServiced: '2026-09-30', lastOpenedAt: now - day, openCount: 4, createdAt: now - 30 * day },
      { id: 'c_lopez', name: 'Ray Lopez (example)', phone: '555-0148', email: '', notes: '2019 travel trailer. Brings it to the shop.', visits: [{ date: '2026-10-08', notes: 'Shore power tripping: AC + water heater + microwave at once on 30A. Showed him the load check.' }], lastServiced: '2026-10-08', lastOpenedAt: now - 2 * day, openCount: 2, createdAt: now - 10 * day },
    ],
    homes: [
      { id: 'h_smith', type: 'house', customerId: 'c_smith', name: 'Smith house', address: '12 Example Rd (example)', notes: '', createdAt: now },
    ],
    panels: [
      { id: 'p_smith', homeId: 'h_smith', name: 'Main panel', type: 'main', layout: 'auto', mainAmps: '200', spaces: '20', location: 'Garage', notes: '', createdAt: now },
    ],
    breakers: [
      { id: 'sb1', homeId: 'h_smith', panelId: 'p_smith', slot: '1', poles: '2', amps: '30', label: 'Dryer', rooms: ['Laundry / utility'], kind: 'standard', notes: '', loads: [], createdAt: now },
      { id: 'sb2', homeId: 'h_smith', panelId: 'p_smith', slot: '2', poles: '1', amps: '20', label: 'Garage freezer (new)', rooms: ['Garage'], kind: 'standard', notes: 'Added Sep 30', loads: [{ name: 'Chest freezer (running)', watts: 200, qty: 1 }], createdAt: now },
      { id: 'sb4', homeId: 'h_smith', panelId: 'p_smith', slot: '4', poles: '1', amps: '15', label: 'Bedrooms', rooms: ['Bedroom 2', 'Bedroom 3'], kind: 'afci', notes: '', loads: [], createdAt: now },
    ],
    devices: [],
  };
}
