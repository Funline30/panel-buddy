// Built-in catalog of things people plug in (or hardwire) at home, with TYPICAL power
// figures for the device search. These are rough, commonly cited ballpark ranges
// (Energy Star / DOE / manufacturer-typical), NOT measurements. The app always tells
// people to check the nameplate label on the actual device.
//
// Row: x(name, category, lowWatts, highWatts, volts, circuitNote, synonyms, opts)
//   opts.t     = typical watts used to pre-fill the load check (default: a round mid value)
//   opts.s     = [low, high] startup surge watts (motors / compressors)
//   opts.cont  = runs for hours at a time (counts against the 80% rule)
//   opts.hw    = usually hardwired (not plugged into an outlet)

export const CATEGORIES = [
  { id: 'kitchen', label: 'Kitchen', icon: '🍳' },
  { id: 'laundry', label: 'Laundry', icon: '🧺' },
  { id: 'hvac', label: 'Heating & cooling', icon: '🌡️' },
  { id: 'bath', label: 'Bathroom & grooming', icon: '🛁' },
  { id: 'ent', label: 'TV & entertainment', icon: '📺' },
  { id: 'office', label: 'Computers & office', icon: '💻' },
  { id: 'charge', label: 'Chargers & batteries', icon: '🔌' },
  { id: 'light', label: 'Lighting', icon: '💡' },
  { id: 'bed', label: 'Bedroom & comfort', icon: '🛏️' },
  { id: 'clean', label: 'Cleaning', icon: '🧹' },
  { id: 'tools', label: 'Tools & garage', icon: '🔧' },
  { id: 'yard', label: 'Yard & outdoor', icon: '🌳' },
  { id: 'farm', label: 'Farm & animals', icon: '🐐' },
  { id: 'pool', label: 'Pool, spa & sauna', icon: '♨️' },
  { id: 'water', label: 'Water, plumbing & whole-house', icon: '🚰' },
  { id: 'medical', label: 'Medical', icon: '🩺' },
  { id: 'kids', label: 'Kids & baby', icon: '🍼' },
  { id: 'pets', label: 'Pets & aquariums', icon: '🐠' },
  { id: 'hobby', label: 'Hobby, craft & fitness', icon: '🎨' },
];

export const NOTES = {
  tiny: 'Tiny draw. Fine on any shared circuit.',
  shared: 'Fine on a shared 15A circuit.',
  mid: 'Fine on a shared 15-20A circuit. Just add it up with whatever else is on there.',
  big: "Big draw. OK on a shared 20A circuit, but don't run it at the same time as a heater or another big appliance on that circuit.",
  heat: "About 12.5A at 1500W, which is over 80% of a 15A circuit by itself. Keep it the only big thing on its circuit and plug it straight into the wall (no power strip or thin extension cord).",
  kitchen: 'Use a 20A kitchen countertop circuit. Two heating appliances running at once on one circuit can trip it.',
  own20: 'Usually needs its own 20A circuit.',
  own15: 'Best on its own 15-20A circuit (common practice).',
  hw: 'Usually hardwired on its own circuit.',
  bath20: 'Bathroom outlets should be a 20A GFCI circuit. A hair dryer plus a second heater tool can trip it.',
  gfci: 'Outdoors / near water: use a GFCI-protected outlet.',
};

const v240 = (a) => `240V dedicated circuit, usually ${a}A (2-pole breaker). Go by the label.`;
function nice(n) {
  const step = n < 50 ? 5 : n < 200 ? 10 : n < 1000 ? 50 : 100;
  return Math.round(n / step) * step || n;
}

const list = [];
function x(name, cat, lo, hi, v, note, aka = '', opts = {}) {
  list.push({ name, cat, lo, hi, v, note, aka, ...opts });
}

// ---------------------------------------------------------------- kitchen
x('Microwave', 'kitchen', 600, 1500, 120, 'kitchen', 'micro, microwave oven, nuker, countertop microwave', { t: 1200 });
x('Over-the-range microwave', 'kitchen', 1000, 1700, 120, 'own20', 'otr microwave, microwave hood, above stove microwave, built in microwave', { t: 1500, hw: false });
x('Toaster', 'kitchen', 800, 1500, 120, 'kitchen', 'toaster 2 slice, 4 slice toaster', { t: 1000 });
x('Toaster oven', 'kitchen', 1200, 1800, 120, 'kitchen', 'countertop oven, convection oven, breville, mini oven', { t: 1500 });
x('Air fryer', 'kitchen', 1200, 1800, 120, 'kitchen', 'airfryer, air frier, ninja air fryer, cosori, air fry oven', { t: 1500 });
x('Instant Pot / pressure cooker', 'kitchen', 700, 1200, 120, 'kitchen', 'instapot, instant pot, electric pressure cooker, multicooker, ninja foodi', { t: 1000 });
x('Slow cooker / Crock-Pot', 'kitchen', 150, 300, 120, 'shared', 'crockpot, crock pot, slowcooker', { t: 250, cont: true });
x('Rice cooker', 'kitchen', 300, 700, 120, 'mid', 'rice maker, zojirushi', { t: 500 });
x('Coffee maker (drip)', 'kitchen', 750, 1200, 120, 'kitchen', 'coffee pot, coffeemaker, mr coffee, drip coffee', { t: 1000 });
x('Keurig / single-serve coffee', 'kitchen', 1200, 1500, 120, 'kitchen', 'keurig, k cup, kcup, nespresso, pod coffee maker', { t: 1400 });
x('Espresso machine', 'kitchen', 1000, 1500, 120, 'kitchen', 'expresso machine, espresso maker, cappuccino machine, latte machine', { t: 1300 });
x('Electric kettle', 'kitchen', 1200, 1500, 120, 'kitchen', 'tea kettle, hot water kettle, water boiler', { t: 1500 });
x('Blender', 'kitchen', 300, 1500, 120, 'mid', 'vitamix, ninja blender, smoothie maker, nutribullet, magic bullet', { t: 1000 });
x('Food processor', 'kitchen', 400, 1000, 120, 'mid', 'cuisinart, chopper');
x('Stand mixer', 'kitchen', 250, 600, 120, 'shared', 'kitchenaid, kitchen aid mixer, dough mixer');
x('Hand mixer', 'kitchen', 150, 300, 120, 'shared', 'electric mixer, beater');
x('Electric can opener', 'kitchen', 50, 100, 120, 'tiny', 'can opener');
x('Electric griddle', 'kitchen', 1200, 1500, 120, 'kitchen', 'pancake griddle, flat top griddle electric', { t: 1500 });
x('Electric skillet', 'kitchen', 1000, 1500, 120, 'kitchen', 'frying pan electric, presto skillet', { t: 1500 });
x('Electric wok', 'kitchen', 1200, 1500, 120, 'kitchen', 'wok', { t: 1500 });
x('Waffle maker', 'kitchen', 800, 1400, 120, 'kitchen', 'waffle iron, belgian waffle');
x('Sandwich maker / panini press', 'kitchen', 700, 1500, 120, 'kitchen', 'panini press, panini grill, sandwich press, quesadilla maker');
x('Indoor electric grill', 'kitchen', 1200, 1650, 120, 'kitchen', 'george foreman, foreman grill, contact grill, smokeless grill', { t: 1500 });
x('Deep fryer', 'kitchen', 1500, 1800, 120, 'own20', 'fryer, fry daddy, deep frier', { t: 1700 });
x('Bread maker', 'kitchen', 450, 700, 120, 'mid', 'bread machine, breadmaker');
x('Popcorn popper', 'kitchen', 1000, 1400, 120, 'kitchen', 'air popper, popcorn maker');
x('Food dehydrator', 'kitchen', 300, 1000, 120, 'mid', 'dehydrator, jerky maker, excalibur', { t: 600, cont: true });
x('Sous vide', 'kitchen', 800, 1200, 120, 'mid', 'sous vide circulator, anova, immersion circulator', { cont: true });
x('Induction hot plate (1 burner)', 'kitchen', 1300, 1800, 120, 'own20', 'portable induction, induction burner, induction cooktop portable', { t: 1800 });
x('Electric hot plate / burner', 'kitchen', 1000, 1500, 120, 'kitchen', 'hot plate, hotplate, single burner, double burner', { t: 1500 });
x('Juicer', 'kitchen', 400, 1000, 120, 'mid', 'juice extractor, breville juicer');
x('Pizza oven (countertop electric)', 'kitchen', 1200, 1800, 120, 'own20', 'pizzazz, ooni volt, pizza maker', { t: 1500 });
x('Roaster oven (18 qt)', 'kitchen', 1200, 1450, 120, 'kitchen', 'nesco, turkey roaster, electric roaster, roaster', { t: 1450 });
x('Egg cooker', 'kitchen', 350, 600, 120, 'shared', 'egg boiler, dash egg cooker');
x('Milk frother', 'kitchen', 400, 650, 120, 'shared', 'aeroccino, frother');
x('Vacuum sealer', 'kitchen', 100, 200, 120, 'shared', 'foodsaver, food saver, sealer');
x('Meat grinder', 'kitchen', 300, 800, 120, 'mid', 'grinder for meat, sausage grinder', { s: [800, 1600] });
x('Meat slicer', 'kitchen', 100, 250, 120, 'shared', 'deli slicer, food slicer');
x('Grain mill', 'kitchen', 300, 1200, 120, 'mid', 'flour mill, nutrimill, wheat grinder');
x('Ice cream maker', 'kitchen', 30, 250, 120, 'shared', 'ice cream machine, ninja creami, creami');
x('Frozen drink maker', 'kitchen', 350, 600, 120, 'shared', 'margarita machine, margaritaville, slushie machine, slushy');
x('Countertop ice maker', 'kitchen', 100, 200, 120, 'shared', 'ice machine, nugget ice maker, opal, ice maker portable', { s: [300, 600] });
x('Water dispenser (hot & cold)', 'kitchen', 100, 600, 120, 'mid', 'water cooler, primo, bottled water dispenser', { t: 500 });
x('Instant hot water dispenser', 'kitchen', 750, 1300, 120, 'own15', 'insinkerator hot, hot water tap, under sink hot water', { t: 750 });
x('Warming drawer', 'kitchen', 400, 500, 120, 'own15', 'plate warmer');
x('Refrigerator', 'kitchen', 100, 400, 120, 'own15', 'fridge, frige, refridgerator, refrigerater, refrigirator, ice box, side by side, french door fridge, fridge freezer', { t: 400, s: [800, 1600] });
x('Mini fridge', 'kitchen', 50, 100, 120, 'shared', 'dorm fridge, compact fridge, small fridge, minifridge', { t: 100, s: [300, 600] });
x('Second fridge (garage / old)', 'kitchen', 150, 600, 120, 'own15', 'garage fridge, old fridge, extra fridge, beer fridge, shop fridge', { t: 500, s: [900, 1800] });
x('Wine / beverage cooler', 'kitchen', 70, 150, 120, 'shared', 'wine fridge, beverage fridge, drink cooler', { s: [300, 600] });
x('Kegerator', 'kitchen', 70, 200, 120, 'shared', 'keg fridge, beer tap fridge', { s: [400, 800] });
x('Chest freezer', 'kitchen', 50, 200, 120, 'own15', 'deep freezer, deepfreeze, freezer chest, garage freezer', { t: 200, s: [500, 1000] });
x('Upright freezer', 'kitchen', 100, 300, 120, 'own15', 'stand up freezer, freezer upright', { t: 250, s: [600, 1200] });
x('Freeze dryer (Harvest Right)', 'kitchen', 500, 1500, 120, 'own20', 'harvest right, freezedryer, freeze drier', { t: 1000, s: [1500, 2000], cont: true });
x('Dishwasher', 'kitchen', 1200, 2400, 120, 'Usually its own 15-20A circuit (often hardwired).', 'dish washer, dishwasher heater', { t: 1500 });
x('Garbage disposal', 'kitchen', 400, 900, 120, 'Usually its own 15-20A circuit (sometimes shared with the dishwasher).', 'disposal, garbage disposer, insinkerator, sink grinder', { t: 600, s: [1000, 2000] });
x('Trash compactor', 'kitchen', 400, 600, 120, 'own15', 'compactor', { s: [900, 1500] });
x('Range hood fan', 'kitchen', 50, 300, 120, 'shared', 'vent hood, stove hood, exhaust hood, range hood', { t: 150 });
x('Electric range / stove', 'kitchen', 8000, 12000, 240, v240('40-50'), 'stove, oven, electric oven, cook stove, range, cooker', { t: 8000 });
x('Induction range', 'kitchen', 9000, 12000, 240, v240('40-50'), 'induction stove, induction oven', { t: 9000 });
x('Wall oven (built-in)', 'kitchen', 2000, 5000, 240, v240('30'), 'built in oven, double oven, single wall oven', { t: 4000 });
x('Electric cooktop (built-in)', 'kitchen', 6000, 9000, 240, v240('30-40'), 'cooktop, glass top stove, induction cooktop', { t: 7000 });

