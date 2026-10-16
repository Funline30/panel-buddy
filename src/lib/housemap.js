// House Map: rooms -> the plugs / lights / devices in each -> which breaker feeds them.
// Built only from the existing data (device.room + device.breakerId + device.loads,
// breaker.rooms + breaker.loads). No new fields.
import { slotLabel } from './panel.js';
import { readings } from './load.js';

export const NO_ROOM = 'No room set';

// rooms people usually walk through first; anything else follows alphabetically
const ORDER = ['Living room', 'Kitchen', 'Dining room', 'Master bedroom', 'Master bath', 'Master closet'];

export function roomSort(a, b) {
  if (a === NO_ROOM) return 1;
  if (b === NO_ROOM) return -1;
  const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.localeCompare(b);
}

const ampsOf = (b) => (b ? (b.amps === 'other' ? b.ampsOther : b.amps) : '');

// "Brkr 26/28 · 15A"
export function breakerTagText(b, panel) {
  if (!b) return 'No breaker set';
  const a = ampsOf(b);
  return `Brkr ${slotLabel(b, panel || 'two')}${a ? ` · ${a}A` : ''}`;
}

// data = { breakers, devices, panels } (already limited to one home)
// -> { rooms: [{ name, outlets: [device], circuit: [{ breakerId, loads }], breakerIds,
//                wholeRoom: breakerId | '' }],
//      breakers: { [id]: { breaker, panel, tag, level, pct, rooms: [names], outletIds } } }
export function buildHouseMap(data, { t = Date.now() } = {}) {
  const breakers = data.breakers || [];
  const devices = data.devices || [];
  const panels = data.panels || [];
  const bById = new Map(breakers.map((b) => [b.id, b]));
  const rooms = new Map();
  const room = (name) => {
    const n = (name || '').trim() || NO_ROOM;
    if (!rooms.has(n)) rooms.set(n, { name: n, outlets: [], circuit: [], ids: new Set(), listedOn: new Set() });
    return rooms.get(n);
  };
  for (const d of devices) {
    const r = room(d.room);
    r.outlets.push(d);
    if (d.breakerId && bById.has(d.breakerId)) r.ids.add(d.breakerId);
  }
  for (const b of breakers) {
    for (const n of b.rooms || []) {
      const r = room(n);
      r.ids.add(b.id);
      r.listedOn.add(b.id);
    }
    // things listed on the breaker itself (lights, hardwired, AC...) go in its first room,
    // or the room of its first outlet when the breaker has no rooms
    if ((b.loads || []).length) {
      const dev = devices.find((d) => d.breakerId === b.id);
      const first = (b.rooms || [])[0] || (dev ? dev.room || NO_ROOM : '');
      if (first) {
        const r = room(first);
        r.circuit.push({ breakerId: b.id, loads: b.loads });
        r.ids.add(b.id);
      }
    }
  }
  const info = {};
  for (const b of breakers) {
    const panel = panels.find((p) => p.id === b.panelId);
    const s = readings(b, devices, { t });
    info[b.id] = {
      breaker: b,
      panel,
      tag: breakerTagText(b, panel),
      level: s.level,
      pct: s.pct,
      peakPct: s.allPct,
      rooms: [],
      outletIds: devices.filter((d) => d.breakerId === b.id).map((d) => d.id),
    };
  }
  const sorted = [...rooms.values()]
    .sort((a, b) => roomSort(a.name, b.name))
    .map((r) => {
      const breakerIds = [...r.ids];
      for (const id of breakerIds) if (info[id] && !info[id].rooms.includes(r.name)) info[id].rooms.push(r.name);
      // "Whole room on Brkr 13": one breaker feeds everything known in the room
      const wholeRoom = breakerIds.length === 1 && r.outlets.every((d) => d.breakerId === breakerIds[0]) ? breakerIds[0] : '';
      return { name: r.name, outlets: r.outlets, circuit: r.circuit, breakerIds, wholeRoom };
    });
  // a room fed entirely by a breaker that already showed up (e.g. a bedroom on the living
  // room's breaker) goes right after that room, unless it has its own usual spot
  const list = [];
  for (const r of sorted) {
    let at = -1;
    if (r.wholeRoom && !ORDER.includes(r.name) && r.name !== NO_ROOM) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].breakerIds.includes(r.wholeRoom)) { at = i; break; }
    }
    if (at === -1) list.push(r);
    else list.splice(at + 1, 0, r);
  }
  // breaker rooms in map order
  for (const i of Object.values(info)) i.rooms.sort((a, b) => list.findIndex((r) => r.name === a) - list.findIndex((r) => r.name === b));
  return { rooms: list, breakers: info };
}

// Every outlet (device id) a breaker feeds, across all rooms, and the rooms they are in.
export function outletsOnBreaker(map, breakerId) {
  const out = [];
  for (const r of map.rooms) for (const d of r.outlets) if (d.breakerId === breakerId) out.push({ room: r.name, device: d });
  return out;
}

// The breaker an outlet is on (or null).
export function breakerOfOutlet(map, deviceId) {
  for (const r of map.rooms) {
    const d = r.outlets.find((x) => x.id === deviceId);
    if (d) return (d.breakerId && map.breakers[d.breakerId]) || null;
  }
  return null;
}
