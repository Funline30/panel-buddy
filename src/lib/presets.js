// Typical wattage estimates for the load check. These are rough, commonly cited
// ballpark figures, NOT measurements. The app tells users to use the nameplate
// (label on the device or its power brick) whenever they can.
export const LOAD_PRESETS = [
  { name: 'Desktop PC', watts: 300 },
  { name: 'Gaming PC', watts: 600 },
  { name: 'Laptop', watts: 65 },
  { name: 'Computer monitor', watts: 40 },
  { name: '3D printer (heated bed)', watts: 300 },
  { name: 'WiFi router / modem', watts: 15 },
  { name: 'TV', watts: 150 },
  { name: 'Game console', watts: 200 },
  { name: 'Space heater', watts: 1500 },
  { name: 'Microwave', watts: 1200 },
  { name: 'Refrigerator (running)', watts: 400 },
  { name: 'Chest freezer (running)', watts: 200 },
  { name: 'Coffee maker', watts: 1000 },
  { name: 'Toaster', watts: 1000 },
  { name: 'Air fryer', watts: 1500 },
  { name: 'Hair dryer', watts: 1500 },
  { name: 'Window AC (small)', watts: 900 },
  { name: 'Box / window fan', watts: 100 },
  { name: 'Ceiling fan', watts: 75 },
  { name: 'Vacuum', watts: 1000 },
  { name: 'Washer', watts: 500 },
  { name: 'Dishwasher', watts: 1500 },
  { name: 'LED bulb', watts: 10 },
  { name: 'Phone charger', watts: 20 },
  { name: 'RV rooftop AC (running)', watts: 1500 },
  { name: 'RV water heater element', watts: 1400 },
  { name: 'RV converter / battery charger', watts: 600 },
  { name: 'Electric fireplace', watts: 1500 },
];

export const PRESET_NOTE =
  'Preset watts are rough typical numbers. For a real check, use the watts (or volts x amps) printed on the device label or power brick.';