// ---------------------------------------------------------------- laundry
x('Washing machine', 'laundry', 350, 800, 120, 'Code wants a 20A laundry circuit (it can share with a gas dryer).', 'washer, clothes washer, front loader, top loader, washing mashine', { t: 500, s: [800, 1600] });
x('Electric dryer', 'laundry', 3000, 5600, 240, v240('30'), 'clothes dryer, dryer, drier, electric drier', { t: 5000 });
x('Gas dryer', 'laundry', 300, 600, 120, 'Plugs into a regular 120V outlet, often the 20A laundry circuit.', 'gas drier, propane dryer, natural gas dryer', { t: 500, s: [800, 1200] });
x('Washer / dryer combo (120V all-in-one)', 'laundry', 1200, 1800, 120, 'own20', 'all in one washer dryer, ventless combo, washer dryer combo', { t: 1500 });
x('Heat pump dryer', 'laundry', 600, 1500, 240, 'Many need 240V; some run on 120V. Check the label.', 'ventless dryer, heat pump drier', { t: 1000 });
x('Clothes iron', 'laundry', 1000, 1800, 120, 'big', 'iron, steam iron, ironing', { t: 1200 });
x('Garment steamer', 'laundry', 900, 1500, 120, 'big', 'clothes steamer, steamer', { t: 1200 });

// ---------------------------------------------------------------- heating & cooling
x('Space heater', 'hvac', 750, 1500, 120, 'heat', 'heater, electric heater, portable heater, plug in heater, ceramic heater, spaceheater, space heator', { t: 1500, cont: true });
x('Oil-filled radiator heater', 'hvac', 600, 1500, 120, 'heat', 'oil heater, radiator heater, delonghi, oil filled heater', { t: 1500, cont: true });
x('Infrared / quartz heater', 'hvac', 750, 1500, 120, 'heat', 'quartz heater, infrared heater, heat surge, duraflame heater', { t: 1500, cont: true });
x('Electric fireplace', 'hvac', 1000, 1500, 120, 'heat', 'fireplace heater, fireplace insert electric, fake fireplace, tv stand fireplace', { t: 1500, cont: true });
x('Small desk / under-desk heater', 'hvac', 200, 500, 120, 'shared', 'desk heater, personal heater, foot heater, panel heater', { t: 400, cont: true });
x('Garage heater (240V)', 'hvac', 4000, 7500, 240, v240('30'), 'shop heater, garage heater, workshop heater, unit heater', { t: 5000, cont: true });
x('Baseboard heater', 'hvac', 500, 2500, 240, 'Usually 240V hardwired on a dedicated 15-20A circuit. About 250W per foot.', 'baseboard heat, electric baseboard, wall baseboard', { t: 1500, cont: true, hw: true });
x('Wall heater (electric)', 'hvac', 1000, 2000, 240, 'Usually 240V hardwired on a dedicated 15-20A circuit.', 'cadet heater, in wall heater, bathroom wall heater', { t: 1500, cont: true, hw: true });
x('Electric radiant floor heat', 'hvac', 300, 1500, 120, 'Usually on its own 15-20A GFCI circuit. Roughly 12-15W per sq ft.', 'heated floor, floor heat, warm floor, heated tile', { t: 600, cont: true, hw: true });
x('Pellet stove', 'hvac', 100, 400, 120, 'shared', 'pellet heater, pellet insert', { t: 150, s: [300, 500], cont: true });
x('Wood stove / fireplace blower', 'hvac', 50, 150, 120, 'shared', 'stove fan, fireplace blower, insert blower', { cont: true });
x('Window AC (small, 5,000-6,000 BTU)', 'hvac', 450, 600, 120, 'mid', 'window unit, window air conditioner, small ac, 5000 btu, 6000 btu, wall ac', { t: 550, s: [1000, 1800], cont: true });
x('Window AC (medium, 8,000-10,000 BTU)', 'hvac', 700, 1000, 120, 'big', 'window unit, window air conditioner, 8000 btu, 10000 btu, ac unit window', { t: 900, s: [1500, 2500], cont: true });
x('Window AC (large 120V, 12,000-15,000 BTU)', 'hvac', 1000, 1500, 120, 'own20', 'window unit, big window ac, 12000 btu, 15000 btu', { t: 1300, s: [2000, 3500], cont: true });
x('Window AC (240V, 18,000-25,000 BTU)', 'hvac', 1600, 2500, 240, v240('20'), 'window unit 240, 18000 btu, 24000 btu, 220 ac', { t: 2000, s: [3500, 5500], cont: true });
x('Portable air conditioner', 'hvac', 800, 1400, 120, 'own20', 'portable ac, rolling ac, floor ac', { t: 1100, s: [1600, 3000], cont: true });
x('Mini split (120V)', 'hvac', 500, 1200, 120, 'Hardwired on its own 15-20A circuit with a disconnect.', 'ductless, mini-split, minisplit, pioneer, mr cool', { t: 900, cont: true, hw: true });
x('Mini split (240V)', 'hvac', 600, 2000, 240, v240('15-25'), 'ductless, mini-split, minisplit, mr cool, heat pump mini split', { t: 1500, cont: true, hw: true });
x('Central AC / heat pump (outdoor unit)', 'hvac', 2000, 5000, 240, '240V dedicated circuit, often 20-50A. Go by the "max breaker" on the unit label.', 'condenser, ac unit, outside unit, compressor, central air, heat pump, a/c', { t: 3500, s: [6000, 12000], cont: true, hw: true });
x('Furnace blower (gas furnace)', 'hvac', 300, 800, 120, 'Usually hardwired on its own 15A circuit.', 'furnace, gas furnace, blower motor, air handler fan, hvac fan, propane furnace', { t: 600, s: [1000, 2000], cont: true, hw: true });
x('Electric furnace / heat strips', 'hvac', 5000, 20000, 240, 'Big 240V load on its own breakers (often 40-60A or more). Go by the label.', 'electric furnace, heat strips, strip heat, emergency heat, air handler heat', { t: 10000, cont: true, hw: true });
x('Geothermal heat pump', 'hvac', 2000, 6000, 240, v240('30-50'), 'geothermal, ground source heat pump', { t: 3500, cont: true, hw: true });
x('Dehumidifier', 'hvac', 300, 700, 120, 'mid', 'dehumidifer, dehumidfier, basement dehumidifier, frigidaire dehumidifier', { t: 500, s: [800, 1500], cont: true });
x('Humidifier (cool mist)', 'hvac', 20, 200, 120, 'shared', 'humidifer, ultrasonic humidifier, evaporative humidifier', { t: 50, cont: true });
x('Warm-mist humidifier / vaporizer', 'hvac', 200, 500, 120, 'shared', 'vaporizer, vicks, steam humidifier', { t: 300, cont: true });
x('Air purifier', 'hvac', 20, 100, 120, 'tiny', 'air cleaner, hepa filter, levoit, purifier', { t: 50, cont: true });
x('Box fan', 'hvac', 50, 100, 120, 'tiny', 'fan, window fan, lasko', { t: 75 });
x('Tower fan', 'hvac', 40, 100, 120, 'tiny', 'fan, oscillating fan');
x('Pedestal / stand fan', 'hvac', 40, 70, 120, 'tiny', 'fan, standing fan, floor fan');
x('Ceiling fan', 'hvac', 15, 90, 120, 'tiny', 'fan, ceiling fan light, fan light', { t: 75 });
x('Whole-house fan', 'hvac', 200, 700, 120, 'Usually hardwired on its own 15-20A circuit.', 'whole house fan, attic exhaust fan', { t: 500, hw: true });
x('Attic fan', 'hvac', 100, 300, 120, 'Usually hardwired.', 'gable fan, attic vent fan, powered attic ventilator', { hw: true });
x('Evaporative / swamp cooler (portable)', 'hvac', 60, 250, 120, 'shared', 'swamp cooler, evaporative cooler, air cooler, hessaire', { t: 150, cont: true });
x('Radon fan', 'hvac', 15, 150, 120, 'tiny', 'radon mitigation fan, radon system', { t: 75, cont: true, hw: true });
x('ERV / HRV (fresh-air vent)', 'hvac', 50, 200, 120, 'shared', 'erv, hrv, air exchanger, fresh air system', { cont: true });

// ---------------------------------------------------------------- bathroom & grooming
x('Hair dryer', 'bath', 1000, 1875, 120, 'bath20', 'blow dryer, blowdryer, hairdryer, hair drier, blow drier', { t: 1500 });
x('Hot air brush', 'bath', 1000, 1100, 120, 'bath20', 'revlon one step, blow dry brush, dyson airwrap, airwrap', { t: 1100 });
x('Curling iron', 'bath', 25, 150, 120, 'tiny', 'curler, curling wand');
x('Flat iron / hair straightener', 'bath', 30, 200, 120, 'tiny', 'straightener, flatiron, hair iron');
x('Hot rollers', 'bath', 300, 500, 120, 'shared', 'heated rollers, hair rollers');
x('Electric toothbrush charger', 'bath', 1, 5, 120, 'tiny', 'sonicare, oral b, toothbrush');
x('Electric shaver / trimmer charger', 'bath', 2, 15, 120, 'tiny', 'razor, shaver, beard trimmer, clippers, hair clippers');
x('Water flosser', 'bath', 10, 20, 120, 'tiny', 'waterpik, water pik');
x('Lighted makeup mirror', 'bath', 5, 20, 120, 'tiny', 'vanity mirror, makeup mirror');
x('Bathroom exhaust fan', 'bath', 10, 70, 120, 'tiny', 'bath fan, vent fan, bathroom vent, exhaust fan', { t: 50, hw: true });
x('Bath fan with heater', 'bath', 1200, 1600, 120, 'own20', 'heater fan, bathroom heater fan, heat lamp fan, fan heater combo', { t: 1500, hw: true });
x('Heated towel rack', 'bath', 60, 200, 120, 'shared', 'towel warmer, heated towel rail, towel heater', { t: 100, cont: true });
x('Bidet seat / heated toilet seat', 'bath', 50, 1200, 120, 'Needs a GFCI outlet by the toilet. Instant-heat models pull more.', 'bidet, washlet, toto, heated toilet seat, toilet seat warmer', { t: 400 });
x('Jetted tub pump', 'bath', 750, 1500, 120, 'Usually needs its own GFCI 15-20A circuit (a heater may need a second one).', 'whirlpool tub, jacuzzi tub, jet tub, spa tub', { t: 1200, s: [2000, 3000], hw: true });
x('Point-of-use water heater (120V)', 'bath', 1400, 1800, 120, 'own20', 'under sink water heater, mini tank water heater, point of use', { t: 1500, hw: true });
x('Steam shower generator', 'bath', 6000, 9000, 240, v240('40'), 'steam shower, steam generator', { t: 7500, hw: true });

// ---------------------------------------------------------------- TV & entertainment
x('TV 32"', 'ent', 30, 60, 120, 'tiny', 'tv, television, 32 inch tv, small tv', { t: 50 });
x('TV 40-43"', 'ent', 50, 90, 120, 'tiny', 'tv, television, 40 inch tv, 43 inch tv', { t: 75 });
x('TV 50-55"', 'ent', 60, 130, 120, 'shared', 'tv, television, 50 inch tv, 55 inch tv, smart tv', { t: 100 });
x('TV 65"', 'ent', 90, 200, 120, 'shared', 'tv, television, 65 inch tv, oled tv, big tv', { t: 150 });
x('TV 75" and up', 'ent', 120, 300, 120, 'shared', 'tv, television, 75 inch tv, 85 inch tv, huge tv', { t: 200 });
x('Old plasma TV', 'ent', 200, 500, 120, 'shared', 'plasma, plasma tv', { t: 300 });
x('Old tube (CRT) TV', 'ent', 60, 150, 120, 'shared', 'crt, tube tv, old tv');
x('Projector', 'ent', 150, 350, 120, 'shared', 'home theater projector, beamer', { t: 250 });
x('Soundbar', 'ent', 20, 100, 120, 'tiny', 'sound bar, sonos, vizio soundbar', { t: 40 });
x('Powered subwoofer', 'ent', 50, 300, 120, 'shared', 'sub, subwoofer, bass speaker', { t: 100 });
x('AV receiver / amplifier', 'ent', 60, 400, 120, 'shared', 'receiver, stereo amp, home theater receiver, amp', { t: 150 });
x('Powered speakers', 'ent', 20, 100, 120, 'tiny', 'speakers, bookshelf speakers, computer speakers, bluetooth speaker');
x('Smart speaker', 'ent', 2, 10, 120, 'tiny', 'echo, alexa, google home, homepod, echo dot');
x('Smart display', 'ent', 5, 15, 120, 'tiny', 'echo show, nest hub, google nest hub');
x('Streaming stick / box', 'ent', 3, 8, 120, 'tiny', 'roku, fire stick, firestick, apple tv, chromecast');
x('Cable / satellite box (DVR)', 'ent', 15, 35, 120, 'tiny', 'cable box, dish, directv, dvr, satellite receiver');
x('Blu-ray / DVD player', 'ent', 10, 30, 120, 'tiny', 'dvd, bluray, blu ray');
x('PlayStation 5', 'ent', 150, 230, 120, 'shared', 'ps5, playstation, sony console, game console', { t: 200 });
x('PlayStation 4', 'ent', 80, 160, 120, 'shared', 'ps4, playstation 4, game console', { t: 140 });
x('Xbox Series X', 'ent', 150, 210, 120, 'shared', 'xbox, xbox series x, game console', { t: 200 });
x('Xbox Series S', 'ent', 70, 90, 120, 'tiny', 'xbox s, xbox series s, game console', { t: 85 });
x('Xbox One', 'ent', 70, 120, 120, 'shared', 'xbox one, game console', { t: 110 });
x('Nintendo Switch (docked)', 'ent', 10, 40, 120, 'tiny', 'switch, nintendo, switch dock, game console', { t: 20 });
x('VR headset charger', 'ent', 15, 25, 120, 'tiny', 'oculus, quest, meta quest, vr');
x('Turntable / record player', 'ent', 5, 20, 120, 'tiny', 'record player, vinyl');
x('Karaoke machine', 'ent', 20, 100, 120, 'tiny', 'karaoke');
x('Electric guitar amp', 'ent', 20, 150, 120, 'tiny', 'guitar amp, amplifier, bass amp');
x('Digital piano / keyboard', 'ent', 10, 50, 120, 'tiny', 'keyboard, piano, electric piano, yamaha keyboard');
x('Arcade cabinet', 'ent', 100, 300, 120, 'shared', 'arcade, arcade1up, arcade machine');
x('Pinball machine', 'ent', 100, 300, 120, 'shared', 'pinball');
x('Massage chair', 'ent', 100, 300, 120, 'shared', 'massage recliner', { t: 200 });
x('Power recliner / lift chair', 'ent', 50, 300, 120, 'shared', 'recliner, power recliner, lift chair, power couch', { t: 100 });
x('Digital photo frame', 'ent', 5, 15, 120, 'tiny', 'photo frame, picture frame');
x('Clock radio / alarm clock', 'ent', 2, 5, 120, 'tiny', 'alarm clock, clock radio, clock');
x('Cordless phone base', 'ent', 2, 5, 120, 'tiny', 'home phone, landline, cordless phone');

// ---------------------------------------------------------------- computers & office
x('Desktop computer', 'office', 60, 300, 120, 'shared', 'pc, computer, desktop pc, tower, dell, hp desktop', { t: 200 });
x('Gaming PC', 'office', 300, 800, 120, 'mid', 'gaming computer, gaming rig, pc, rtx', { t: 600 });
x('Laptop', 'office', 30, 100, 120, 'tiny', 'notebook, macbook, chromebook, laptop charger, computer', { t: 65 });
x('iMac / all-in-one PC', 'office', 50, 150, 120, 'tiny', 'imac, all in one computer');
x('Mac mini / small PC', 'office', 10, 60, 120, 'tiny', 'mac mini, nuc, mini pc');
x('Computer monitor', 'office', 20, 60, 120, 'tiny', 'monitor, screen, display, 27 inch monitor', { t: 40 });
x('Gaming monitor', 'office', 40, 100, 120, 'tiny', 'monitor, 144hz, ultrawide');
x('Inkjet printer', 'office', 10, 30, 120, 'tiny', 'printer, hp printer, epson, canon printer');
x('Laser printer', 'office', 300, 600, 120, "Spikes near 1000W while warming up. Avoid the same circuit as a space heater.", 'printer, brother laser, laserjet', { t: 500, s: [800, 1100] });
x('3D printer (heated bed)', 'office', 100, 350, 120, 'shared', '3d printer, ender, bambu, prusa, filament printer', { t: 300, cont: true });
x('Resin 3D printer', 'office', 30, 60, 120, 'tiny', 'resin printer, sla printer, elegoo');
x('WiFi router / modem', 'office', 10, 20, 120, 'tiny', 'router, modem, wifi, wi-fi, internet box, gateway', { t: 15, cont: true });
x('Mesh WiFi node', 'office', 5, 15, 120, 'tiny', 'eero, mesh, wifi extender, extender, orbi', { cont: true });
x('Starlink', 'office', 50, 100, 120, 'shared', 'starlink dish, satellite internet', { t: 75, cont: true });
x('Network switch', 'office', 5, 30, 120, 'tiny', 'switch, ethernet switch, poe switch', { cont: true });
x('NAS / home server', 'office', 20, 300, 120, 'shared', 'nas, synology, server, plex server, home server', { t: 60, cont: true });
x('UPS battery backup', 'office', 10, 50, 120, 'tiny', 'ups, battery backup, apc', { cont: true });
x('Crypto miner (ASIC)', 'office', 1000, 3500, 240, v240('20-30'), 'bitcoin miner, asic, antminer, mining rig', { t: 3000, cont: true });
x('Paper shredder', 'office', 150, 400, 120, 'shared', 'shredder', { s: [500, 900] });
x('Laminator', 'office', 200, 600, 120, 'shared', 'laminating machine');
x('Scanner', 'office', 10, 30, 120, 'tiny', 'document scanner');
x('Desk lamp', 'office', 5, 15, 120, 'tiny', 'lamp, reading lamp, task lamp');

// ---------------------------------------------------------------- chargers & batteries
x('Phone charger', 'charge', 5, 20, 120, 'tiny', 'iphone charger, cell phone charger, usb charger, charger', { t: 20 });
x('Fast phone charger (USB-C)', 'charge', 20, 45, 120, 'tiny', 'usb c charger, fast charger, power adapter');
x('Tablet / iPad charger', 'charge', 10, 30, 120, 'tiny', 'ipad, tablet, kindle');
x('Wireless charging pad', 'charge', 5, 15, 120, 'tiny', 'qi charger, magsafe, wireless charger');
x('Smartwatch charger', 'charge', 2, 5, 120, 'tiny', 'apple watch, fitbit, watch charger');
x('USB charging station', 'charge', 10, 60, 120, 'tiny', 'charging hub, multi charger, charging dock');
x('Power bank / battery pack charging', 'charge', 10, 30, 120, 'tiny', 'power bank, portable charger, battery pack');
x('Portable power station charging', 'charge', 100, 1200, 120, 'mid', 'jackery, ecoflow, bluetti, power station, solar generator', { t: 500 });
x('Camera battery charger', 'charge', 5, 15, 120, 'tiny', 'camera charger, drone battery charger');
x('Power tool battery charger', 'charge', 50, 300, 120, 'shared', 'dewalt charger, milwaukee charger, ryobi charger, drill charger, tool charger', { t: 150 });
x('Car battery charger', 'charge', 50, 300, 120, 'shared', 'battery charger, auto battery charger, schumacher, noco', { t: 200 });
x('Battery tender / trickle charger', 'charge', 5, 20, 120, 'tiny', 'battery maintainer, trickle charger, battery tender', { cont: true });
x('E-bike charger', 'charge', 100, 250, 120, 'shared', 'ebike, electric bike, e bike battery');
x('Electric scooter charger', 'charge', 50, 150, 120, 'tiny', 'scooter, e-scooter');
x('Golf cart charger', 'charge', 500, 1100, 120, 'own15', 'golf cart, cart charger, club car, ezgo', { t: 900, cont: true });
x('Kids ride-on toy charger', 'charge', 15, 50, 120, 'tiny', 'power wheels, ride on car, kids car');
x('Mobility scooter / power chair charger', 'charge', 100, 400, 120, 'shared', 'wheelchair charger, mobility scooter, power chair', { cont: true });
x('EV charger Level 1 (120V)', 'charge', 1400, 1900, 120, 'Use its own 15-20A circuit. It runs for hours, so nothing else big should share it.', 'ev charger, electric car, tesla charger, car charger, level 1, l1, mobile connector, plug in hybrid', { t: 1440, cont: true });
x('EV charger Level 2 (240V)', 'charge', 3300, 11500, 240, '240V dedicated circuit, usually 40-60A (the charger amps x 1.25). Go by the charger manual.', 'ev charger, tesla wall connector, level 2, l2, electric car, chargepoint, nema 14-50, emporia', { t: 7700, cont: true });
x('Electric motorcycle / ATV charger', 'charge', 300, 1500, 120, 'own20', 'electric atv, electric motorcycle, ev motorcycle', { t: 1000, cont: true });

// ---------------------------------------------------------------- lighting
x('LED bulb', 'light', 5, 15, 120, 'tiny', 'light bulb, bulb, led light, lightbulb, light', { t: 10 });
x('CFL bulb', 'light', 13, 25, 120, 'tiny', 'compact fluorescent, swirl bulb');
x('Incandescent bulb', 'light', 40, 100, 120, 'tiny', 'old bulb, regular bulb, 60 watt bulb', { t: 60 });
x('LED shop light (4 ft)', 'light', 20, 45, 120, 'tiny', 'shop light, garage light, led tube, linkable light');
x('Fluorescent tube fixture', 'light', 50, 70, 120, 'tiny', 'fluorescent light, t8, t12, tube light');
x('Floor lamp', 'light', 10, 30, 120, 'tiny', 'lamp, standing lamp');
x('Halogen torchiere lamp', 'light', 150, 300, 120, 'shared', 'torchiere, halogen lamp');
x('Halogen work light', 'light', 250, 1000, 120, 'mid', 'work light, halogen, construction light', { t: 500 });
x('LED work light', 'light', 20, 100, 120, 'tiny', 'work light led, portable light');
x('Outdoor flood light (LED)', 'light', 20, 100, 120, 'tiny', 'flood light, floodlight, security light, yard light', { hw: true });
x('Motion security light', 'light', 10, 30, 120, 'tiny', 'motion light, motion sensor light', { hw: true });
x('Landscape lighting transformer', 'light', 100, 600, 120, 'shared', 'landscape lights, path lights, low voltage lights', { t: 200 });
x('Patio string lights', 'light', 10, 50, 120, 'tiny', 'string lights, bistro lights, cafe lights, market lights');
x('Christmas lights (LED, per strand)', 'light', 5, 15, 120, 'tiny', 'christmas lights, holiday lights, xmas lights, led string');
x('Christmas lights (incandescent, per strand)', 'light', 20, 175, 120, 'shared', 'christmas lights, c9, mini lights, old christmas lights, xmas lights', { t: 40 });
x('Pre-lit Christmas tree', 'light', 20, 100, 120, 'tiny', 'christmas tree, xmas tree');
x('Yard inflatable', 'light', 50, 150, 120, 'shared', 'blow up decoration, inflatable decoration, halloween inflatable, christmas inflatable', { cont: true });
x('Night light', 'light', 1, 4, 120, 'tiny', 'nightlight, plug in light', { t: 2 });
x('LED / neon sign', 'light', 10, 60, 120, 'tiny', 'neon sign, open sign, bar sign');
x('Salt lamp', 'light', 15, 25, 120, 'tiny', 'himalayan salt lamp');
x('Lava lamp', 'light', 25, 40, 120, 'tiny', 'lava');
x('Ring light', 'light', 10, 30, 120, 'tiny', 'selfie light, video light');
x('LED grow light', 'light', 100, 600, 120, 'mid', 'grow light, plant light, grow lamp, mars hydro, spider farmer', { t: 300, cont: true });
x('HID grow light (1000W)', 'light', 1000, 1100, 120, 'own20', 'hps, metal halide, grow light 1000w', { t: 1100, cont: true });

// ---------------------------------------------------------------- bedroom & comfort
x('Electric blanket', 'bed', 100, 200, 120, 'shared', 'heated blanket, heated throw, electric throw', { t: 150, cont: true });
x('Heated mattress pad', 'bed', 50, 200, 120, 'shared', 'mattress warmer, bed warmer, heated pad', { t: 100, cont: true });
x('Heating pad', 'bed', 40, 100, 120, 'tiny', 'heat pad, sunbeam heating pad');
x('Bed cooling pad (Chilipad / Eight Sleep)', 'bed', 50, 300, 120, 'shared', 'chilipad, eight sleep, bed cooler, ooler', { t: 100, cont: true });
x('Adjustable bed base', 'bed', 100, 300, 120, 'shared', 'adjustable bed, sleep number, power bed');
x('Waterbed heater', 'bed', 250, 400, 120, 'shared', 'waterbed', { t: 350, cont: true });
x('White noise / sound machine', 'bed', 2, 10, 120, 'tiny', 'sound machine, white noise, hatch');
x('Foot spa', 'bed', 75, 500, 120, 'shared', 'foot bath, pedicure spa');
x('Boot / shoe dryer', 'bed', 10, 100, 120, 'tiny', 'boot dryer, shoe dryer, peet dryer, glove dryer');
x('Massage gun charger', 'bed', 5, 20, 120, 'tiny', 'theragun, massage gun');

// ---------------------------------------------------------------- cleaning
x('Vacuum (upright)', 'clean', 500, 1400, 120, 'big', 'vacuum, vaccum, vacum, hoover, shark vacuum, upright vacuum', { t: 1000, s: [1500, 2500] });
x('Canister vacuum', 'clean', 1000, 1400, 120, 'big', 'vacuum, canister vac, miele vacuum', { t: 1200, s: [1500, 2500] });
x('Cordless stick vacuum charger', 'clean', 30, 100, 120, 'tiny', 'dyson, stick vacuum, cordless vacuum, handheld vacuum', { t: 50 });
x('Robot vacuum dock', 'clean', 20, 50, 120, 'tiny', 'roomba, robot vacuum, roborock, robovac, self emptying base');
x('Carpet cleaner', 'clean', 500, 1500, 120, 'big', 'carpet shampooer, rug doctor, bissell, big green', { t: 1200, s: [1500, 2500] });
x('Steam mop / steam cleaner', 'clean', 1000, 1500, 120, 'big', 'steam mop, steamer, steam cleaner', { t: 1300 });
x('Floor buffer / scrubber', 'clean', 700, 1500, 120, 'big', 'floor polisher, buffer, scrubber', { t: 1100, s: [2000, 3000] });
x('Central vacuum', 'clean', 1200, 2000, 120, 'Dedicated 20A circuit (some are 240V).', 'central vac, built in vacuum, whole house vacuum', { t: 1500, s: [2000, 3500], hw: true });

// ---------------------------------------------------------------- tools & garage
x('Shop vac', 'tools', 600, 1500, 120, 'big', 'wet dry vac, wet/dry vac, shopvac, rigid vac, ridgid vac, craftsman vac', { t: 1200, s: [2000, 3500] });
x('Table saw (jobsite, 10")', 'tools', 1500, 1800, 120, 'own20', 'table saw, tablesaw, dewalt table saw, sawstop jobsite', { t: 1800, s: [3000, 5000] });
x('Cabinet table saw (240V, 3 hp)', 'tools', 2200, 3000, 240, v240('20-30'), 'cabinet saw, sawstop, 240 table saw', { t: 2500, s: [5000, 8000] });
x('Miter saw', 'tools', 1500, 1800, 120, 'own20', 'chop saw, mitre saw, compound miter saw', { t: 1800, s: [3000, 4500] });
x('Circular saw', 'tools', 1200, 1800, 120, 'big', 'skil saw, skilsaw, worm drive, circ saw', { t: 1500, s: [2500, 4000] });
x('Jigsaw', 'tools', 400, 800, 120, 'mid', 'jig saw, saber saw', { s: [900, 1500] });
x('Reciprocating saw', 'tools', 1000, 1500, 120, 'big', 'sawzall, recip saw', { t: 1300, s: [2000, 3000] });
x('Corded drill', 'tools', 400, 900, 120, 'mid', 'drill, electric drill', { t: 600, s: [900, 1500] });
x('Hammer drill / rotary hammer', 'tools', 700, 1200, 120, 'mid', 'hammer drill, sds, roto hammer, rotary hammer', { t: 1000, s: [1500, 2500] });
x('Angle grinder', 'tools', 700, 1500, 120, 'big', 'grinder, cut off tool, 4.5 grinder', { t: 1000, s: [1500, 2500] });
x('Bench grinder', 'tools', 250, 600, 120, 'mid', 'grinding wheel, buffer wheel', { s: [800, 1500] });
x('Router (woodworking)', 'tools', 1200, 1800, 120, 'big', 'wood router, router table, trim router', { t: 1500, s: [2000, 3000] });
x('Benchtop planer', 'tools', 1500, 1800, 120, 'own20', 'thickness planer, planer, dewalt planer', { t: 1800, s: [3000, 5000] });
x('Jointer', 'tools', 1000, 1800, 120, 'own20', 'jointer planer', { t: 1500, s: [2500, 4000] });
x('Band saw', 'tools', 400, 1500, 120, 'mid', 'bandsaw', { t: 800, s: [1500, 3000] });
x('Drill press', 'tools', 300, 900, 120, 'mid', 'press drill', { t: 500, s: [900, 1800] });
x('Sander (orbital / belt)', 'tools', 200, 1000, 120, 'mid', 'orbital sander, belt sander, palm sander, random orbit', { t: 400 });
x('Oscillating multi-tool', 'tools', 200, 400, 120, 'shared', 'multi tool, oscillating tool, multitool');
x('Tile saw', 'tools', 800, 1500, 120, 'big', 'wet saw, tile cutter', { t: 1200, s: [2000, 3000] });
x('Dust collector', 'tools', 1100, 1800, 120, 'own20', 'dust collection, cyclone', { t: 1500, s: [2500, 4500] });
x('Heat gun', 'tools', 1000, 1800, 120, 'big', 'hot air gun, paint stripper gun', { t: 1500 });
x('Hot glue gun', 'tools', 15, 100, 120, 'tiny', 'glue gun');
x('Soldering iron / station', 'tools', 25, 80, 120, 'tiny', 'soldering, solder station');
x('Air compressor (small / pancake)', 'tools', 800, 1500, 120, 'own20', 'compressor, pancake compressor, hotdog compressor, porter cable compressor, air pump', { t: 1200, s: [2000, 3500] });
x('Air compressor (large, 240V)', 'tools', 2000, 4500, 240, v240('20-30'), 'big compressor, 60 gallon compressor, 80 gallon compressor, upright compressor', { t: 3000, s: [6000, 10000] });
x('Welder (120V flux-core / MIG)', 'tools', 1800, 2800, 120, 'Wants a 20A circuit, ideally with nothing else on it. Check the label.', 'welder, mig welder, flux core welder, wire welder, 110 welder', { t: 2400 });
x('Welder (240V stick / MIG / TIG)', 'tools', 4000, 9000, 240, v240('30-50'), 'stick welder, tig welder, 220 welder, lincoln buzz box, buzzbox', { t: 6000 });
x('Plasma cutter', 'tools', 2000, 6000, 240, 'Small ones run on 120V/20A; bigger ones need 240V 20-30A. Check the label.', 'plasma, plasma torch', { t: 3500 });
x('Pressure washer (electric)', 'tools', 1300, 2000, 120, 'own20', 'power washer, pressure washer, sun joe, greenworks pressure washer', { t: 1800, s: [2500, 4000] });
x('Paint sprayer', 'tools', 400, 1100, 120, 'mid', 'airless sprayer, graco, wagner, hvlp', { t: 800 });
x('Engine block heater', 'tools', 400, 1500, 120, 'own15', 'block heater, tank heater car, diesel heater plug', { t: 1000, cont: true });
x('Garage door opener', 'tools', 300, 600, 120, 'Usually its own ceiling outlet. Fine on a 15A.', 'garage opener, liftmaster, chamberlain, genie', { t: 450, s: [800, 1200], hw: true });
x('Jobsite radio', 'tools', 10, 50, 120, 'tiny', 'radio, work radio');
x('Electric chainsaw', 'tools', 1200, 1800, 120, 'big', 'chainsaw, chain saw corded', { t: 1600, s: [2500, 3500] });
x('Log splitter (electric)', 'tools', 1500, 2000, 120, 'own20', 'wood splitter, log splitter', { t: 1800, s: [3000, 4500] });
x('Wood chipper (electric)', 'tools', 1500, 1800, 120, 'own20', 'chipper, shredder chipper', { t: 1800, s: [3000, 4500] });

// ---------------------------------------------------------------- yard & outdoor
x('Electric lawn mower (corded)', 'yard', 1000, 1700, 120, 'big', 'mower, corded mower, electric mower, lawnmower', { t: 1500, s: [2500, 3500] });
x('Battery mower charger', 'yard', 100, 600, 120, 'shared', 'ego charger, mower battery charger, greenworks charger', { t: 300 });
x('Robot mower dock', 'yard', 20, 100, 120, 'tiny', 'robot mower, husqvarna automower, automower');
x('Electric leaf blower', 'yard', 600, 1500, 120, 'big', 'blower, leaf blower corded, toro blower', { t: 1400 });
x('Electric string trimmer', 'yard', 400, 800, 120, 'mid', 'weed eater, weedeater, weed wacker, weed whacker, string trimmer');
x('Electric hedge trimmer', 'yard', 300, 600, 120, 'shared', 'hedge clippers, hedge trimmer');
x('Electric snow blower', 'yard', 1000, 1800, 120, 'own20', 'snow thrower, snowblower', { t: 1600, s: [2500, 3500] });
x('Electric smoker', 'yard', 800, 1200, 120, 'own15', 'masterbuilt, smoker, electric smokehouse', { t: 800, cont: true });
x('Pellet grill', 'yard', 50, 400, 120, 'Uses ~300W for a few minutes while the igniter lights, then much less.', 'traeger, pit boss, pellet smoker, camp chef', { t: 300 });
x('Electric patio heater', 'yard', 1000, 1500, 120, 'heat', 'patio heater, outdoor heater, infrared patio heater', { t: 1500, cont: true });
x('Bug zapper', 'yard', 20, 100, 120, 'tiny', 'mosquito zapper, insect zapper', { cont: true });
x('Pond pump', 'yard', 30, 400, 120, 'shared', 'water garden pump, waterfall pump', { t: 150, cont: true });
x('Pond aerator', 'yard', 20, 150, 120, 'tiny', 'aerator, pond air pump', { cont: true });
x('Fountain pump', 'yard', 10, 100, 120, 'tiny', 'fountain, water feature, birdbath fountain', { cont: true });
x('Irrigation / transfer pump', 'yard', 500, 1500, 120, 'own20', 'utility pump, transfer pump, sprinkler pump, irrigation pump', { t: 1000, s: [2000, 3500] });
x('Driveway gate opener', 'yard', 20, 300, 120, 'shared', 'gate opener, automatic gate, mighty mule');
x('Heated gutter / roof de-icing cable', 'yard', 100, 1000, 120, 'Roughly 5-8W per foot. Use a GFCI outlet; runs for hours.', 'roof heat cable, gutter heater, ice dam cable, heat tape roof', { t: 500, cont: true });
x('Camper / RV plugged in', 'yard', 500, 3600, 120, 'A 30A RV outlet (TT-30) needs its own 30A breaker. A regular 15-20A outlet only runs light loads (no AC + microwave at once).', 'rv, camper, travel trailer, motorhome, fifth wheel, 5th wheel, shore power, rv hookup', { t: 1500 });

// ---------------------------------------------------------------- farm & animals
x('Well pump (submersible, 240V)', 'farm', 750, 2000, 240, '240V dedicated circuit, usually 15-30A (check the pump / control box label).', 'well pump, submersible pump, deep well pump, water well, well', { t: 1200, s: [2500, 5000] });
x('Shallow well / jet pump', 'farm', 600, 1500, 120, 'Many are dual-voltage; often wired 240V on their own circuit. On 120V it needs its own 20A.', 'jet pump, shallow well pump, well pump 120', { t: 1000, s: [2000, 4000] });
x('Stock tank heater / deicer', 'farm', 1000, 1500, 120, 'Runs for hours outside: GFCI outlet, and keep it alone on a 20A circuit.', 'tank heater, deicer, de-icer, water trough heater, stock tank deicer, floating deicer, livestock tank heater, trough heater', { t: 1500, cont: true });
x('Heated water bucket', 'farm', 100, 250, 120, 'shared', 'heated bucket, heated horse bucket, heated goat bucket', { t: 150, cont: true });
x('Heated poultry waterer / base', 'farm', 60, 150, 120, 'shared', 'heated chicken waterer, waterer heater, chicken water heater, heated base', { t: 125, cont: true });
x('Automatic heated livestock waterer', 'farm', 150, 500, 120, 'Usually hardwired or on its own GFCI circuit.', 'ritchie waterer, auto waterer, frost free waterer, cattle waterer', { t: 300, cont: true });
x('Chicken coop heat lamp (250W)', 'farm', 125, 250, 120, 'Fire risk: clamp it securely, away from bedding. One 250W lamp is about 2A.', 'heat lamp, red heat lamp, coop heater, infrared bulb, brooder lamp, brooder bulb, chicken lamp', { t: 250, cont: true });
x('Chick brooder heating plate', 'farm', 20, 60, 120, 'tiny', 'brooder plate, ecoglow, brinsea, chick heater, brooder heater, chick brooder', { t: 40, cont: true });
x('Coop panel heater', 'farm', 100, 200, 120, 'shared', 'flat panel heater, cozy coop heater, sweeter heater, coop heater safe', { t: 200, cont: true });
x('Egg incubator', 'farm', 15, 150, 120, 'tiny', 'incubator, egg hatcher, nurture right', { t: 60, cont: true });
x('Coop light (LED)', 'farm', 5, 15, 120, 'tiny', 'chicken light, hen house light');
x('Automatic coop door', 'farm', 1, 5, 120, 'tiny', 'chicken door, run chicken door');
x('Electric fence charger (plug-in)', 'farm', 2, 20, 120, 'Tiny draw, runs all day. Use a GFCI outlet if outdoors.', 'fence charger, fence energizer, hot wire, electric fence, parmak, zareba, patriot energizer', { t: 10, cont: true });
x('Livestock clippers / shears', 'farm', 50, 350, 120, 'shared', 'goat clippers, sheep shears, animal clippers, horse clippers');
x('Milking machine (small)', 'farm', 300, 1100, 120, 'mid', 'goat milker, cow milker, milker, vacuum pump milker', { t: 600, s: [1200, 2500] });
x('Barn / livestock fan (36" and up)', 'farm', 250, 700, 120, 'mid', 'barn fan, big fan, drum fan, shop fan', { t: 450, cont: true });
x('Livestock heat mat', 'farm', 60, 200, 120, 'shared', 'piglet mat, kid heat mat, goat heat mat, heat mat livestock', { t: 100, cont: true });
x('Heated hose', 'farm', 60, 250, 120, 'shared', 'heated water hose, farm hose heated', { t: 150, cont: true });
x('Pipe heat tape', 'farm', 30, 400, 120, 'Roughly 5-8W per foot. GFCI outlet; runs for hours.', 'heat tape, pipe heater, heat cable, freeze protection, frost king', { t: 100, cont: true });
x('Well house / pump house heater', 'farm', 100, 1500, 120, 'own15', 'pump house heater, well house heater, frost guard', { t: 500, cont: true });
x('Chicken plucker', 'farm', 500, 1200, 120, 'own20', 'plucker, poultry plucker, yardbird', { t: 800, s: [1500, 3000] });
x('Greenhouse heater', 'farm', 1000, 1500, 120, 'heat', 'greenhouse heater, bio green, plant heater', { t: 1500, cont: true });
x('Greenhouse fan / vent', 'farm', 50, 300, 120, 'shared', 'greenhouse exhaust fan, shutter fan', { cont: true });
x('Seedling heat mat', 'farm', 10, 50, 120, 'tiny', 'seed mat, germination mat, propagation mat', { cont: true });

// ---------------------------------------------------------------- pool, spa & sauna
x('Hot tub (240V)', 'pool', 4000, 7500, 240, '240V dedicated 40-60A circuit with a GFCI disconnect near the tub.', 'hot tub, spa, jacuzzi, hottub', { t: 6000, cont: true, hw: true });
x('Hot tub ("plug & play" 120V)', 'pool', 1200, 1800, 120, 'Needs its own 15-20A GFCI circuit. Go by the label.', 'plug and play spa, 110 hot tub, 120v hot tub', { t: 1500, cont: true });
x('Inflatable hot tub', 'pool', 1300, 1800, 120, 'own20', 'intex spa, coleman saluspa, blow up hot tub, lay z spa', { t: 1500, cont: true });
x('Pool pump (single-speed)', 'pool', 1000, 2200, 240, v240('15-20'), 'pool pump, pool filter pump, pentair, hayward', { t: 1500, s: [3000, 5000], cont: true, hw: true });
x('Pool pump (variable-speed)', 'pool', 100, 1700, 240, v240('15-20'), 'variable speed pump, vs pump, pool pump', { t: 500, cont: true, hw: true });
x('Above-ground pool pump', 'pool', 300, 1100, 120, 'Needs a GFCI outlet; best on its own 15-20A circuit.', 'pool filter, intex pump, sand filter, above ground pump', { t: 700, s: [1200, 2500], cont: true });
x('Pool heater (heat pump)', 'pool', 3000, 6000, 240, v240('30-50'), 'pool heater, pool heat pump', { t: 5000, cont: true, hw: true });
x('Salt chlorinator', 'pool', 50, 300, 120, 'shared', 'salt system, salt cell, swg', { t: 150, cont: true });
x('Robotic pool cleaner', 'pool', 150, 200, 120, 'shared', 'pool robot, dolphin, pool vacuum');
x('Pool light', 'pool', 20, 500, 120, 'Hardwired through a GFCI.', 'pool lamp, spa light', { t: 300, hw: true });
x('Infrared sauna (1-2 person, 120V)', 'pool', 1500, 1650, 120, 'Needs its own 20A circuit.', 'sauna, infrared sauna, sauna blanket', { t: 1600 });
x('Sauna heater (240V)', 'pool', 4500, 9000, 240, v240('30-50'), 'sauna heater, traditional sauna, barrel sauna', { t: 6000, hw: true });

// ---------------------------------------------------------------- water, plumbing & whole-house
x('Electric water heater (tank)', 'water', 3000, 5500, 240, v240('30'), 'water heater, hot water heater, hot water tank, rheem, ao smith, 40 gallon, 50 gallon', { t: 4500, cont: true, hw: true });
x('Heat pump water heater', 'water', 300, 4500, 240, '240V dedicated 30A for most; some newer ones plug into a 120V outlet.', 'hybrid water heater, heat pump water heater', { t: 600, hw: true });
x('Tankless water heater (electric, whole-house)', 'water', 13000, 36000, 240, 'Needs 2-4 dedicated 240V circuits (40-60A each), and often a bigger electrical service.', 'tankless, on demand water heater, stiebel eltron, ecosmart', { t: 18000, hw: true });
x('Gas water heater (power vent)', 'water', 50, 300, 120, 'shared', 'power vent water heater, gas water heater', { t: 150 });
x('Gas tankless water heater', 'water', 50, 200, 120, 'shared', 'navien, rinnai, gas tankless', { t: 100 });
x('Hot water recirculation pump', 'water', 25, 100, 120, 'tiny', 'recirc pump, grundfos, hot water pump', { cont: true });
x('Boiler circulator pump', 'water', 40, 120, 120, 'Usually hardwired with the boiler.', 'circulator, boiler pump, taco pump', { cont: true, hw: true });
x('Sump pump', 'water', 400, 1000, 120, 'Best on its own circuit so a trip elsewhere does not leave it dead.', 'sump, basement pump, sump pump 1/3 hp, sump pump 1/2 hp', { t: 800, s: [1300, 2500] });
x('Sewage ejector / grinder pump', 'water', 600, 1500, 120, 'Usually its own 15-20A circuit (some are 240V).', 'ejector pump, grinder pump, sewage pump, lift station', { t: 1000, s: [2000, 3500] });
x('Septic aerator', 'water', 50, 120, 120, 'Runs 24/7. Usually on its own circuit with an alarm.', 'aerobic septic, septic air pump, septic aerator', { t: 80, cont: true });
x('Septic effluent / lift pump', 'water', 600, 1200, 120, 'own15', 'effluent pump, septic pump, septic sprinkler pump', { t: 900, s: [1500, 3000] });
x('Water softener', 'water', 5, 50, 120, 'tiny', 'softener, culligan, water conditioner', { cont: true });
x('UV water purifier', 'water', 30, 60, 120, 'tiny', 'uv light water, uv sterilizer', { cont: true });
x('Reverse osmosis booster pump', 'water', 20, 50, 120, 'tiny', 'ro pump, reverse osmosis', { cont: true });
x('Smoke / CO detectors (hardwired)', 'water', 1, 3, 120, 'Hardwired on a lighting or bedroom circuit. Tiny draw.', 'smoke detector, smoke alarm, carbon monoxide detector, co detector', { hw: true });
x('Video doorbell / chime', 'water', 5, 10, 120, 'Runs off the doorbell transformer. Tiny draw.', 'ring doorbell, doorbell, nest doorbell, chime', { hw: true });
x('Security camera (plug-in)', 'water', 3, 10, 120, 'tiny', 'camera, wyze cam, ring camera, blink, security cam, nvr');
x('Alarm system panel', 'water', 10, 30, 120, 'tiny', 'alarm panel, adt, security system', { cont: true });
x('Smart home hub', 'water', 2, 5, 120, 'tiny', 'smartthings, hubitat, hue bridge, zigbee hub');
x('Stair lift', 'water', 50, 300, 120, 'shared', 'stairlift, chair lift');

// ---------------------------------------------------------------- medical
x('CPAP / BiPAP', 'medical', 30, 110, 120, "Small draw, but don't share its circuit with a space heater that could trip it at night.", 'cpap, c-pap, bipap, sleep apnea machine, resmed, apap', { t: 60, cont: true });
x('Oxygen concentrator (home)', 'medical', 250, 600, 120, 'Best alone on its circuit. Makers say plug into the wall, not a power strip or extension cord.', 'oxygen machine, o2 concentrator, oxygen, inogen home', { t: 350, cont: true });
x('Portable oxygen concentrator charger', 'medical', 50, 150, 120, 'tiny', 'poc, portable oxygen, inogen one charger');
x('Nebulizer', 'medical', 20, 80, 120, 'tiny', 'breathing machine, neb machine');
x('Hospital bed', 'medical', 100, 300, 120, 'shared', 'medical bed, home hospital bed');
x('Alternating pressure mattress pump', 'medical', 10, 40, 120, 'tiny', 'air mattress pump, pressure mattress', { cont: true });
x('Home dialysis machine', 'medical', 500, 1800, 120, 'Makers usually require a dedicated 20A circuit.', 'dialysis, hemodialysis, nxstage', { t: 1500, cont: true });
x('Breast pump', 'medical', 10, 30, 120, 'tiny', 'pump, spectra, medela');
x('Medication fridge', 'medical', 50, 100, 120, 'shared', 'insulin fridge, medical fridge', { s: [300, 600] });

// ---------------------------------------------------------------- kids & baby
x('Bottle warmer', 'kids', 200, 500, 120, 'shared', 'baby bottle warmer');
x('Bottle sterilizer / dryer', 'kids', 400, 650, 120, 'shared', 'sterilizer, baby brezza, bottle dryer');
x('Formula maker', 'kids', 400, 1400, 120, 'mid', 'baby brezza formula pro, formula machine', { t: 800 });
x('Baby monitor', 'kids', 3, 10, 120, 'tiny', 'nanit, owlet, baby cam', { cont: true });
x('Baby swing / bouncer (plug-in)', 'kids', 5, 15, 120, 'tiny', 'swing, bouncer, mamaroo');
x('Wipe warmer', 'kids', 5, 15, 120, 'tiny', 'wipes warmer', { cont: true });
x('Bounce house blower', 'kids', 700, 1200, 120, 'own20', 'bouncy house, inflatable blower, jumper blower', { t: 1000, s: [1500, 2500], cont: true });
x('Popcorn machine (theater style)', 'kids', 800, 1500, 120, 'kitchen', 'popcorn cart, kettle popcorn', { t: 1000 });
x('Cotton candy machine', 'kids', 500, 1000, 120, 'mid', 'cotton candy maker', { t: 1000 });
x('Snow cone / shaved ice maker', 'kids', 100, 500, 120, 'shared', 'snow cone machine, shaved ice');

// ---------------------------------------------------------------- pets & aquariums
x('Aquarium heater', 'pets', 50, 300, 120, 'shared', 'fish tank heater, tank heater aquarium', { t: 150, cont: true });
x('Aquarium filter / pump', 'pets', 5, 40, 120, 'tiny', 'fish tank filter, aquarium pump, air pump, bubbler', { cont: true });
x('Aquarium light', 'pets', 10, 60, 120, 'tiny', 'fish tank light, reef light');
x('Reptile heat lamp', 'pets', 50, 150, 120, 'shared', 'basking bulb, heat bulb, reptile lamp, ceramic heat emitter, che', { t: 100, cont: true });
x('Reptile UVB light', 'pets', 15, 40, 120, 'tiny', 'uvb, reptile light, terrarium light');
x('Reptile heat mat', 'pets', 5, 25, 120, 'tiny', 'under tank heater, uth, heat mat', { cont: true });
x('Heated pet bed / mat', 'pets', 5, 60, 120, 'tiny', 'heated dog bed, heated cat bed, pet heating pad', { cont: true });
x('Heated pet water bowl', 'pets', 25, 100, 120, 'tiny', 'heated dog bowl, heated cat bowl, heated bowl', { cont: true });
x('Pet water fountain', 'pets', 2, 5, 120, 'tiny', 'cat fountain, drinkwell', { cont: true });
x('Automatic litter box', 'pets', 15, 60, 120, 'tiny', 'litter robot, litter box', { cont: true });
x('Automatic pet feeder', 'pets', 2, 10, 120, 'tiny', 'pet feeder, dog feeder, cat feeder');
x('Invisible dog fence transmitter', 'pets', 3, 10, 120, 'tiny', 'dog fence, petsafe, invisible fence', { cont: true });
x('Dog dryer / grooming blower', 'pets', 1000, 1800, 120, 'own20', 'dog blower, pet dryer, grooming dryer, force dryer', { t: 1500 });

// ---------------------------------------------------------------- hobby, craft & fitness
x('Sewing machine', 'hobby', 50, 150, 120, 'tiny', 'serger, embroidery machine, singer, brother sewing');
x('Cricut / vinyl cutter', 'hobby', 30, 60, 120, 'tiny', 'cricut, silhouette, vinyl cutter, cutting machine');
x('Heat press (t-shirt)', 'hobby', 1000, 1800, 120, 'own20', 'tshirt press, shirt press, sublimation press, heat transfer press', { t: 1500 });
x('Mug / hat press', 'hobby', 300, 900, 120, 'mid', 'mug press, hat press, tumbler press');
x('Laser cutter / engraver', 'hobby', 50, 1000, 120, 'mid', 'laser engraver, glowforge, xtool, co2 laser', { t: 300 });
x('Pottery kiln (small 120V)', 'hobby', 1500, 1800, 120, 'Needs its own 20A circuit.', 'kiln, test kiln, jewelry kiln', { t: 1800 });
x('Pottery kiln (240V)', 'hobby', 3000, 11000, 240, v240('30-60'), 'kiln, ceramic kiln, skutt, paragon', { t: 7000, hw: true });
x('Pottery wheel', 'hobby', 200, 600, 120, 'shared', 'potters wheel, throwing wheel');
x('Wax melter / candle warmer', 'hobby', 20, 1500, 120, 'Candle warmers are tiny; wax melting pots can be 1000W+.', 'candle warmer, wax warmer, scentsy, wax melter', { t: 30 });
x('Treadmill', 'hobby', 600, 1500, 120, 'Most makers say a dedicated 15-20A circuit.', 'treadmil, running machine, nordictrack, proform', { t: 1000, s: [2000, 3000] });
x('Walking pad / under-desk treadmill', 'hobby', 300, 1000, 120, 'mid', 'walking pad, under desk treadmill', { t: 500, s: [1000, 1800] });
x('Exercise bike (Peloton etc.)', 'hobby', 50, 100, 120, 'tiny', 'peloton, spin bike, stationary bike');
x('Elliptical / rower', 'hobby', 20, 60, 120, 'tiny', 'elliptical, rowing machine, hydrow, rower');
x('Infrared sauna blanket', 'hobby', 200, 500, 120, 'shared', 'sauna blanket, sauna bag');
x('Ham radio station', 'hobby', 50, 500, 120, 'shared', 'ham radio, amateur radio, cb radio base', { t: 150 });
x('Model train / slot car set', 'hobby', 10, 100, 120, 'tiny', 'model train, train set, slot cars');
x('Telescope mount', 'hobby', 5, 30, 120, 'tiny', 'telescope');
x('Home brewing (electric)', 'hobby', 1500, 5500, 240, 'Small kettles are 120V/1500W; big brew systems need 240V 30A.', 'brewing, brew kettle, grainfather, homebrew, anvil foundry', { t: 1500 });

// ---------------------------------------------------------------- build the exported catalog
function slugify(s) {
  return s.toLowerCase().replace(/["'"]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const seen = new Set();
export const CATALOG = list.map((r) => {
  let id = slugify(r.name);
  while (seen.has(id)) id += '-2';
  seen.add(id);
  const t = r.t != null ? r.t : nice((r.lo + r.hi) / 2);
  return {
    id,
    name: r.name,
    cat: r.cat,
    watts: [r.lo, r.hi],
    typical: t,
    volts: r.v,
    surge: r.s || null,
    note: NOTES[r.note] || r.note,
    cont: !!r.cont,
    hardwired: !!r.hw,
    aka: r.aka ? r.aka.split(',').map((a) => a.trim()).filter(Boolean) : [],
  };
});

export const CATALOG_NOTE = 'Typical estimates only. Real draw varies by model, so check the nameplate label on the device (or its power brick) when you can.';

export function catById(id) {
  return CATALOG.find((c) => c.id === id) || null;
}
export function categoryOf(id) {
  return CATEGORIES.find((c) => c.id === id) || { id, label: id, icon: '🔌' };
}

// "~1,200-1,500W"
export function wattsRange(c) {
  const f = (n) => Number(n).toLocaleString('en-US');
  return c.watts[0] === c.watts[1] ? `~${f(c.watts[0])}W` : `~${f(c.watts[0])}-${f(c.watts[1])}W`;
}
function ampStr(a) {
  if (a < 20) return String(Math.round(a * 10) / 10);
  return String(Math.round(a));
}
// "~10-12.5A at 120V" ("under 1A at 120V" for tiny things)
export function ampsRange(c) {
  const a0 = c.watts[0] / c.volts;
  const a1 = c.watts[1] / c.volts;
  if (a1 < 1) return `under 1A at ${c.volts}V`;
  const hi = ampStr(a1);
  if (a0 < 1) return `up to ~${hi}A at ${c.volts}V`;
  const lo = ampStr(a0);
  return `~${lo === hi ? lo : lo + '-' + hi}A at ${c.volts}V`;
}
export function typicalAmps(c) {
  return c.typical / c.volts;
}
export function surgeText(c) {
  if (!c.surge) return '';
  const f = (n) => Number(n).toLocaleString('en-US');
  return `~${f(c.surge[0])}-${f(c.surge[1])}W for a second or two at startup`;
}
// Short tag for list rows.
export function circuitTag(c) {
  if (c.volts === 240) return '240V';
  const n = c.note.toLowerCase();
  if (/own 20a|dedicated 20a|own 15-20a|its own|alone|dedicated|only big thing/.test(n) && c.watts[1] >= 300) return 'Own circuit';
  if (c.watts[1] >= 1000) return 'Big draw';
  if (c.watts[1] <= 60) return 'Tiny';
  return '';
}
