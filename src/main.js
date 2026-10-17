import './styles.css';
import QRCode from 'qrcode';
import { GET_URL, detectPlatform, getTarget, storeRows, stickerQrTarget, cleanInstalledBy, installedByText, installedByDefault, STICKER_SIZES, stickerSize, stickerCopy, PRINT_METHODS, TAPE_SIZES, tapeSize, printChoice, WEATHERPROOF_SHEETS, LABEL_MAKERS, TAPE_TIP } from './lib/sticker.js';
import './sticker.css';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { createLocalStore } from './store/local.js';
import { createScopedStore } from './store/scoped.js';
import { codeStatus, guardNext, EXPIRY_CHOICES, expiryFor, makeTempCode, makeClaimCode, prettyClaimCode, customCodeProblem, describeChange, undoable, undoOps, toMillis, claimStatus } from './lib/access.js';
import './access.css';
import {
  AMP_OPTIONS, POLE_OPTIONS, BREAKER_KINDS, DEVICE_TYPES, GFCI_OPTIONS, AFCI_OPTIONS, STATUS_OPTIONS,
  PANEL_TYPES, SPACE_OPTIONS, MAIN_AMP_OPTIONS, RV_MAIN_AMP_OPTIONS, SHORE_POWER_OPTIONS, LEG_OPTIONS, POWER_SOURCE_OPTIONS,
  FUSE_AMP_OPTIONS, FUSE_USES, HOME_TYPES, LAYOUT_OPTIONS, NUMBERING_OPTIONS, BTYPE_OPTIONS, HOME_ROOMS, RV_ROOMS, labelOf, deviceIcon,
  BOX_OPTIONS, REPLACE_OPTIONS, stylesFor, styleOf, qtyOf,
} from './lib/options.js';
import { shoppingList, shoppingCsv, lineText } from './lib/shopping.js';
import { layoutOf, panelSpaces, slotsFor, slotLabel, numberingOf, overlaps, occupancy, halfRows, positionLabel, positionSlot, groupPlan, directoryRows, breakerType, sizeOf, keysFor, planFor, snapSlot, coversText, findClash, clashText, stickerText, isTwoPole } from './lib/panel.js';
import { seedPro } from './lib/seed.js';
import { SERVICE_TYPES, serviceOf, isThreePhase, isCommercial, mainAmpChoices, mainAmpsNum, polesOf, breakerPhases, isAutoPhase, phaseText, phaseChoices, breakerVolts, phaseTotals, FEEDER_SIZES, feedParent, wouldLoop, feedRows, feedText, feederText, GEN_HOOKUPS, GEN_INLETS, GEN_SIZES, YES_NO, GROUND_RODS, hasGenerator, generatorText, panelExtrasText, groundingText, CONDUIT_OPTIONS, cleanRun, runText, DEVICE_GROUPS, defaultsHint, deviceDefaults, TOUR_KEY, TOUR_STEPS, shouldShowTour } from './lib/pro.js';
import './pro.css';
import { LOAD_PRESETS, PRESET_NOTE } from './lib/presets.js';
import { loadSummary, levelText, fmtAmps, shoreSummary, deviceWatts, voltsFor, breakerAmps, isOn, readings, loadReading, deviceReading, projectLoad, NOW_HOURS } from './lib/load.js';
import { USE_OPTIONS, habitOf, useLabel, HABIT_NOTE, guessHabit } from './lib/habits.js';
import { loadRef, parseRef, loadAt, toggleLoad, setAllOn, moveLoad, setPortable, portablesOf, loadWatts, PORTABLE_SUGGESTIONS, setNow, clearNow, nowState, updateLoad } from './lib/onoff.js';
import { THEME_OPTIONS, getThemePref, setThemePref, applyTheme } from './lib/theme.js';
import { parseBreakerQuery } from './lib/search.js';
import { CATALOG, CATEGORIES, CATALOG_NOTE, catById, categoryOf, wattsRange, ampsRange, surgeText, circuitTag } from './lib/catalog.js';
import { searchHome, searchCatalog, lookupUrl, projectedPct, wattsFromAmps } from './lib/devicesearch.js';
import { uid, esc, ampsText, sortBreakers, download } from './lib/util.js';
import { breakersCsv, devicesCsv, fusesCsv } from './lib/csv.js';
import { compressPhoto } from './lib/photo.js';
import { WIRE_SIZES, WIRE_TYPES, WIRE_CONDUCTORS, WIRE_COLORS, JACKET_SIZE, WIRE_GUIDANCE, cleanWire, wireFromForm, wireText, wireTag, wireShort, effectiveWire, wireChecks, sizeText, typeText, condText, colorText, cableText } from './lib/wire.js';
import { buildHouseMap, outletsOnBreaker, NO_ROOM, roomSort } from './lib/housemap.js';
import { planBulk, BULK_TYPES, partsOf } from './lib/bulk.js';
import { QUICK_AMPS, QUICK_WIRES, quickWire, FEEDS_SUGGESTIONS, nextFreeSlot, quickBreaker, spacesUsed, slotName } from './lib/quick.js';
import { planOf, planToSave, clampRoom, moveRoom, resizeRoom, resizePlan, roomAt, snapPin, inBounds, pinKind, PIN_KINDS, kindFields, splitPlaced, pinsByBreaker, roomsOnBreaker, newRoomSpot, TEMPLATES, applyTemplate, floorOfPos, swapRooms, movePins, resizeCorner, rotateRoom, overlapping, shapeOf, bboxOf, cleanPts, validShape, moveCorner, addCorner, removeCorner, moveEdge, presetShape, roomsOutside, fitRoomsToShape, normalizeShape, polyArea, outlineFromRooms, withAutoOutline, growArea, clearPlan, planHasDrawing, fmtFtIn, ftInParts, setRoomSize, snapToRooms, rectPts, pointInPoly } from './lib/floorplan.js';
import { planOpenSegs, openAt, openWallAt, closeWall, setSideOpen, sideState, moveOpenEnd, setOpenSpan, openWallsAfterRoomMove, openWallsOfRooms, doorsOnOpen, segOnOpen, sharedSpan, SIDES as WALL_SIDES, SIDE_WORDS } from './lib/walls.js';
import { planDoorSegs, doorSvg, placeDoor, doorSpot, slideDoor, doorSeg, doorsAfterRoomMove, doorsOfRooms, clampDoor, DOOR_KINDS, DOOR_WIDTHS, isSideways } from './lib/doors.js';

const app = document.getElementById('app');
const MODE_KEY = 'panelbuddy:mode';
const HOME_KEY = 'panelbuddy:home';
let store;
let pendingRoute = null;

// Printed / shared directory rows. Each circuit number (or tandem half) gets its own entry.
function dirRowsHtml(panel, breakers, { wire = false } = {}) {
  const one = layoutOf(panel) === 'one';
  const half = numberingOf(panel) === 'half';
  const amps = (b) => esc(ampsText(b));
  const rm0 = (b) => ((b.rooms || []).length && !(b.label || '').toLowerCase().includes(String(b.rooms[0]).toLowerCase()) ? ` <span class="rm">(${esc(b.rooms.join(', '))})</span>` : '');
  const rm = (b) => rm0(b) + (wire && wireTag(b.wire) ? ` <span class="wt">${esc(wireTag(b.wire))}</span>` : '');
  const cell = (c) => {
    if (!c.items.length) return `<td class="n">${esc(c.num)}</td><td class="a"></td><td class="l"></td>`;
    if (c.items.length === 1) {
      const e = c.items[0];
      if (e.cont) return `<td class="n">${esc(c.num)}</td><td class="a">″</td><td class="l cont">(${esc(e.label)}) ${esc(e.b.label || '')}</td>`;
      return `<td class="n">${esc(!half && sizeOf(e.b) === 'half' ? e.label.split('/')[0] : c.num)}</td><td class="a">${amps(e.b)}</td><td class="l">${esc(e.b.label || '')}${rm(e.b)}</td>`;
    }
    return `<td class="n">${c.items.map((e) => esc(e.label.split('/')[0])).join('<br>')}</td><td class="a">${c.items.map((e) => (e.cont ? '″' : amps(e.b))).join('<br>')}</td><td class="l">${c.items.map((e) => `${e.cont ? '<span class="cont">' : ''}${esc(e.b.label || '')}${e.cont ? '</span>' : rm(e.b)}`).join('<br>')}</td>`;
  };
  return directoryRows(panel, breakers).map((r, i) => `<tr class="${half && i % 2 ? 'sp-end' : ''}">${r.cells.map(cell).join('')}</tr>`).join('');
}

// ---------------------------------------------------------------- startup
async function start() {
  applyTheme();
  guestEnded = sessionStorage.getItem('ampmap:guestEnded') || '';
  sessionStorage.removeItem('ampmap:guestEnded');
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason && e.reason.code === 'ampmap/not-allowed') { e.preventDefault(); toast(e.reason.message); }
  });
  const gi = guestInfo();
  if (gi) {
    app.innerHTML = `<div class="center-msg">Opening the panel...</div>`;
    try {
      store = await startGuest(gi);
      store.onChange(() => {
        if (parseRoute().parts[0] === 'edit' && document.getElementById('editForm')) return;
        if (parseRoute().parts[2] === 'quick' && document.getElementById('quickForm') && quickUI.typing()) return;
        render();
      });
      await store.init();
      bindLoadActions();
      window.addEventListener('hashchange', render);
      render();
      return;
    } catch (e) {
      console.warn('guest session ended', e);
      sessionStorage.removeItem(GUEST_KEY);
      guestEnded = gi.mode === 'grant' ? "You don't have edit access to that home anymore." : 'Your edit access ended: the homeowner changed or turned off the code.';
      store = null;
      if (gi.token) location.hash = `#/share/${gi.token}`;
    }
  }
  const wantDemo = localStorage.getItem(MODE_KEY) === 'demo' || /[?&]demo=1/.test(location.search);
  if (isFirebaseConfigured() && !wantDemo) {
    app.innerHTML = `<div class="center-msg">Loading AmpMap...</div>`;
    const { createFirebaseStore } = await import('./store/firebase.js');
    store = createFirebaseStore(firebaseConfig);
    store.onAuth(() => render());
  } else {
    store = createLocalStore();
  }
  store.onChange(() => {
    // don't wipe a form the user is typing in when data syncs in
    if (parseRoute().parts[0] === 'edit' && document.getElementById('editForm')) return;
    // Quick panel: keep what's being typed for the next breaker (it re-renders itself after a save)
    if (parseRoute().parts[2] === 'quick' && document.getElementById('quickForm') && quickUI.typing()) return;
    render();
  });
  await store.init();
  bindLoadActions();
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator && import.meta.env.PROD && !location.pathname.includes('/previews/')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ---------------------------------------------------------------- helpers
const D = () => {
  const d = store.data || {};
  return { homes: d.homes || [], panels: d.panels || [], breakers: d.breakers || [], devices: d.devices || [], customers: d.customers || [] };
};
const byId = (col, id) => D()[col].find((x) => x.id === id);
const inHome = (col, homeId) => D()[col].filter((x) => x.homeId === homeId);
const isPro = () => (store.settings || {}).accountType === 'pro';
const panelOf = (b) => b && byId('panels', b.panelId);
const slotsOf = (b) => slotsFor(b, panelOf(b) || 'two');
const slotText = (b) => slotLabel(b, panelOf(b) || 'two');
const breakerSlots = slotsOf;
// circuit load = items listed on the breaker + items listed on each of its outlets
// Idle / Typical / Peak (see load.js readings): watts/pct/level = Typical (main number)
// three-phase panels: 120/208, 277/480; a 3-pole load = V x 1.732. Single-phase = as before.
const voltsOf = (b) => { const p = panelOf(b); if (!p || (!isThreePhase(p) && polesOf(b) < 3)) return 0; return polesOf(b) === 3 ? breakerVolts(b, p) * Math.sqrt(3) : breakerVolts(b, p); };
const sumOf = (b) => readings(b, D().devices, { volts: voltsOf(b) });
// tap-to-pick chips (radio buttons that look like chips)
const chipsHtml = (name, list, value, { label = '', cls = '' } = {}) => `<div class="pick-chips ${cls}" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''}>${list.map((o) => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? (o === 'other' ? 'Other' : o) : o.label; return `<label class="pchip"><input type="radio" name="${name}" value="${esc(v)}" ${String(value ?? '') === String(v) ? 'checked' : ''}><span>${esc(l)}</span></label>`; }).join('')}</div>`;
const DEFAULT_SVC = '1ph240';
function bindChipClear(root) {
  // tapping a picked chip again clears it (these are all optional)
  root.querySelectorAll('.pick-chips input[type=radio]').forEach((r) => {
    r.dataset.was = r.checked ? '1' : '';
    r.addEventListener('click', () => {
      if (r.dataset.was === '1') { r.checked = false; r.dispatchEvent(new Event('change', { bubbles: true })); }
      root.querySelectorAll(`input[name="${r.name}"]`).forEach((x) => (x.dataset.was = x.checked ? '1' : ''));
    });
  });
}
const setOpt = (obj, key, val) => { if (val != null && val !== '') obj[key] = val; else delete obj[key]; };
const wattsText = (w) => `${Math.round(w).toLocaleString('en-US')}W`;
const homeLabel = (h) => {
  const c = h.customerId && byId('customers', h.customerId);
  return c ? `${c.name} · ${h.name}` : h.name;
};
const opt = (list, value) =>
  list
    .map((o) => {
      const v = typeof o === 'string' ? o : o.value;
      const l = typeof o === 'string' ? (o === 'other' ? 'Other...' : o) : o.label;
      return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`;
    })
    .join('');
// ---------------------------------------------------------------- wire (optional)
// breaker.wire = the circuit's wire; device.wire = a different wire at one outlet.
// Missing = not recorded. Checks are gentle, informational, never block saving.
function wireChecksHtml(w, amps, cls = '') {
  const list = wireChecks(w, amps);
  if (!list.length) return '';
  return `<div class="wire-check ${cls}" role="note">${list.map((c) => `<p>⚠️ ${esc(c.text)}</p>`).join('')}<p class="muted tiny">${esc(WIRE_GUIDANCE)}</p></div>`;
}
// The facts grid for one wire (size, type, conductors, jacket, note).
function wireFactsHtml(w) {
  w = cleanWire(w);
  if (!w) return '';
  const rows = [
    ['Cable', cableText(w)],
    ['Size', sizeText(w)],
    ['Type', typeText(w)],
    ['Conductors', condText(w)],
    ['Jacket', colorText(w)],
    ['Note', w.note || ''],
  ].filter(([, v]) => v);
  return `<dl class="facts wire-facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}
function wireFieldsHtml(w, { legend = 'Wire', hint = '', top = '', hide = false } = {}) {
  w = cleanWire(w) || {};
  const oth = (k) => (w[k] === 'other' ? '' : 'hidden');
  return `<fieldset class="wire-box" id="wireBox"><legend>${legend} <span class="opt-tag">optional</span></legend>
    ${hint ? `<p class="muted tiny wire-hint">${hint}</p>` : ''}${top}
    <div class="wire-fields" id="wireFields" ${hide ? 'hidden' : ''}>
    <div class="two">
      <label>Wire size<select name="wsize" data-other="wsizeOther">${opt(WIRE_SIZES, w.size || '')}</select></label>
      <label>Type<select name="wtype" data-other="wtypeOther">${opt(WIRE_TYPES, w.type || '')}</select></label>
    </div>
    <label class="other-field" ${oth('size')}>Wire size (type it)<input name="wsizeOther" value="${esc(w.sizeOther || '')}" placeholder="e.g. 4 AWG, 2/0 AL"></label>
    <label class="other-field" ${oth('type')}>Wire type (type it)<input name="wtypeOther" value="${esc(w.typeOther || '')}" placeholder="e.g. SER, knob &amp; tube"></label>
    <div class="two">
      <label>Conductors<select name="wcond" data-other="wcondOther">${opt(WIRE_CONDUCTORS, w.cond || '')}</select></label>
      <label>Jacket color<select name="wcolor">${opt(WIRE_COLORS, w.color || '')}</select></label>
    </div>
    <label class="other-field" ${oth('cond')}>Conductors (type it)<input name="wcondOther" value="${esc(w.condOther || '')}" placeholder="e.g. 4 wires + ground"></label>
    <label>Wire note<input name="wnote" value="${esc(w.note || '')}" placeholder="e.g. Shared neutral with #7, ran 2019"></label>
    <p class="wire-sum" id="wireSum" hidden></p>
    <div id="wireLive"></div>
    </div>
  </fieldset>`;
}
// Live summary + gentle check under the wire fields; ampsFn() = the breaker amps to check against.
function bindWireFields(f, ampsFn) {
  const sum = f.querySelector('#wireSum');
  const live = f.querySelector('#wireLive');
  if (!sum || !live) return () => {};
  const upd = () => {
    const w = wireFromForm(Object.fromEntries(new FormData(f).entries()));
    const txt = wireText(w);
    sum.hidden = !txt;
    sum.innerHTML = txt ? `<span class="wire-ic" aria-hidden="true">〰</span> ${esc(txt)}` : '';
    live.innerHTML = wireChecksHtml(w, ampsFn());
  };
  // Romex color code: picking a jacket color fills in a blank size (white 14, yellow 12, orange 10).
  f.elements.wcolor.addEventListener('change', () => {
    const s = JACKET_SIZE[f.elements.wcolor.value];
    if (s && !f.elements.wsize.value && ['', 'nm'].includes(f.elements.wtype.value)) {
      f.elements.wsize.value = s;
      toast(`${f.elements.wcolor.value[0].toUpperCase() + f.elements.wcolor.value.slice(1)} Romex is usually ${s} AWG - filled in the size`);
    }
  });
  f.querySelectorAll('[name=wsize],[name=wsizeOther],[name=wtype],[name=wtypeOther],[name=wcond],[name=wcondOther],[name=wcolor],[name=wnote]').forEach((el) => { el.addEventListener('change', upd); el.addEventListener('input', upd); });
  upd();
  return upd;
}

// Wire summary block: "12/2 w/ground" big + "12 AWG · NM-B (Romex) · yellow jacket".
function wireLineHtml(w) {
  w = cleanWire(w);
  if (!w) return '';
  const head = cableText(w) || sizeText(w) || typeText(w) || condText(w) || 'Wire noted';
  const rest = [cableText(w) ? sizeText(w) : '', head === typeText(w) ? '' : typeText(w), cableText(w) || head === condText(w) ? '' : condText(w), w.color ? colorText(w) + ' jacket' : ''].filter((x) => x && x !== head);
  return `<div class="wire-line"><span class="wire-chip" aria-hidden="true">${esc(wireTag(w) || '〰')}</span><span class="row-main"><b>${esc(head)}</b>${rest.length ? `<span class="muted">${esc(rest.join(' · '))}</span>` : ''}</span></div>${w.note ? `<p class="wire-note">${esc(w.note)}</p>` : ''}`;
}
function breakerWireCard(homeId, b, devices) {
  const bw = cleanWire(b.wire);
  const amps = breakerAmps(b);
  const own = devices.filter((d) => cleanWire(d.wire));
  const ownHtml = own.length ? `<div class="wire-own"><p class="muted tiny">${own.length === 1 ? '1 outlet has' : own.length + ' outlets have'} different wire:</p><ul class="list">${own.map((d) => `<li><a class="row" href="#/h/${homeId}/device/${d.id}"><span class="wire-chip sm" aria-hidden="true">${esc(wireTag(d.wire) || '〰')}</span><span class="row-main"><b>${esc(d.name || labelOf(DEVICE_TYPES, d.type))}</b><span class="muted">${esc(wireText(d.wire, { short: true }))}</span></span><span class="chev" aria-hidden="true">›</span></a>${wireChecksHtml(d.wire, amps, 'small')}</li>`).join('')}</ul></div>` : '';
  return `<div class="card wire-card" id="wire">
    <div class="card-head"><h3>Wire</h3><a class="btn small" href="#/edit/breakers/${b.id}?home=${homeId}&focus=wire">${bw ? 'Edit' : '+ Add wire'}</a></div>
    ${bw ? `${wireLineHtml(bw)}${wireChecksHtml(bw, amps)}${devices.length ? `<p class="muted tiny wire-inh-note">Outlets on this breaker use this wire unless one is set differently.</p>` : ''}` : `<p class="muted">Not recorded yet. Add the size and type (like 12/2 Romex) so whoever opens this wall next knows what's in it.</p>`}
    ${ownHtml}
  </div>`;
}

// Wire on an outlet row / chip: own wire in normal text, inherited (breaker's) in light grey.
function outletWireHtml(d, b, cls = '') {
  const e = effectiveWire(d, b || byId('breakers', d && d.breakerId));
  const t = wireShort(e.wire);
  if (!t) return '';
  const warn = wireChecks(e.wire, breakerAmps(b || byId('breakers', d.breakerId))).some((c) => c.kind === 'size');
  return `<span class="ow ${e.from === 'circuit' ? 'inh' : ''} ${cls}" title="${e.from === 'circuit' ? 'Wire from the breaker' : 'Wire set on this one'}"><span class="wire-ic" aria-hidden="true">〰</span>${esc(t)}${warn ? ' ⚠️' : ''}</span>`;
}
function wireSubHtml(d, b) {
  const e = d ? effectiveWire(d, b) : { wire: cleanWire(b && b.wire), from: 'circuit' };
  if (!e.wire) return '';
  const t = [wireShort(e.wire), typeText(e.wire, true)].filter(Boolean).join(' ');
  const warn = wireChecks(e.wire, breakerAmps(b)).some((c) => c.kind === 'size');
  return `<div class="mb-sub"><span class="wire-ic" aria-hidden="true">〰</span> Wire: <b>${esc(t || wireText(e.wire, { short: true }))}</b>${d && e.from === 'outlet' ? ' (this plug)' : ''}${warn ? ' ⚠️' : ''}</div>`;
}

const go = (h) => {
  if (location.hash === h) render();
  else location.hash = h;
};
const deepLink = (path) => `${location.origin}${location.pathname}#${path}`;

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 1800);
}

function currentHomeId() {
  const homes = D().homes;
  let id = localStorage.getItem(HOME_KEY);
  if (!homes.find((h) => h.id === id)) id = homes[0] && homes[0].id;
  return id;
}
function setHome(id) {
  localStorage.setItem(HOME_KEY, id);
}

function parseRoute() {
  const full = location.hash.replace(/^#/, '') || '/';
  const [raw, anchor] = full.split('#');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs || '');
  return { parts, q, raw, anchor };
}

async function qrSvg(text) {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
}

function loadBar(s, compact = false) {
  const pct = Math.min(s.pct, 130);
  return `<div class="meter ${s.level} ${compact ? 'compact' : ''}" role="img" aria-label="${esc(fmtAmps(s.amps))} of ${s.rating} amps">
    <div class="meter-fill" style="width:${(pct / 130) * 100}%"></div>
    <div class="meter-80" style="left:${(80 / 130) * 100}%"></div>
    <div class="meter-100" style="left:${(100 / 130) * 100}%"></div>
  </div>`;
}

// ---------------------------------------------------------------- layout
function shell(homeId, active, body, { title = '', back = '' } = {}) {
  const home = byId('homes', homeId);
  const homes = D().homes;
  const nav = [
    ...(isPro() ? [['customers', '👥', 'Customers', '#/customers']] : []),
    ['panel', '▦', 'Panel', `#/h/${homeId}/panel`],
    ['map', '◫', 'Map', `#/h/${homeId}/map`],
    ['rooms', '⌂', 'Rooms', `#/h/${homeId}/rooms`],
    ['search', '⌕', 'Search', `#/h/${homeId}/search`],
    ['load', '⚡', 'Load', `#/h/${homeId}/load`],
    isGuest() ? ['more', '✓', 'Done', `#/h/${homeId}/more`] : ['more', '⚙︎', 'Settings', `#/h/${homeId}/more`],
  ];
  return `
  ${isGuest() ? guestBanner() : store.mode === 'demo' ? `<div class="demo-banner">Demo mode: saved on this device only${isFirebaseConfigured() ? ' · <a href="#/login">Sign in to sync</a>' : ''}</div>` : ''}
  <header class="topbar">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="Back">‹</a>` : `<img class="logo" src="./brand/house-108.png" alt="" aria-hidden="true" width="34" height="34">`}
    <div class="topbar-title">
      ${title ? `<h1>${esc(title)}</h1>` : `<label class="sr-only" for="homePick">Home</label>
      <select id="homePick" class="home-pick">${homeOptions(homes, homeId)}${isGuest() ? '' : '<option value="__new">+ Add a home...</option>'}</select>`}
    </div>
    <a class="scan-btn" href="#/scan" aria-label="Scan a QR sticker"><span aria-hidden="true">⌗</span>Scan</a>
  </header>
  <main id="main" class="main">${body}</main>
  <nav class="bottomnav ${isPro() ? 'seven' : 'six'}" aria-label="Sections">
    ${nav.map(([k, ic, l, h]) => `<a href="${h}" class="${active === k ? 'active' : ''}" ${active === k ? 'aria-current="page"' : ''}><span aria-hidden="true">${ic}</span>${l}</a>`).join('')}
  </nav>`;
  void home;
}

function homeOptions(homes, homeId) {
  const o = (h) => `<option value="${esc(h.id)}" ${h.id === homeId ? 'selected' : ''}>${esc(h.name)}</option>`;
  const mine = homes.filter((h) => !h.customerId || !byId('customers', h.customerId));
  const theirs = homes.filter((h) => h.customerId && byId('customers', h.customerId));
  if (!theirs.length) return homes.map(o).join('');
  const groups = new Map();
  for (const h of theirs) {
    const c = byId('customers', h.customerId);
    if (!groups.has(c.name)) groups.set(c.name, []);
    groups.get(c.name).push(h);
  }
  return (mine.length ? `<optgroup label="My places">${mine.map(o).join('')}</optgroup>` : '') + [...groups.entries()].map(([n, hs]) => `<optgroup label="${esc(n)}">${hs.map(o).join('')}</optgroup>`).join('');
}

function bindShell() {
  const hp = document.getElementById('homePick');
  if (hp)
    hp.onchange = () => {
      if (hp.value === '__new') go(`#/edit/homes/new`);
      else {
        setHome(hp.value);
        go(`#/h/${hp.value}/panel`);
      }
    };
}

// ---------------------------------------------------------------- render
let lastHash = null;
async function render() {
  if (!store) return;
  const { parts, q, anchor } = parseRoute();
  if (location.hash !== lastHash) {
    lastHash = location.hash;
    window.scrollTo(0, 0);
    if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }), 80);
  }

  if (parts[0] === 'get' || isGetPath()) return renderGet();
  if (parts[0] === 'share' && parts[1] && parts[2] === 'edit') return renderCodeEntry(parts[1]);
  if (parts[0] === 'share' && parts[1]) return renderShare(parts[1]);
  if (['p', 'd', 'b'].includes(parts[0]) && parts[1]) return resolveShort(parts[0], parts[1]);
  if (parts[0] === 'scan') return renderScan();
  if (store.mode === 'cloud' && !store.user) {
    if (parts[0] === 'h' || parts[0] === 'customers' || parts[0] === 'claim') pendingRoute = location.hash;
    return renderLogin();
  }
  if (parts[0] === 'claim' && parts[1]) {
    if (isGuest()) return leaveGuest();
    return renderClaim(parts[1]);
  }
  if (isGuest()) {
    const gh = store.guest.homeId;
    if (parts[0] === 'edit' && !['panels', 'breakers', 'devices'].includes(parts[1])) { toast('Only the homeowner can change that.'); return go(`#/h/${gh}/panel`); }
    if (parts[0] === 'customers' || parts[0] === 'login' || (parts[0] === 'h' && parts[1] !== gh)) return go(`#/h/${gh}/panel`);
    if (parts[0] === 'h' && ['more', 'access'].includes(parts[2])) return renderGuestMore(gh);
    if (parts[0] === 'h' && parts[2] === 'print' && parts[3] === 'setup') return go(`#/h/${gh}/panel`);
  }
  if (parts[0] === 'login') {
    if (store.mode === 'demo') return renderLogin();
    if (pendingRoute) {
      const r = pendingRoute;
      pendingRoute = null;
      return go(r);
    }
    return go('#/');
  }
  if (store.mode === 'cloud' && store.user && localStorage.getItem('panelbuddy:pendingType')) {
    const t = localStorage.getItem('panelbuddy:pendingType');
    localStorage.removeItem('panelbuddy:pendingType');
    store.saveSettings({ accountType: t });
  }
  if (parts[0] === 'edit') return renderEdit(parts[1], parts[2], q);
  if (parts[0] === 'customers') return parts[1] ? renderCustomer(parts[1]) : renderCustomers(q);

  if (!D().homes.length) return renderFirstHome();

  if (parts[0] !== 'h' || !byId('homes', parts[1])) {
    if (parts[0] === 'h' && parts[1]) return renderNotFound();
    return go(`#/h/${currentHomeId()}/panel`);
  }
  const homeId = parts[1];
  setHome(homeId);
  const view = parts[2] || 'panel';
  const id = parts[3];
  try {
    if (view === 'panel') return renderPanel(homeId, id);
    if (view === 'tree') return renderTree(homeId);
    if (view === 'breaker') return renderBreaker(homeId, id);
    if (view === 'device') return renderDevice(homeId, id);
    if (view === 'sticker') return renderSticker(homeId, q);
    if (view === 'rooms') return renderRooms(homeId, q.get('room'));
    if (view === 'map') return renderMap(homeId, q);
    if (view === 'bulk') return renderBulk(homeId, q);
    if (view === 'quick') return renderQuick(homeId, q);
    if (view === 'search' && id === 'dev') return renderCatalogItem(homeId, parts[4], q);
    if (view === 'search' && id === 'add') return renderAddPicker(homeId, parts[4], q);
    if (view === 'search') return renderSearch(homeId, q.get('q') || '', q.get('cat') || '');
    if (view === 'load') return renderLoad(homeId);
    if (view === 'move') return renderMove(homeId, q);
    if (view === 'item') return renderItem(homeId, q);
    if (view === 'portable') return renderPortables(homeId);
    if (view === 'more') return renderMore(homeId);
    if (view === 'access') return renderAccess(homeId, q);
    if (view === 'shop') return renderShop(homeId, q.get('scope'));
    if (view === 'print') return renderPrint(homeId, parts[3], parts[4], q);
  } catch (e) {
    console.error(e);
  }
  return renderNotFound();
}

// ---------------------------------------------------------------- panel sticker + smart /get link
// /get (real path, via vercel.json's catch-all rewrite) or #/get: phones go to their store once its URL is set
// in src/lib/sticker.js; until then everyone gets the web app. Works signed out.
// keep a phone number on one line on the sticker
const ibDisplay = (t) => t.replace(/\(?\d[\d\s().-]{5,}\d/g, (m) => m.replace(/-/g, '\u2011').replace(/ /g, '\u00a0'));
const isGetPath = () => (!location.hash || location.hash === '#') && /\/get\/?$/.test(location.pathname);

function renderGet() {
  const platform = detectPlatform(navigator.userAgent, { platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints });
  const target = getTarget(platform);
  if (target.redirect && !/[?&]stay=1/.test(location.search)) {
    app.innerHTML = `<div class="center-msg">Opening ${target.kind === 'play' ? 'Google Play' : 'the App Store'}... <a href="${esc(target.url)}">Tap here if nothing happens</a></div>`;
    location.replace(target.url);
    return;
  }
  const web = `${location.pathname.replace(/\/get\/?$/, '/')}${location.search}#/`;
  const rows = storeRows(platform).map((r) => {
    const inner = `<span class="gs-ic" aria-hidden="true">${r.key === 'ios' ? '📱' : '▶'}</span><span class="gs-txt"><b>${esc(r.text)}</b><span>${esc(r.soon ? `${r.store} · for ${r.label}` : r.label)}</span></span>`;
    return r.url ? `<a class="get-store ${r.key === platform ? 'mine' : ''}" href="${esc(r.url)}">${inner}</a>` : `<div class="get-store soon ${r.key === platform ? 'mine' : ''}">${inner}</div>`;
  }).join('');
  app.innerHTML = `<div class="auth get-page">
    <img class="auth-logo" src="./brand/badge.png" alt="AmpMap logo" width="116" height="128">
    <h1>Get AmpMap</h1>
    <p class="get-lead">Map your electrical panel: every breaker, outlet and wire, right on your phone.</p>
    <a class="btn primary get-open" href="${esc(web)}">Open AmpMap</a>
    <p class="tiny muted">Free. Works in your browser right now. Tip: use Add to Home Screen to keep it like an app.</p>
    <div class="get-stores">${rows}</div>
    <p class="tiny muted get-foot">Already mapped a panel? Sign in and it's all there.</p>
  </div>`;
}

function renderSticker(homeId, q) {
  const home = byId('homes', homeId);
  const size = stickerSize(q.get('size') || '4x6');
  const pc = printChoice(q.get('paper'));
  const paper = pc.paper;
  const tape = tapeSize(q.get('tape'));
  const prefer = q.get('qr') === 'get' ? 'get' : '';
  const target = stickerQrTarget(home, { shareUrl: (t) => deepLink('/share/' + t), getUrl: GET_URL, prefer });
  const copy = stickerCopy(target.kind);
  const ib = installedByDefault(home, store.settings, isPro()) || {};
  const qs = (o) => { const p = new URLSearchParams({ size: size.value, paper, qr: prefer, tape: paper === 'tape' ? tape.value : '', ...o }); for (const [k, v] of [...p]) if (!v || (k === 'paper' && v === 'label')) p.delete(k); return p.toString(); };
  const panel = inHome('panels', homeId)[0];
  const back = panel ? `#/h/${homeId}/panel/${panel.id}` : `#/h/${homeId}/panel`;
  const body = `
  <div class="no-print pm-pick" role="group" aria-label="How will you print it?">${PRINT_METHODS.map((m) => `<a class="pm-card ${m.value === pc.method ? 'on' : ''}" aria-pressed="${m.value === pc.method}" href="#/h/${homeId}/sticker?${qs({ paper: m.value === 'maker' ? 'tape' : 'label' })}"><span class="pm-ic" aria-hidden="true">${m.icon}</span><b>${esc(m.label)}</b><small>${esc(m.sub)}</small></a>`).join('')}</div>
  ${paper === 'tape'
    ? `<div class="no-print st-row st-sizes" role="group" aria-label="Tape length"><span class="st-lbl">Size</span>${TAPE_SIZES.map((t) => `<a class="st-chip ${t.value === tape.value ? 'on' : ''}" aria-pressed="${t.value === tape.value}" href="#/h/${homeId}/sticker?${qs({ tape: t.value })}">${esc(t.label)}</a>`).join('')}</div>
  <div class="amp-tape-wrap paper-tape"><div class="amp-tape t-${tape.value}" id="ampTape" style="--tw:${tape.w}in;--th:${tape.h}in">
    <div class="at-qr" id="atQr" aria-label="QR code"></div>
    <div class="at-text"><b>Mapped with AmpMap</b><span>${esc(copy.scan)}</span>${tape.w >= 3.5 && installedByText(ib) ? `<small>${esc(ibDisplay(installedByText(ib)))}</small>` : ''}</div>
  </div></div>
  <p class="no-print tiny muted st-tip">${esc(TAPE_TIP)}</p>
  <details class="no-print more-details st-makers"><summary><b>Which printer should I get?</b><span class="muted tiny">3 picks, prices approx.</span></summary>
    <ul class="list maker-list">${LABEL_MAKERS.map((m) => `<li><a class="row" href="${esc(m.url)}" target="_blank" rel="noopener"><span class="row-main"><b>${esc(m.name)}</b><span class="muted">${esc(m.tier)} · ${esc(m.price)}</span></span><span class="chev" aria-hidden="true">↗</span></a></li>`).join('')}</ul>
    <p class="tiny muted">Any label maker that takes 1 in (24 mm) tape works.</p>
  </details>`
    : `<div class="no-print st-row st-sizes" role="group" aria-label="Sticker size"><span class="st-lbl">Size</span>${STICKER_SIZES.map((s) => `<a class="st-chip ${s.value === size.value ? 'on' : ''}" aria-pressed="${s.value === size.value}" href="#/h/${homeId}/sticker?${qs({ size: s.value })}">${esc(s.label)}</a>`).join('')}</div>
  <p class="no-print tiny muted st-tip">For outdoor or long-lasting labels, print on weatherproof label sheets, like <a href="${esc(WEATHERPROOF_SHEETS.url)}" target="_blank" rel="noopener">${esc(WEATHERPROOF_SHEETS.name)}</a>. ${esc(WEATHERPROOF_SHEETS.note)}</p>`}
  <div class="amp-sign-wrap paper-${paper}" ${paper === 'tape' ? 'hidden' : ''}>
    <div class="amp-sign s-${size.value}" id="ampSign">
      <div class="as-top"><img class="as-badge" src="./brand/badge.png" alt="AmpMap"><div class="as-brand"><b>AmpMap</b><span>Panel &amp; circuit map</span></div></div>
      <div class="as-head">This panel is mapped with <b>AmpMap</b></div>
      <div class="as-qr" id="asQr" aria-label="QR code"></div>
      <div class="as-scan"><b>${esc(copy.scan)}</b><span>${esc(copy.sub)}</span></div>
      <div class="as-ib" id="asIb" ${installedByText(ib) ? '' : 'hidden'}>${esc(ibDisplay(installedByText(ib)))}</div>
      <div class="as-url">${esc(GET_URL.replace(/^https:\/\//, ''))}</div>
    </div>
  </div>
  <div class="print-controls no-print st-controls">
    <div class="st-ib">
      <span class="st-lbl">Installed by <span class="muted">(optional)</span></span>
      <div class="st-ib-row"><input id="ibCompany" maxlength="60" autocomplete="organization" placeholder="Company name" aria-label="Company name" value="${esc(ib.company || '')}"><input id="ibPhone" type="tel" maxlength="30" autocomplete="tel" placeholder="Phone" aria-label="Phone" value="${esc(ib.phone || '')}"></div>
      <div class="st-ib-foot"><span class="tiny muted">${isPro() ? 'Saved on this home, and used as your default on new stickers.' : 'Saved on this home.'}</span><button type="button" class="btn small" id="ibSave" hidden>Save</button></div>
    </div>
    ${home.shareToken
      ? `<label>Scanning opens<select id="stQr">${opt([{ value: '', label: 'This panel (view only)' }, { value: 'get', label: 'The app download' }], prefer)}</select></label>`
      : `<p class="tiny muted st-hint">Scanning opens the AmpMap download page. To show this panel instead, turn on <a href="#/h/${homeId}/more#share">Settings › Share</a>.</p>`}
    ${paper === 'tape' ? '' : `<label>Paper<select id="stPaper">${opt([{ value: 'label', label: `${size.label} (label printer / sticker sheet)` }, { value: 'letter', label: 'Regular 8.5 x 11 paper (cut it out)' }], paper)}</select></label>`}
    <button class="btn primary" id="doPrint">Print / Save as PDF</button>
  </div>
  <style>@media print { @page { size: ${paper === 'letter' ? 'letter' : paper === 'tape' ? `${tape.w}in ${tape.h}in` : `${size.w}in ${size.h}in`}; margin: 0; } }</style>`;
  app.innerHTML = shell(homeId, 'more', body, { title: 'Panel sticker', back });
  bindShell();
  qrSvg(target.url).then((svg) => { for (const id of ['asQr', 'atQr']) { const el = document.getElementById(id); if (el) el.innerHTML = svg; } });
  const $c = document.getElementById('ibCompany');
  const $p = document.getElementById('ibPhone');
  const $save = document.getElementById('ibSave');
  const val = () => cleanInstalledBy({ company: $c.value, phone: $p.value });
  const dirty = () => JSON.stringify(val()) !== JSON.stringify(installedByDefault(byId('homes', homeId), store.settings, isPro()));
  const live = () => {
    const t = installedByText(val());
    const el = document.getElementById('asIb');
    el.textContent = ibDisplay(t);
    el.hidden = !t;
    $save.hidden = !dirty();
  };
  $c.oninput = live;
  $p.oninput = live;
  const save = async (print = false) => {
    const h = byId('homes', homeId);
    if (!dirty() && !(print && val() && !Object.prototype.hasOwnProperty.call(h, 'installedBy'))) return;
    const v = val();
    await store.put('homes', { ...byId('homes', homeId), installedBy: v });
    if (isPro()) await store.saveSettings({ installedBy: v });
  };
  $save.onclick = async () => { await save(); toast('Saved'); };
  if (document.getElementById('stPaper')) document.getElementById('stPaper').onchange = (e) => go(`#/h/${homeId}/sticker?${qs({ paper: e.target.value })}`);
  if (document.getElementById('stQr')) document.getElementById('stQr').onchange = (e) => go(`#/h/${homeId}/sticker?${qs({ qr: e.target.value })}`);
  document.getElementById('doPrint').onclick = async () => {
    try { await save(true); } catch (e) { console.error(e); }
    setTimeout(() => window.print(), 120);
  };
}

// ---------------------------------------------------------------- edit codes, history, hand-off
// The homeowner controls who can edit: a code they set or a temporary one (24 h / 7 days /
// until turned off), a hand-off code an installer leaves for a brand-new homeowner, and a
// "People with access" list. Electricians edit the homeowner's REAL data (no copy), every
// change is logged with their name, and the homeowner can undo the last change.
const GUEST_KEY = 'ampmap:guest';
const GUEST_NAME_KEY = 'ampmap:guestName';
let guestEnded = '';
function guestInfo() {
  try {
    return JSON.parse(sessionStorage.getItem(GUEST_KEY) || 'null');
  } catch {
    return null;
  }
}
const isGuest = () => store && store.mode === 'guest';
function leaveGuest(msg = '') {
  const gi = guestInfo();
  sessionStorage.removeItem(GUEST_KEY);
  if (msg) sessionStorage.setItem('ampmap:guestEnded', msg);
  location.hash = gi && gi.token ? `#/share/${gi.token}` : '#/';
  location.reload();
}
function guestDenied() {
  leaveGuest('Your edit access ended: the homeowner changed or turned off the code. Your last change may not have saved.');
}

// One line per change for the homeowner's history.
function historyLine(change, data) {
  const panels = (data && data.panels) || D().panels;
  const breakers = (data && data.breakers) || D().breakers;
  const name = (col, o) => {
    if (!o) return '';
    if (col === 'breakers') {
      const p = panels.find((x) => x.id === o.panelId);
      return `#${slotLabel(o, p || 'two')}${o.label ? ' ' + o.label : ''}`;
    }
    if (col === 'devices') return `"${o.name || labelOf(DEVICE_TYPES, o.type) || 'item'}"${o.room ? ' (' + o.room + ')' : ''}`;
    return o.name ? `"${o.name}"` : '';
  };
  const breakerName = (id) => { const b = breakers.find((x) => x.id === id); return b ? name('breakers', b) : '(none)'; };
  return describeChange(change, { name, wireText: (w) => wireTag(w) || '', breakerName });
}

async function startGuest(gi) {
  const common = { describe: historyLine, onDenied: guestDenied };
  if (gi.mode === 'demo') {
    const local = createLocalStore();
    await local.init();
    if (!local.demoCodeStillValid(gi.token, gi.hash)) throw new Error('ended');
    const backend = local.localBackend(gi.homeId);
    const commit = backend.commit;
    backend.commit = async (changes, entry) => {
      if (!local.demoCodeStillValid(gi.token, gi.hash)) throw new Error('ended');
      return commit(changes, entry);
    };
    return createScopedStore(backend, { ownerUid: 'demo', homeId: gi.homeId, editorUid: 'demo-guest', name: gi.name, afterCommit: () => backend.refreshShare(gi.token, sharePayload(gi.homeId)), ...common });
  }
  if (!isFirebaseConfigured()) throw new Error('no cloud');
  if (gi.mode === 'code') {
    const { openCodeGuest } = await import('./store/scoped-cloud.js');
    return openCodeGuest(firebaseConfig, gi, { afterShare: () => sharePayload(gi.homeId), ...common });
  }
  if (gi.mode === 'grant') {
    const { createFirebaseStore } = await import('./store/firebase.js');
    const main = createFirebaseStore(firebaseConfig);
    await main.init();
    if (!main.user) throw new Error('signed out');
    const s = await main.openGrant({ owner: gi.ownerUid, homeId: gi.homeId }, { name: gi.name, afterShare: () => sharePayload(gi.homeId), ...common });
    s.signOut = async () => { await s.settle().catch(() => {}); };
    return s;
  }
  throw new Error('unknown');
}

function guestBanner() {
  const g = store.guest;
  return `<div class="guest-banner" role="status">✎ Editing as <b>${esc(g.name)}</b> · changes save for the homeowner · <a href="#/h/${esc(g.homeId)}/more">Done</a></div>`;
}

function renderGuestMore(homeId) {
  const home = byId('homes', homeId);
  const gi = guestInfo() || {};
  const body = `
  <div class="card">
    <h3>You're editing ${esc(home ? home.name : 'this home')}</h3>
    <p class="muted">As <b>${esc(store.guest.name)}</b>. Your changes save to the homeowner's AmpMap with your name, and they can undo them.</p>
    <p class="muted">You can change breakers, outlets, wire and labels. Photos and sharing stay with the homeowner.</p>
    <button class="btn primary" id="guestDone">Done editing</button>
    ${gi.token ? `<a class="btn ghost" href="#/share/${esc(gi.token)}">See the read-only view</a>` : ''}
  </div>
  <div class="card">
    <h3>Appearance</h3>
    <label>Theme<select id="themePick">${opt(THEME_OPTIONS, getThemePref())}</select></label>
  </div>`;
  app.innerHTML = shell(homeId, 'more', body);
  bindShell();
  document.getElementById('themePick').onchange = (e) => setThemePref(e.target.value);
  document.getElementById('guestDone').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Saving...';
    await store.signOut().catch(() => {});
    leaveGuest();
  };
}

// The electrician: shared view › Edit › name + code.
async function renderCodeEntry(token) {
  app.innerHTML = `<div class="center-msg">Loading...</div>`;
  let doc = null;
  try { doc = await store.getShare(token); } catch { doc = null; }
  if (!doc) return renderShare(token);
  const lastName = localStorage.getItem(GUEST_NAME_KEY) || '';
  app.innerHTML = `
  <header class="topbar"><a class="icon-btn" href="#/share/${esc(token)}" aria-label="Back">‹</a><div class="topbar-title"><h1>Edit this panel</h1></div></header>
  <main class="main share-main">
    <div class="card code-card">
      <div class="code-home"><img src="./brand/house-108.png" alt="" width="40" height="40"><div><b>${esc(doc.home.name)}</b>${doc.home.address ? `<br><span class="muted tiny">${esc(doc.home.address)}</span>` : ''}</div></div>
      <p class="muted">Type the edit code from the homeowner. No account needed.</p>
      <form id="codeForm" class="form" autocomplete="off">
        <label>Your name and company<input name="who" required maxlength="60" value="${esc(lastName)}" placeholder="Mike · Bright Line Electric" autocomplete="name"></label>
        <label>Edit code<input name="code" required class="code-input" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" spellcheck="false" maxlength="40" placeholder="6-digit code"></label>
        <button class="btn primary" type="submit">Start editing</button>
        <p class="err" id="codeErr" role="alert"></p>
      </form>
      <p class="tiny muted">The homeowner sees your name, the date and what you changed, and can undo it.</p>
    </div>
  </main>`;
  const f = document.getElementById('codeForm');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('codeErr');
    const btn = f.querySelector('button');
    errEl.textContent = '';
    const who = f.elements.who.value.trim();
    const code = f.elements.code.value;
    if (!who) return;
    btn.disabled = true;
    btn.textContent = 'Checking...';
    try {
      let res;
      let mode;
      if (store.mode === 'demo') {
        res = await store.demoEnter(token, code);
        mode = 'demo';
      } else {
        const { enterWithCode } = await import('./store/scoped-cloud.js');
        res = await enterWithCode(firebaseConfig, token, code, who);
        mode = 'code';
      }
      localStorage.setItem(GUEST_NAME_KEY, who);
      sessionStorage.setItem(GUEST_KEY, JSON.stringify({ mode, token, ownerUid: res.ownerUid, homeId: res.homeId, name: who, hash: res.hash || '' }));
      location.hash = `#/h/${res.homeId}/panel`;
      location.reload();
    } catch (ex) {
      btn.disabled = false;
      btn.textContent = 'Start editing';
      errEl.textContent = codeErrorText(ex);
    }
  };
}

function codeErrorText(ex) {
  const c = ex && ex.code;
  if (c === 'ampmap/wrong') return `That code didn't work. Check it with the homeowner.${ex.left != null ? ` ${ex.left} ${ex.left === 1 ? 'try' : 'tries'} left this hour.` : ''}`;
  if (c === 'ampmap/locked') return `Too many wrong tries. Try again after ${new Date(ex.until).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, or ask the homeowner to make a new code.`;
  if (c === 'ampmap/expired') return 'That code has expired. Ask for a new one.';
  if (c === 'ampmap/gone') return 'This link was turned off.';
  if (c === 'ampmap/self') return 'You made this setup code. The homeowner enters it from their own account.';
  if (c === 'ampmap/anon-off' || c === 'ampmap/rules') return "Editing with a code isn't switched on for this AmpMap yet. The owner needs to finish a one-time setup.";
  return "Couldn't check the code: " + ((ex && ex.message) || 'try again');
}

// Homeowner: Settings › Edit codes & access.
let historyCache = { homeId: '', at: 0, list: null };
async function loadHistory(homeId, fresh = false) {
  if (!store.listHistory) return null;
  if (!fresh && historyCache.homeId === homeId && Date.now() - historyCache.at < 60000) return historyCache.list;
  const list = await store.listHistory(homeId);
  historyCache = { homeId, at: Date.now(), list };
  return list;
}

function fmtWhen(ms) {
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}
const spaced = (code) => (/^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code);

async function renderAccess(homeId, q) {
  const home = byId('homes', homeId);
  app.innerHTML = shell(homeId, 'more', `<div class="center-msg">Loading...</div>`, { title: 'Who can edit', back: `#/h/${homeId}/more` });
  const token = home.shareToken;
  let code = null;
  let rulesMissing = false;
  if (token) {
    try { code = await store.getEditCode(token); } catch (e) { if (e.code === 'ampmap/rules') rulesMissing = true; }
  }
  const priv = await store.getPrivate('edit_' + homeId);
  const guard = token ? await store.getGuard(token) : null;
  const grants = await store.listGrants(homeId);
  const hist = await loadHistory(homeId, true);
  const claims = await store.listClaims(homeId);
  const claimPriv = await store.getPrivate('claim_' + homeId);
  const claim = claimPriv && claims.find((c) => c.id === claimPriv.claimId);
  const st = codeStatus(code);
  const showCode = st.on && code.kind === 'temp' && priv && priv.token === token ? priv.code : '';
  const locked = guard && guardNext(guard).locked;
  const pick = q.get('exp') || '24h';
  const welcome = q.get('welcome');
  const lastUndo = hist ? undoable(hist) : null;
  const shareLink = token ? deepLink('/share/' + token) : '';
  const body = `
  ${welcome ? `<div class="alert ok-alert">🎉 ${esc(home.name)} is yours now. Make a temporary code below whenever an electrician comes.</div>` : ''}
  ${rulesMissing ? `<div class="alert warn">Edit codes aren't switched on yet. They need a one-time update by the AmpMap owner.</div>` : ''}
  <div class="card access-card" id="codes">
    <h3>Let an electrician edit</h3>
    <p class="muted">Give the electrician a code. They scan the QR on your panel, tap <b>Edit</b> and type it. No account needed.</p>
    <div class="code-status ${st.on ? 'on' : ''}"><span class="dot-st"></span>${esc(st.text)}</div>
    ${showCode ? `<div class="big-code" aria-label="Edit code">${esc(spaced(showCode))}</div><div class="stack"><button class="btn primary" id="codeShare">Send the code</button></div>` : ''}
    ${st.on && !showCode ? `<p class="tiny muted">AmpMap doesn't show a code you chose. Forgot it? Set a new one.</p>` : ''}
    ${locked ? `<div class="alert warn">Too many wrong tries. The code is paused until ${esc(new Date(guardNext(guard).until).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}. <button class="btn small" id="unlock">Unpause now</button></div>` : ''}
    <div class="access-block">
      <h4>Temporary code</h4>
      <p class="tiny muted">A new 6-digit code that stops working after the time you pick.</p>
      <div class="chips" role="group" aria-label="Works for">${EXPIRY_CHOICES.map((c) => `<button type="button" class="chip ${pick === c.value ? 'on' : ''}" data-exp="${c.value}" aria-pressed="${pick === c.value}">${esc(c.label)}</button>`).join('')}</div>
      <button class="btn ${showCode ? '' : 'primary'}" id="makeTemp">${st.on ? 'Make a new code' : 'Make a code'}</button>
    </div>
    <div class="access-block">
      <h4>Your own code</h4>
      <p class="tiny muted">One you choose and can reuse. Works until you change it or turn it off.</p>
      <form id="ownForm" class="inline-form"><input name="own" placeholder="6 or more letters or numbers" maxlength="32" autocomplete="off" aria-label="Your own code"><button class="btn" type="submit">Save</button></form>
      <p class="err" id="ownErr" role="alert"></p>
    </div>
    ${st.on ? `<div class="access-block"><h4>Turn off editing</h4><p class="tiny muted">The code stops working right away. Making a new code does the same to the old one.</p><button class="btn danger" id="codeOff">Turn off editing</button></div>` : ''}
  </div>

  <div class="card access-card" id="people">
    <h3>People with access</h3>
    <ul class="list people">
      <li><span><b>You</b> · owner</span></li>
      ${st.on ? `<li><span>Anyone with the code · can edit</span><span class="muted tiny">${code.kind === 'temp' ? 'temporary' : 'your code'}</span></li>` : ''}
      ${grants.map((g) => `<li><span><b>${esc(g.editorName || 'Installer')}</b> · can edit</span><button class="btn small danger" data-ungrant="${esc(g.id)}">Remove</button></li>`).join('')}
      ${token ? `<li><span>Anyone who scans your QR · can view</span><a class="btn small" href="#/h/${homeId}/more#share">Manage</a></li>` : ''}
    </ul>
  </div>

  <div class="card access-card" id="history">
    <h3>Edit history</h3>
    ${hist == null ? `<p class="muted">Edit history turns on with the same one-time update.</p>` : !hist.length ? `<p class="muted">No changes by others yet. You'll see who changed what, and when.</p>` : `<ul class="history">${hist.slice(0, 40).map((e) => `
      <li class="${e.undoneAt ? 'undone' : ''}">
        <div class="h-head"><b>Changed by: ${esc(e.by)}</b> · ${esc(fmtWhen(e.at))}${e.undoneAt ? ' · <span class="muted">undone</span>' : ''}</div>
        <ul class="h-lines">${(e.summary || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        ${lastUndo && lastUndo.id === e.id ? `<button class="btn small" data-undo="${esc(e.id)}">↶ Undo this change</button>` : ''}
      </li>`).join('')}</ul>`}
  </div>

  <div class="card access-card" id="handoff">
    <h3>Hand off to the homeowner</h3>
    ${claim ? `<p class="muted">${esc(claimStatus(claim).text)}</p>
      <div class="big-code claim">${esc(prettyClaimCode(claimPriv.code))}</div>
      <div class="stack"><a class="btn primary" href="#/h/${homeId}/print/setup">Print the setup page</a><button class="btn danger" id="claimCancel">Cancel the hand-off</button></div>`
      : `<p class="muted">Setting this up for someone else? Print a setup page and leave it at the panel. When they enter the code, the home moves to their account.</p>
      <label>Your name or company<input id="claimFrom" maxlength="60" value="${esc((home.installedBy && home.installedBy.company) || localStorage.getItem('ampmap:installer') || '')}" placeholder="Bright Line Electric"></label>
      <button class="btn" id="claimMake">Make the setup page</button>`}
    <p class="tiny muted">The code works once, for 30 days. After that the home is theirs; they can let you keep editing.</p>
  </div>`;
  app.innerHTML = shell(homeId, 'more', body, { title: 'Who can edit', back: `#/h/${homeId}/more` });
  bindShell();
  const $ = (id) => document.getElementById(id);
  const fail = (ex) => alert(ex && ex.code === 'ampmap/rules' ? 'This needs the one-time security update first (the AmpMap owner deploys it).' : "Couldn't save: " + ((ex && ex.message) || ex));
  // a code needs the share link (that's what the QR opens); make it if needed, with homeId
  const ensureShare = async () => {
    const panelIds = inHome('panels', homeId).map((p) => p.id);
    const t = home.shareToken || shareToken();
    await store.createShare(t, sharePayload(homeId), panelIds);
    if (!home.shareToken) await store.put('homes', { ...home, shareToken: t });
    return t;
  };
  document.querySelectorAll('[data-exp]').forEach((b) => (b.onclick = () => go(`#/h/${homeId}/access?exp=${b.dataset.exp}`)));
  $('makeTemp').onclick = async () => {
    try {
      const t = await ensureShare();
      await store.saveEditCode(t, { homeId, code: makeTempCode(), kind: 'temp', exp: expiryFor(pick) });
      toast('New code ready');
      renderAccess(homeId, q);
    } catch (ex) { fail(ex); }
  };
  $('ownForm').onsubmit = async (e) => {
    e.preventDefault();
    const v = e.target.elements.own.value;
    const problem = customCodeProblem(v);
    $('ownErr').textContent = problem;
    if (problem) return;
    try {
      const t = await ensureShare();
      await store.saveEditCode(t, { homeId, code: v, kind: 'custom', exp: null });
      toast('Your code is on');
      renderAccess(homeId, q);
    } catch (ex) { fail(ex); }
  };
  if ($('codeOff')) $('codeOff').onclick = async () => {
    if (!confirm('Turn off editing? The code stops working right away.')) return;
    await store.deleteEditCode(token, homeId);
    toast('Editing is off');
    renderAccess(homeId, q);
  };
  if ($('unlock')) $('unlock').onclick = async () => { await store.clearGuard(token); renderAccess(homeId, q); };
  if ($('codeShare')) $('codeShare').onclick = async () => {
    const exp = toMillis(code.exp);
    const text = `AmpMap edit code for ${home.name}: ${showCode}\nScan the QR on the panel (or open ${shareLink}), tap Edit, and enter the code.${exp ? ` Works until ${fmtWhen(exp)}.` : ''}`;
    try {
      if (navigator.share) await navigator.share({ title: 'AmpMap edit code', text });
      else { await navigator.clipboard.writeText(text); toast('Copied'); }
    } catch { /* closed */ }
  };
  document.querySelectorAll('[data-ungrant]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Remove their edit access?')) return;
    await store.removeGrant(b.dataset.ungrant);
    toast('Removed');
    renderAccess(homeId, q);
  }));
  document.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => {
    const e = hist.find((x) => x.id === b.dataset.undo);
    if (!e || !confirm(`Undo the change by ${e.by}?`)) return;
    for (const o of undoOps(e)) {
      if (o.op === 'put') await store.put(o.col, o.obj);
      else await store.remove(o.col, o.id);
    }
    await store.markUndone(e.id);
    toast('Undone');
    renderAccess(homeId, q);
  }));
  if ($('claimMake')) $('claimMake').onclick = async () => {
    const from = $('claimFrom').value.trim();
    if (from) localStorage.setItem('ampmap:installer', from);
    try {
      if (home.shareToken) await ensureShare(); // stamp the share with this home so it moves too
      await store.createClaim(homeId, makeClaimCode(), { homeName: home.name, fromName: from });
      go(`#/h/${homeId}/print/setup`);
    } catch (ex) { fail(ex); }
  };
  if ($('claimCancel')) $('claimCancel').onclick = async () => {
    if (!confirm('Cancel the hand-off? The printed setup code stops working.')) return;
    await store.cancelClaim(claim.id, homeId);
    renderAccess(homeId, q);
  };
}

// Printable "Homeowner setup" page (half page) with the claim QR + code.
async function renderSetupPrint(homeId) {
  const home = byId('homes', homeId);
  const priv = await store.getPrivate('claim_' + homeId);
  if (!priv) return go(`#/h/${homeId}/access#handoff`);
  const claims = await store.listClaims(homeId);
  const claim = claims.find((c) => c.id === priv.claimId) || { exp: priv.exp, fromName: '' };
  const link = deepLink('/claim/' + priv.claimId);
  const panel = inHome('panels', homeId)[0];
  const body = `
  <div class="print-controls no-print">
    <p class="muted">Tape it inside the panel door or leave it on the counter. The code works once.</p>
    <button class="btn primary" id="doPrint">Print / Save as PDF</button>
  </div>
  <div class="sheet setup-sheet">
    <div class="setup-top">
      <div class="setup-brand"><img src="./brand/house-108.png" alt="" width="44" height="44"><div><div class="setup-kicker">AmpMap</div><div class="setup-title">Homeowner setup</div></div></div>
      <div class="setup-home"><b>${esc(home.name)}</b>${home.address ? `<br>${esc(home.address)}` : ''}${panel ? `<br><span class="muted">${esc(panel.name)}${panel.location ? ' · ' + esc(panel.location) : ''}</span>` : ''}</div>
    </div>
    <p class="setup-lede">Your electrical panel is mapped: every breaker, outlet and wire. Make it yours in 3 steps:</p>
    <div class="setup-body">
      <div class="setup-qr"><div id="setupQr"></div><span>Scan me</span></div>
      <ol class="setup-steps">
        <li><b>Scan</b> the QR code with your phone camera.</li>
        <li><b>Create</b> your free AmpMap account (or sign in).</li>
        <li><b>Enter</b> this setup code:<div class="setup-code">${esc(prettyClaimCode(priv.code))}</div></li>
      </ol>
    </div>
    <div class="setup-foot">Works once, until ${esc(new Date(toMillis(claim.exp)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}.${claim.fromName ? ` Set up by ${esc(claim.fromName)}.` : ''} Then you control who can edit, with codes you make.</div>
  </div>`;
  app.innerHTML = shell(homeId, 'more', body, { title: 'Homeowner setup page', back: `#/h/${homeId}/access#handoff` });
  bindShell();
  document.getElementById('setupQr').innerHTML = await qrSvg(link);
  document.getElementById('doPrint').onclick = () => window.print();
}

// The homeowner: scan › account › enter the setup code.
function renderClaim(claimId) {
  const demo = store.mode === 'demo';
  app.innerHTML = `
  <header class="topbar"><img class="logo" src="./brand/house-108.png" alt="" aria-hidden="true" width="34" height="34"><div class="topbar-title"><h1>Set up your home</h1></div></header>
  <main class="main share-main">
    <div class="card code-card">
      <h3>Make this home yours</h3>
      <p class="muted">Your electrician mapped this home's panel. Type the code from the setup page they left you.</p>
      ${store.user && store.user.email ? `<p class="tiny muted">Signed in as ${esc(store.user.email)}.</p>` : ''}
      <form id="claimForm" class="form" autocomplete="off">
        <label>Setup code<input name="code" required class="code-input" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="ABCD-2345"></label>
        <label class="check"><input type="checkbox" name="keep" checked> Let the installer keep editing (you can remove them later)</label>
        <button class="btn primary" type="submit">Make it my home</button>
        <p class="err" id="claimErr" role="alert"></p>
        <p class="muted tiny" id="claimStep"></p>
      </form>
      ${demo ? '<p class="tiny muted">Demo: everything stays on this device.</p>' : ''}
    </div>
  </main>`;
  const f = document.getElementById('claimForm');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    const errEl = document.getElementById('claimErr');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Checking...';
    try {
      const res = await store.claimHome(claimId, f.elements.code.value, { keepInstaller: f.elements.keep.checked, onStep: (t) => (document.getElementById('claimStep').textContent = t) });
      setHome(res.homeId);
      toast(`${res.homeName || 'The home'} is yours now`);
      setTimeout(() => go(`#/h/${res.homeId}/access?welcome=1`), 600);
    } catch (ex) {
      btn.disabled = false;
      btn.textContent = 'Make it my home';
      errEl.textContent = codeErrorText(ex);
    }
  };
}

// Owner's panel page: a quiet note when someone else changed things.
async function historyNote(homeId) {
  if (isGuest() || !store.listHistory) return;
  const list = await loadHistory(homeId).catch(() => null);
  const el = document.getElementById('histNote');
  if (!el || !list || !list.length) return;
  const seen = Number(localStorage.getItem('ampmap:histSeen:' + homeId) || 0);
  const fresh = list.filter((e) => e.at > seen && !e.undoneAt);
  if (!fresh.length) return;
  const by = [...new Set(fresh.map((e) => e.by))].slice(0, 2).join(', ');
  el.innerHTML = `<a class="alert info-alert" href="#/h/${homeId}/access#history" id="histLink">✎ ${esc(by)} made ${fresh.length} ${fresh.length === 1 ? 'change' : 'changes'}. See what changed ›</a>`;
  document.getElementById('histLink').onclick = () => localStorage.setItem('ampmap:histSeen:' + homeId, String(Date.now()));
}

// Homes other people let this account edit.
async function sharedWithMeHtml() {
  if (store.mode !== 'cloud' || !store.listMyGrants) return '';
  const gs = await store.listMyGrants();
  if (!gs.length) return '';
  return `<div class="card"><h3>Homes shared with you</h3><ul class="list">${gs.map((g, i) => `<li><span><b>${esc(g.homeName || 'Home')}</b> · you can edit</span><button class="btn small" data-opengrant="${i}">Open</button></li>`).join('')}</ul></div>`;
}

function renderNotFound() {
  const homeId = currentHomeId();
  app.innerHTML = shell(homeId, '', `<div class="card empty"><h2>Not found</h2><p>That item isn't in this account. It may have been deleted, or it belongs to someone else's AmpMap.</p><a class="btn" href="#/">Go to my panel</a></div>`, { title: 'Not found', back: '#/' });
  bindShell();
}

// ---------------------------------------------------------------- login
function renderLogin() {
  const cloud = store.mode === 'cloud';
  app.innerHTML = `
  <div class="auth">
    <img class="auth-logo" src="./brand/badge.png" alt="AmpMap logo" width="116" height="128">
    <h1>AmpMap</h1>
    <p class="muted">Map your breaker panel, every outlet and light, QR stickers and load checks. Free, no ads.</p>
    ${pendingRoute && /^#\/(p|d|b)\//.test(pendingRoute) ? `<div class="alert warn" id="scanBanner">You scanned an AmpMap sticker. Sign in to open it.</div>` : ''}
    ${pendingRoute && /^#\/claim\//.test(pendingRoute) ? `<div class="alert ok-alert" id="claimBanner">Setting up your home: create your free account (choose "Create a free account" below) or sign in. Then enter your setup code.</div>` : ''}
    ${isFirebaseConfigured() ? `
    <form id="authForm" class="card form">
      <label>Email<input type="email" name="email" autocomplete="email" required inputmode="email"></label>
      <label>Password<input type="password" name="pw" autocomplete="current-password" required minlength="6"></label>
      <label>I want to
        <select name="action"><option value="in">Sign in</option><option value="up">Create a free account</option><option value="reset">Reset my password</option></select>
      </label>
      <label class="signup-only" hidden>Account type
        <select name="accountType"><option value="personal">Personal (my own home / RV)</option><option value="pro">Tech / Pro (I service customers)</option></select>
      </label>
      <button class="btn primary" type="submit">Continue</button>
      <p class="err" id="authErr" role="alert"></p>
    </form>` : `<div class="card"><p>Accounts aren't switched on yet for this copy of AmpMap. You can use the demo below; it saves on this device.</p></div>`}
    <button class="btn ghost" id="demoBtn">${cloud ? 'Try the demo without an account' : 'Back to the demo'}</button>
    <p class="tiny muted">Your data is private to your account. No ads, no trackers. <a href="/privacy.html">Privacy Policy</a></p>
  </div>`;
  const f = document.getElementById('authForm');
  if (f) {
    const actionSel = f.elements.action;
    actionSel.onchange = () => {
      f.elements.pw.required = actionSel.value !== 'reset';
      f.elements.pw.autocomplete = actionSel.value === 'up' ? 'new-password' : 'current-password';
      f.querySelector('.signup-only').hidden = actionSel.value !== 'up';
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const err = document.getElementById('authErr');
      err.textContent = '';
      if (!cloud) {
        localStorage.removeItem(MODE_KEY);
        location.hash = '#/';
        location.reload();
        return;
      }
      const email = f.elements.email.value.trim();
      const pw = f.elements.pw.value;
      try {
        if (actionSel.value === 'in') await store.signIn(email, pw);
        else if (actionSel.value === 'up') {
          localStorage.setItem('panelbuddy:pendingType', f.elements.accountType.value);
          await store.signUp(email, pw);
        }
        else {
          await store.resetPassword(email);
          err.textContent = 'Check your email for a reset link.';
        }
      } catch (ex) {
        err.textContent = friendlyAuthError(ex);
      }
    };
  }
  const sb = document.getElementById('scanBanner');
  const pm = pendingRoute && pendingRoute.match(/^#\/p\/([^/?#]+)/);
  if (sb && pm && store.lookupPanelShare)
    store.lookupPanelShare(pm[1]).then((token) => {
      if (token && document.getElementById('scanBanner')) sb.insertAdjacentHTML('afterend', `<a class="btn primary" href="#/share/${token}">View read-only panel directory</a>`);
    });
  document.getElementById('demoBtn').onclick = () => {
    localStorage.setItem(MODE_KEY, 'demo');
    location.hash = '#/';
    location.reload();
  };
}

function friendlyAuthError(ex) {
  const c = (ex && ex.code) || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Email or password is wrong.';
  if (c.includes('email-already-in-use')) return 'That email already has an account. Choose "Sign in".';
  if (c.includes('weak-password')) return 'Password needs at least 6 characters.';
  if (c.includes('invalid-email')) return "That email address doesn't look right.";
  if (c.includes('network')) return 'No internet connection. Try again with signal.';
  if (c.includes('unauthorized-domain')) return 'This web address is not on the Firebase "Authorized domains" list yet.';
  if (c.includes('operation-not-allowed')) return 'Email/password sign-in is not enabled in Firebase yet.';
  return (ex && ex.message) || 'Something went wrong.';
}

function renderFirstHome() {
  app.innerHTML = `<div class="auth"><img class="auth-logo" src="./brand/badge.png" alt="AmpMap logo" width="116" height="128"><h1>Welcome to AmpMap</h1>
  <p class="muted">Start by adding your home. You can add more properties later.</p>
  <a class="btn primary" href="#/edit/homes/new">Add my home</a>
  ${store.mode === 'cloud' ? `<p class="tiny muted">Signed in as ${esc(store.user.email)} · <a href="#" id="so">Sign out</a></p>` : ''}</div>`;
  const so = document.getElementById('so');
  if (so) so.onclick = (e) => { e.preventDefault(); store.signOut(); };
}

// ---------------------------------------------------------------- panel view
function renderPanel(homeId, panelId) {
  const panels = inHome('panels', homeId);
  if (!panels.length) {
    app.innerHTML = shell(homeId, 'panel', `<div class="card empty"><h2>No panel yet</h2><p>Add your main breaker panel to start mapping breakers.</p><a class="btn primary" href="#/edit/panels/new?home=${homeId}">Add a panel</a></div>`);
    return bindShell();
  }
  const panel = panels.find((p) => p.id === panelId) || panels.find((p) => p.type === 'main') || panels[0];
  const breakersAll = inHome('breakers', homeId);
  const breakers = breakersAll.filter((b) => b.panelId === panel.id);
  const devices = inHome('devices', homeId);
  const layout = layoutOf(panel);
  const one = layout === 'one';
  const halfNum = numberingOf(panel) === 'half';
  const three = isThreePhase(panel);
  const home = byId('homes', homeId) || {};
  const rows = halfRows(panel, breakers); // half-space rows per column
  const occ = occupancy(panel, breakers);
  const cells = [];
  const shown = new Set();
  for (const b of sortBreakers(breakers)) {
    const keys = keysFor(b, panel);
    if (!keys.length || shown.has(b.id)) continue;
    shown.add(b.id);
    const [col, start] = keys[0].split(':').map(Number);
    const isHalf = sizeOf(b) === 'half';
    const bt = breakerType(b);
    const sum = sumOf(b);
    const nDev = devices.filter((d) => d.breakerId === b.id).length;
    const dead = devices.some((d) => d.breakerId === b.id && (d.status === 'dead' || d.status === 'repair'));
    const meta = [nDev ? `${nDev} item${nDev > 1 ? 's' : ''}` : '', sum.level !== 'none' ? `${Math.round(sum.pct)}%${sum.allLevel === 'over' ? ' ⚠️' : ''}` : '', three ? '' : b.leg ? `L${esc(b.leg)}` : '', dead ? '<b class="bad">needs fix</b>' : '', b.kind && b.kind !== 'standard' && b.kind !== 'spare' ? esc(b.kind.toUpperCase()) : ''].filter(Boolean).join(' · ');
    const np = polesOf(b);
    const tag = isHalf ? (bt === 'quad' ? 'QUAD' : 'TANDEM') : np === 3 ? '3-POLE' : isTwoPole(b) ? (three ? `${serviceOf(panel).ll}V` : '240V') : '';
    const phs = three ? breakerPhases(b, panel) : [];
    cells.push(`<a class="brk ${isHalf ? 'half ' + (keys.length > 1 ? 'half-mid' : b.half === 'B' ? 'half-b' : 'half-a') : ''} ${np >= 2 ? 'dbl' : ''} ${np === 3 ? 'tri' : ''} ${b.kind === 'spare' ? 'spare' : ''} lvl-${sum.level}" href="#/h/${homeId}/breaker/${b.id}" style="grid-column:${col};grid-row:${start + 1} / span ${keys.length}">
      ${phs.length ? `<span class="ph-tags" aria-label="Phase ${phs.join(' ')}">${phs.map((x) => `<b class="ph ph-${x}">${x}</b>`).join('')}</span>` : ''}
      <span class="brk-slot">${esc(np === 3 ? (() => { const ns = slotsFor(b, panel); return ns.length > 1 ? `${ns[0]}–${ns[ns.length - 1]}` : slotText(b); })() : slotText(b))}</span>
      <span class="brk-handle">${esc(ampsText(b))}</span>
      <span class="brk-label">${esc(b.label || 'Unlabeled')}</span>
      ${isHalf && keys.length === 1 ? '' : `<span class="brk-meta">${tag ? `<b class="tagc ${tag === '240V' ? 'v240' : ''}">${tag}</b>${meta ? ' · ' : ''}` : ''}${meta}</span>`}
    </a>`);
  }
  const cols = one ? [1] : [1, 2];
  for (const col of cols) {
    for (let h = 0; h < rows; h += 2) {
      const a = occ.get(`${col}:${h}`), bb = occ.get(`${col}:${h + 1}`);
      if (!a && !bb) {
        const p = positionSlot(col, h, panel);
        const lbl = positionLabel(col, h, panel);
        const both = halfNum ? `${lbl} & ${positionLabel(col, h + 1, panel)}` : lbl;
        cells.push(`<a class="brk empty-slot" href="#/edit/breakers/new?home=${homeId}&panel=${panel.id}&slot=${p.slot}" style="grid-column:${col};grid-row:${h + 1} / span 2" aria-label="Add breaker in space ${esc(both)}"><span class="brk-slot">${esc(lbl)}</span><span class="brk-label">+ Add${halfNum ? ` <span class="muted">(${esc(both)})</span>` : ''}</span></a>`);
        continue;
      }
      for (const hh of [h, h + 1]) {
        if (occ.get(`${col}:${hh}`)) continue;
        const p = positionSlot(col, hh, panel);
        const lbl = positionLabel(col, hh, panel, true);
        cells.push(`<a class="brk empty-slot half" href="#/edit/breakers/new?home=${homeId}&panel=${panel.id}&slot=${p.slot}&half=${p.half}&btype=tandem" style="grid-column:${col};grid-row:${hh + 1}" aria-label="Add half-size breaker in ${esc(lbl)}"><span class="brk-slot">${esc(lbl)}</span><span class="brk-label">+ Add half</span></a>`);
      }
    }
  }
  const over = breakers.filter((b) => sumOf(b).level === 'over').length;
  const warn = breakers.filter((b) => sumOf(b).level === 'warn').length;
  const peakOver = breakers.filter((b) => { const s = sumOf(b); return s.level !== 'over' && s.allLevel === 'over'; }).length;
  const clashes = panelClashes(panel, breakers);
  const body = `<div id="histNote"></div>
  ${searchBarHtml(homeId)}
  <section class="panel-head">
    <div>
      ${panels.length > 1 ? `<label class="sr-only" for="panelPick">Panel</label><select id="panelPick" class="panel-pick">${panels.map((p) => `<option value="${p.id}" ${p.id === panel.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : `<h2>${esc(panel.name)}</h2>`}
      <p class="muted">${esc(panel.type === 'main' && isCommercial(home, panel) ? 'Main panel' : labelOf(PANEL_TYPES, panel.type))}${panel.mainAmps ? ` · ${esc(mainAmpsText(panel))}A main` : ''}${three ? ` · ${esc(serviceOf(panel).short)}` : ''}${panel.type === 'rv' && panel.shorePower ? ` · ${esc(shoreText(panel))} shore power` : ''}${sourceText(panel) && !feedParent(panel, panels) ? ` · Power from: ${esc(sourceText(panel))}` : ''} · ${breakers.length} breakers${panel.location ? ` · ${esc(panel.location)}` : ''}</p>
    </div>
    <div class="head-actions">
      <a class="btn small" href="#/edit/panels/${panel.id}?home=${homeId}">Edit</a>
    </div>
  </section>
  ${feedText(panel, panels, breakersAll) ? `<a class="feed-line" href="#/h/${homeId}/tree"><span aria-hidden="true">↳</span> ${esc(feedText(panel, panels, breakersAll, (x) => slotLabel(x, panelOf(x) || 'two')))}</a>` : ''}
  ${panelExtrasText(panel).length ? `<div class="chips extras-chips">${panelExtrasText(panel).map((t) => `<a class="chip" href="#/edit/panels/${panel.id}?home=${homeId}#more">${esc(t)}</a>`).join('')}</div>` : ''}
  ${(() => { const h = byId('homes', homeId); const c = h && h.customerId && byId('customers', h.customerId); return c ? `<a class="breaker-link" href="#/customers/${c.id}"><span class="big-icon sm" aria-hidden="true">👤</span><span><b>${esc(c.name)}</b><span class="muted">${c.lastServiced ? 'Last serviced ' + esc(c.lastServiced) : 'No visits logged'} · ${(c.visits || []).length} service note${(c.visits || []).length === 1 ? '' : 's'}</span></span><span aria-hidden="true">›</span></a>` : ''; })()}
  ${over || warn ? `<a class="alert ${over ? 'over' : 'warn'}" href="#/h/${homeId}/load">${over ? `${over} circuit${over > 1 ? 's' : ''} over 100%` : ''}${over && warn ? ' · ' : ''}${warn ? `${warn} at 80%+` : ''} typical - see Load check</a>` : ''}
  ${peakOver ? `<a class="peak-note" href="#/h/${homeId}/load">⚠️ ${peakOver} circuit${peakOver > 1 ? 's' : ''} could trip if everything runs at once</a>` : ''}
  ${clashes.length ? `<div class="card clash-card"><h3>⚠️ ${clashes.length === 1 ? 'Two breakers share a spot' : `${clashes.length} spots are shared`}</h3><ul class="list">${clashes.map(([a, b2]) => `<li class="clash-row"><span><b>${esc(stickerText(a, panel))}</b> and <b>${esc(stickerText(b2, panel))}</b> overlap.${canJoinTandem(a, b2, panel) ? ' One breaker with 2 switches?' : ''}</span>${canJoinTandem(a, b2, panel) ? `<button type="button" class="btn small primary" data-join="${esc(a.id)}|${esc(b2.id)}">Make it a tandem</button>` : `<a class="btn small" href="#/edit/breakers/${b2.id}?home=${homeId}">Fix ${esc(slotLabel(b2, panel))}</a>`}</li>`).join('')}</ul></div>` : ''}
  <div class="panel-box">
    <div class="panel-main">${panel.type === 'rv' ? '120V AC · ' : ''}MAIN ${esc(mainAmpsText(panel))}${panel.mainAmps ? 'A' : ''}${three ? ` · ${esc(serviceOf(panel).short)}` : ''}</div>
    <div class="panel-grid halfrows ${one ? 'one' : ''}" style="grid-template-rows:repeat(${rows}, minmax(30px, auto))">${cells.join('')}</div>
  </div>
  ${panel.type === 'rv' || one ? '' : halfNum ? `<p class="tiny muted numbering-note">Numbered 2 per row, like a tandem-ready sticker (1/3, 5/7…). <a href="#/edit/panels/${panel.id}?home=${homeId}">Change</a></p>` : `<p class="tiny muted numbering-note">Does your panel sticker say 1/3, 5/7… (2 numbers per row)? <a href="#/edit/panels/${panel.id}?home=${homeId}">Switch to 2 numbers per row</a></p>`}
  <div class="row-actions">
    <a class="btn primary" href="#/h/${homeId}/quick?panel=${panel.id}">⚡ Quick panel</a>
    <a class="btn" href="#/edit/breakers/new?home=${homeId}&panel=${panel.id}">+ Breaker</a>
    ${panel.type === 'rv' ? '' : `<a class="btn" href="#/h/${homeId}/bulk?panel=${panel.id}">+ Several at once</a>`}
    <a class="btn" href="#/edit/panels/new?home=${homeId}">+ Panel</a>
    ${panels.length > 1 || isCommercial(home, panel) ? `<a class="btn" href="#/h/${homeId}/tree">🔀 What feeds what</a>` : ''}
    <a class="btn" href="#/h/${homeId}/print/directory/${panel.id}">Print schedule</a>
    <a class="btn" href="#/h/${homeId}/sticker">Print panel sticker</a>
    ${isGuest() ? '' : `<a class="btn" href="#/h/${homeId}/access">🔑 Who can edit</a>`}
  </div>
  <div class="legend"><span class="dot lvl-ok"></span>under 80% <span class="dot lvl-warn"></span>80%+ <span class="dot lvl-over"></span>over 100% <span class="dot lvl-none"></span>no loads listed <span class="muted">· colors = Typical, ⚠️ = Peak over 100%</span></div>
  ${breakers.some((b) => sizeOf(b) === 'half') ? '<p class="tiny muted legend-note">Half-height blocks are tandems: 1 breaker, 2 switches, each its own circuit. Tall blue-edged blocks are double-pole 240V: 1 circuit.</p>' : ''}
  ${three ? phaseCard(panel, breakers) : ''}
  ${shoreCard(panel, breakers, homeId)}
  ${panel.type === 'rv' || (panel.fuses || []).length ? fuseCard(panel) : ''}
  <div id="panelExtra"></div>`;
  app.innerHTML = shell(homeId, 'panel', body);
  bindShell();
  bindSearchBar(homeId);
  historyNote(homeId);
  const pp = document.getElementById('panelPick');
  if (pp) pp.onchange = () => go(`#/h/${homeId}/panel/${pp.value}`);
  bindFuses(panel);
  // two full-size singles saved in the same row -> one tandem (one breaker, 2 switches)
  app.querySelectorAll('[data-join]').forEach((btn) => (btn.onclick = async () => {
    const [x, y] = btn.dataset.join.split('|').map((bid) => byId('breakers', bid));
    if (!x || !y) return;
    const g = 'g_' + uid();
    const [top, bot] = sortBreakers([x, y]);
    const sameNum = parseInt(top.slot, 10) === parseInt(bot.slot, 10);
    await store.put('breakers', { ...top, size: 'half', btype: 'tandem', groupId: g, half: 'A', poles: '1' });
    await store.put('breakers', { ...bot, size: 'half', btype: 'tandem', groupId: g, half: 'B', poles: '1', slot: sameNum && numberingOf(panel) === 'half' ? String(parseInt(top.slot, 10) + stepOfPanel(panel)) : bot.slot });
    toast('Saved as one tandem breaker');
  }));
  renderPanelExtra(homeId, panel);
  maybeTour(homeId, 'panel');
}

const stepOfPanel = (p) => (layoutOf(p) === 'one' ? 1 : 2);
// Pairs of breakers on a panel that fill the same spot (shown so they can be fixed).
function panelClashes(panel, breakers) {
  const out = [];
  const list = sortBreakers(breakers);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.groupId && a.groupId === b.groupId) continue;
      if (overlaps(a, b, panel)) out.push([a, b]);
    }
  return out.slice(0, 8);
}
// Two plain single (full-size, 1-pole) breakers in the same row -> offer "Make it a tandem".
function canJoinTandem(a, b, panel) {
  const plain = (x) => sizeOf(x) === 'full' && polesOf(x) === 1;
  if (!plain(a) || !plain(b)) return false;
  const ka = keysFor(a, panel), kb = keysFor(b, panel);
  return ka.length === kb.length && ka.every((k) => kb.includes(k));
}

const mainAmpsText = (p) => (p.mainAmps === 'other' ? p.mainAmpsOther || '' : p.mainAmps || '');
const shoreText = (p) => (p.shorePower === 'other' ? `${p.shorePowerOther || '?'}A` : p.shorePower === 'pole' ? `Power pole ${mainAmpsText(p)}A` : labelOf(SHORE_POWER_OPTIONS, p.shorePower).split(' (')[0]);
const sourceAmpsText = (p) => (['pole', 'pedestal', 'house_meter'].includes(p.powerSource) ? (p.sourceAmps === 'other' ? p.sourceAmpsOther : p.sourceAmps) : '');
const sourceText = (p) => (p.type !== 'rv' && p.powerSource ? labelOf(POWER_SOURCE_OPTIONS, p.powerSource).split(' (')[0] + (sourceAmpsText(p) ? ` (${sourceAmpsText(p)}A main)` : '') : '');

function shoreCard(panel, breakers, homeId, link = false) {
  if (panel.type !== 'rv') return '';
  const sum = shoreSummary(panel, breakers, D().devices, { mode: 'main' });
  if (!sum) return `<div class="card"><h3>Shore power check</h3><p class="muted">Pick the shore power service in <a href="#/edit/panels/${panel.id}?home=${homeId}">Edit panel</a> to compare your loads to it.</p></div>`;
  return `<div class="card shore">
    <h3>${link ? `<a href="#/h/${homeId}/panel/${panel.id}">${esc(panel.name)}</a>: ` : ''}Shore power check (${esc(shoreText(panel))})</h3>
    ${sum.legs.map((l) => `<div class="load-num">${sum.legs.length > 1 ? `<span class="muted">${l.name}:</span> ` : ''}<b>${fmtAmps(l.amps)}A</b> of ${l.cap}A <span class="pct ${l.level}">${l.level === 'none' ? '' : Math.round(l.pct) + '%'}</span></div>${l.level !== 'none' ? loadBar({ ...l, rating: l.cap }) : ''}`).join('')}
    ${sum.unassigned ? `<p class="tiny warnc">${fmtAmps(sum.unassigned)}A of loads are on breakers with no leg picked. Set the leg on those breakers.</p>` : ''}
    <p class="tiny muted">If everything listed on this panel runs at once. ${sum.legs.length > 1 ? '50A service = 50A on each leg. ' : ''}Over 100% means expect the main or the pedestal breaker to trip.</p>
  </div>`;
}

function fuseCard(panel) {
  const fuses = panel.fuses || [];
  return `<div class="card" id="fuses">
    <h3>12V DC fuses (${fuses.length})</h3>
    ${fuses.length ? `<ul class="list">${fuses.map((f, i) => `<li class="load-row"><button class="fuse-row" data-edit-fuse="${i}"><span class="fuse-num">${esc(f.num || i + 1)}</span><span class="row-main"><b>${esc(f.powers || 'Fuse')}</b><span class="muted">${esc(f.amps === 'other' ? f.ampsOther || '?' : f.amps)}A${f.notes ? ' · ' + esc(f.notes) : ''}</span></span></button><button class="icon-btn small" data-del-fuse="${i}" aria-label="Remove fuse ${esc(f.num || i + 1)}">✕</button></li>`).join('')}</ul>` : '<p class="muted">No fuses listed yet.</p>'}
    <form id="fuseForm" class="form inline-form">
      <input type="hidden" name="index" value="">
      <div class="two">
        <label>Fuse #<input name="num" inputmode="numeric" value="${fuses.length + 1}"></label>
        <label>Amps<select name="amps">${opt(FUSE_AMP_OPTIONS, '15')}</select></label>
      </div>
      <label class="other-field" hidden>Amps (other)<input name="ampsOther" type="number" inputmode="decimal" step="0.5"></label>
      <label>What it powers<select name="powers">${opt(FUSE_USES, 'Interior lights')}</select></label>
      <label class="other-field" hidden>Describe it<input name="powersOther" placeholder="e.g. Bunkhouse lights"></label>
      <label>Notes<input name="notes" placeholder="optional"></label>
      <button class="btn primary" type="submit" id="fuseSubmit">Add fuse</button>
    </form>
  </div>`;
}

function bindFuses(panel) {
  const f = document.getElementById('fuseForm');
  if (!f) return;
  const toggle = () => {
    f.elements.ampsOther.closest('label').hidden = f.elements.amps.value !== 'other';
    f.elements.powersOther.closest('label').hidden = f.elements.powers.value !== 'Other';
  };
  f.elements.amps.onchange = toggle;
  f.elements.powers.onchange = toggle;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fuses = [...(panel.fuses || [])];
    const powers = f.elements.powers.value === 'Other' ? f.elements.powersOther.value.trim() || 'Other' : f.elements.powers.value;
    const item = { num: f.elements.num.value.trim(), amps: f.elements.amps.value, ampsOther: f.elements.ampsOther.value, powers, notes: f.elements.notes.value.trim() };
    const idx = f.elements.index.value;
    if (idx !== '') fuses[Number(idx)] = item;
    else fuses.push(item);
    fuses.sort((a, b) => (parseFloat(a.num) || 999) - (parseFloat(b.num) || 999));
    await store.put('panels', { ...panel, fuses });
    toast(idx !== '' ? 'Fuse updated' : 'Fuse added');
  };
  document.querySelectorAll('[data-edit-fuse]').forEach((btn) => {
    btn.onclick = () => {
      const i = Number(btn.dataset.editFuse);
      const fu = panel.fuses[i];
      f.elements.index.value = i;
      f.elements.num.value = fu.num || '';
      f.elements.amps.value = FUSE_AMP_OPTIONS.includes(fu.amps) ? fu.amps : 'other';
      f.elements.ampsOther.value = fu.ampsOther || (FUSE_AMP_OPTIONS.includes(fu.amps) ? '' : fu.amps);
      const known = FUSE_USES.includes(fu.powers);
      f.elements.powers.value = known ? fu.powers : 'Other';
      f.elements.powersOther.value = known ? '' : fu.powers;
      f.elements.notes.value = fu.notes || '';
      document.getElementById('fuseSubmit').textContent = `Update fuse ${fu.num || i + 1}`;
      toggle();
      f.scrollIntoView({ block: 'center' });
    };
  });
  document.querySelectorAll('[data-del-fuse]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Remove this fuse?')) return;
      const fuses = [...(panel.fuses || [])];
      fuses.splice(Number(btn.dataset.delFuse), 1);
      await store.put('panels', { ...panel, fuses });
    };
  });
}

async function renderPanelExtra(homeId, panel) {
  const el = document.getElementById('panelExtra');
  if (!el) return;
  const svg = await qrSvg(deepLink(`/p/${panel.id}`));
  const photo = panel.photoId ? await store.getPhoto(panel.photoId) : null;
  if (!document.getElementById('panelExtra')) return;
  el.innerHTML = `
    ${photo ? `<div class="card"><h3>Panel photo</h3><img class="photo" src="${photo}" alt="Photo of ${esc(panel.name)}"></div>` : ''}
    ${panel.notes ? `<div class="card"><h3>Notes</h3><p class="pre">${esc(panel.notes)}</p></div>` : ''}
    ${panel.type === 'rv' ? '' : panelDetailsCard(homeId, panel)}
    ${panel.type === 'rv' ? '' : runsCard(panel)}
    <div class="card qr-card"><div class="qr">${svg}</div><div><h3>Panel QR code</h3><p class="muted">Stick it on the panel door. Scanning it opens this panel.</p><a class="btn small" href="#/h/${homeId}/print/qr?only=panel:${panel.id}">Print sticker</a></div></div>`;
  bindRuns(panel);
}

// ---------------------------------------------------------------- pro: phases, panel details, wire runs, feed tree, tour
function phaseCard(panel, breakers) {
  const t = phaseTotals(panel, breakers, (b) => sumOf(b).amps || 0);
  const main = mainAmpsNum(panel);
  const top = Math.max(...t.rows.map((r) => r.loadAmps), 1); // bars compare the phases to each other
  const big = main ? Math.max(...t.rows.map((r) => r.loadAmps)) >= main * 0.1 : true;
  return `<div class="card phase-card">
    <h3>Load per phase <span class="muted tiny">for info</span></h3>
    ${t.rows.map((r) => `<div class="ph-row"><b class="ph ph-${r.phase}">${r.phase}</b><span class="ph-bar"><i style="width:${Math.min(100, (r.loadAmps / top) * 100).toFixed(1)}%"></i></span><span class="ph-num"><b>${fmtAmps(r.loadAmps)}A</b> listed<small class="muted block">${r.count} breaker pole${r.count === 1 ? '' : 's'} · ${Math.round(r.breakerAmps).toLocaleString('en-US')}A of breakers</small></span></div>`).join('')}
    <p class="tiny muted">Adds up what's listed on each breaker, by phase.${main ? ` Main is ${main.toLocaleString('en-US')}A per phase.` : ''}${t.imbalance >= 20 && big ? ` <b class="warnc">Phases differ by ${t.imbalance}%</b>: moving a few circuits can even it out.` : ''}</p>
  </div>`;
}

function panelDetailsCard(homeId, panel) {
  const gen = generatorText(panel);
  const gr = groundingText(panel);
  const spd = panel.spd === 'yes' ? 'Yes' : panel.spd === 'no' ? 'No' : '';
  const edit = `#/edit/panels/${panel.id}?home=${homeId}#more`;
  if (!gen && !gr && !spd && panel.genHookup !== 'none')
    return `<a class="card details-empty" href="${edit}"><span><b>Generator, surge protector, grounding</b><span class="muted tiny block">Optional. Tap to add.</span></span><span class="chev" aria-hidden="true">›</span></a>`;
  return `<div class="card panel-details"><div class="pd-head"><h3>Panel details</h3><a class="btn small" href="${edit}">Edit</a></div>
    <dl class="facts">
      <dt>Generator hookup</dt><dd>${esc(gen || (panel.genHookup === 'none' ? 'None' : 'Not set'))}</dd>
      <dt>Surge protector</dt><dd>${esc(spd || 'Not set')}</dd>
      ${gr ? `<dt>Grounding</dt><dd>${esc(gr)}</dd>` : ''}
    </dl></div>`;
}

const RUN_WIRES = ['14/2', '12/2', '12/3', '10/2', '10/3', '8/3', '6/3', '#4', '#2', '1/0', '4/0', 'other'];
function runsCard(panel) {
  const runs = (panel.runs || []).map(cleanRun).filter(Boolean);
  const places = [...new Set([...inHome('panels', panel.homeId).map((p) => p.name), ...inHome('devices', panel.homeId).map((d) => d.room)].filter(Boolean))];
  return `<details class="card runs-card" id="runs" ${runs.length ? 'open' : ''}><summary><b>Wire runs${runs.length ? ` (${runs.length})` : ''}</b><span class="muted tiny">Optional · from → to, wire, conduit</span></summary>
    ${runs.length ? `<ul class="list">${runs.map((r) => `<li class="run-row"><span class="row-main"><b>${esc(r.from || '?')} → ${esc(r.to || '?')}</b><span class="muted">${esc(runText(r) || 'wire not set')}</span></span><button class="icon-btn small" data-del-run="${esc(r.id)}" aria-label="Remove run">✕</button></li>`).join('')}</ul>` : ''}
    <form id="runForm" class="form run-form">
      <datalist id="runPlaces">${places.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
      <div class="two"><label>From<input name="from" list="runPlaces" value="${esc(panel.name || '')}"></label><label>To<input name="to" list="runPlaces" placeholder="e.g. LP-1, Garage"></label></div>
      <span class="field-name">Wire</span>${chipsHtml('wire', RUN_WIRES, '', { label: 'Wire' })}
      <label class="other-field" hidden>Wire (type it)<input name="wireOther" placeholder="e.g. 3 sets 500 kcmil"></label>
      <span class="field-name">Conduit</span>${chipsHtml('conduit', CONDUIT_OPTIONS, '', { label: 'Conduit' })}
      <button class="btn primary" type="submit">Add wire run</button>
    </form></details>`;
}
function bindRuns(panel) {
  const f = document.getElementById('runForm');
  if (!f) return;
  bindChipClear(f);
  f.querySelectorAll('input[name=wire]').forEach((r) => r.addEventListener('change', () => (f.elements.wireOther.closest('label').hidden = f.elements.wire.value !== 'other')));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());
    const run = cleanRun({ from: v.from, to: v.to, wire: v.wire === 'other' ? v.wireOther : v.wire || '', conduit: v.conduit || '' });
    if (!run) return toast('Add where it goes from or to');
    await store.put('panels', { ...panel, runs: [...(panel.runs || []), run] });
    toast('Wire run added');
  };
  document.querySelectorAll('[data-del-run]').forEach((btn) => (btn.onclick = async () => {
    if (!confirm('Remove this wire run?')) return;
    await store.put('panels', { ...panel, runs: (panel.runs || []).filter((r) => r.id !== btn.dataset.delRun) });
  }));
}

function renderTree(homeId) {
  const panels = inHome('panels', homeId);
  const breakers = inHome('breakers', homeId);
  const rows = feedRows(panels);
  const lab = (b) => slotLabel(b, panelOf(b) || 'two');
  const body = `<section class="panel-head"><div><h2>What feeds what</h2><p class="muted">${panels.length} panel${panels.length === 1 ? '' : 's'} · tap one to open it</p></div></section>
  <div class="card tree-card"><ul class="tree">${rows.map(({ panel: p, depth, parent }) => {
    const b = p.fedBreaker ? breakers.find((x) => x.id === p.fedBreaker) : null;
    const sub = [mainAmpsText(p) ? `${mainAmpsText(p)}A` : '', isThreePhase(p) ? serviceOf(p).short : p.type !== 'rv' ? '120/240V' : '', `${breakers.filter((x) => x.panelId === p.id).length} breakers`].filter(Boolean).join(' · ');
    const via = parent ? [b ? `breaker ${lab(b)}${b.amps ? ` (${b.amps === 'other' ? b.ampsOther : b.amps}A)` : ''}` : '', feederText(p)].filter(Boolean).join(' · ') : '';
    return `<li class="tree-row" style="--d:${depth}">${depth ? '<span class="tree-elbow" aria-hidden="true"></span>' : ''}<a class="tree-node ${depth ? '' : 'root'}" href="#/h/${homeId}/panel/${p.id}"><b>${esc(p.name || 'Panel')}</b><span class="muted tiny block">${esc(sub)}</span>${via ? `<span class="tree-via">fed by ${esc(via)}</span>` : ''}</a></li>`;
  }).join('')}</ul>
  <p class="tiny muted">Set what feeds a panel in Edit panel › More details › Fed from.</p></div>
  <div class="row-actions"><a class="btn" href="#/edit/panels/new?home=${homeId}">+ Panel</a></div>`;
  app.innerHTML = shell(homeId, 'panel', body, { title: 'What feeds what', back: `#/h/${homeId}/panel` });
  bindShell();
}

// one-time 3-step welcome (skippable; never again once closed). ?tour=1 shows it again.
function maybeTour(homeId, view) {
  let seen = false;
  try { seen = localStorage.getItem(TOUR_KEY) === '1'; } catch {}
  const force = /[?&]tour=1/.test(location.search) && !sessionStorage.getItem('ampmap:tourForced');
  if (!shouldShowTour({ seen, guest: isGuest(), hasHome: !!homeId, view, force })) return;
  if (document.getElementById('tour')) return;
  if (force) sessionStorage.setItem('ampmap:tourForced', '1');
  let i = 0;
  const el = document.createElement('div');
  el.id = 'tour';
  el.className = 'tour';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  const done = () => { try { localStorage.setItem(TOUR_KEY, '1'); } catch {} el.remove(); };
  const draw = () => {
    const s = TOUR_STEPS[i];
    el.innerHTML = `<div class="tour-card"><button class="tour-skip" type="button" data-t="skip">Skip</button>
      <div class="tour-ic" aria-hidden="true">${s.icon}</div><p class="tour-step">Step ${i + 1} of ${TOUR_STEPS.length}</p><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p>
      <div class="tour-dots" aria-hidden="true">${TOUR_STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tour-btns">${i ? '<button class="btn ghost" type="button" data-t="back">Back</button>' : ''}<button class="btn primary" type="button" data-t="next">${i === TOUR_STEPS.length - 1 ? 'Got it' : 'Next'}</button></div></div>`;
    el.querySelector('[data-t=skip]').onclick = done;
    el.querySelector('[data-t=next]').onclick = () => { if (i === TOUR_STEPS.length - 1) return done(); i++; draw(); };
    const bk = el.querySelector('[data-t=back]');
    if (bk) bk.onclick = () => { i--; draw(); };
  };
  draw();
  document.body.appendChild(el);
  el.querySelector('[data-t=next]').focus();
}

// ---------------------------------------------------------------- breaker view
// ---------------------------------------------------------------- "what's plugged in" helpers
// One load: name (tap = edit) · how much it's on · small "Right now" chip · typical watts · Move · Remove.
// ref = loadRef(kind, id, index).
const NOW_TEXT = { auto: 'typical', on: 'on', off: 'off' };
const useShort = (id) => ({ always: 'Always', cycles: 'Cycles', hours: 'Few hrs/day', sometimes: 'Now & then' }[id] || useLabel(id));
const wNum = (w) => (w > 0 && w < 10 ? String(Math.round(w * 10) / 10) : Math.round(w).toLocaleString('en-US'));
function loadRow(l, ref, homeId, { sub = false } = {}) {
  const q = Number(l.qty) || 1;
  const h = habitOf(l);
  const now = nowState(l);
  const main = loadReading(l, 'main');
  const nm = esc(l.name);
  return `<li class="item-row now-${now}">
    <span class="item-main"><a class="item-name" href="#/h/${homeId}/item?ref=${encodeURIComponent(ref)}" aria-label="Edit ${nm}">${sub ? `<span>${nm}` : `<b>${nm}`}${q > 1 ? ` <span class="muted">×${esc(l.qty)}</span>` : ''}${l.portable ? ' <span class="tag-portable">portable</span>' : ''}${sub ? '</span>' : '</b>'}</a>
      <span class="item-sub"><a class="use-pill ${h.use}" href="#/h/${homeId}/item?ref=${encodeURIComponent(ref)}">${esc(useShort(h.use))}</a>${now !== 'auto' ? `<span class="now-tag ${now}">${now === 'on' ? 'On now' : 'Off now'}</span>` : ''}${l.note ? `<span class="muted tiny">${esc(l.note)}</span>` : ''}</span></span>
    <span class="item-w"><b>${wNum(main)}W</b><small>of ${wattsText(h.run * q)}</small></span>
    <button type="button" class="now-btn ${now}" data-now="${esc(ref)}" aria-label="Right now: ${now === 'auto' ? 'typical' : now}. Tap for ${now === 'auto' ? 'on now' : now === 'on' ? 'off now' : 'typical'}" title="Right now: ${NOW_TEXT[now]}">⏻</button>
    <a class="icon-btn small move-btn" href="#/h/${homeId}/move?from=${encodeURIComponent(ref)}" aria-label="Move ${nm} to another outlet or breaker">⇄</a>
    <button type="button" class="icon-btn small" data-del-ref="${esc(ref)}" aria-label="Remove ${nm}">✕</button>
  </li>`;
}

async function saveUpdates(list) {
  for (const u of list || []) if (u) await store.put(u.col, u.obj);
}

// Delegated once: on/off switches, remove, all on / all off. Works on every screen.
function bindLoadActions() {
  app.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-toggle],[data-del-ref],[data-all-on],[data-now],[data-clear-now]');
    if (!t || !store) return;
    e.preventDefault();
    if (t.dataset.now) {
      const u = setNow(D(), t.dataset.now);
      if (u) {
        await saveUpdates([u]);
        const r = parseRef(t.dataset.now);
        const st = nowState(u.obj[r.field][r.index]);
        toast(st === 'auto' ? 'Back to typical' : `Right now: ${st} (resets in ${NOW_HOURS} hrs)`);
      }
    } else if (t.dataset.clearNow) {
      await saveUpdates(clearNow(D(), t.dataset.clearNow));
      toast('Back to typical');
    } else if (t.dataset.toggle) {
      const u = toggleLoad(D(), t.dataset.toggle);
      if (u) await saveUpdates([u]);
    } else if (t.dataset.delRef) {
      const r = parseRef(t.dataset.delRef);
      const c = r && byId(r.col, r.id);
      if (!c) return;
      const list = [...(c[r.field] || [])];
      list.splice(r.index, 1);
      await store.put(r.col, { ...c, [r.field]: list });
    } else if (t.dataset.allOn) {
      const [bid, v] = t.dataset.allOn.split('|');
      await saveUpdates(setAllOn(D(), bid, v === 'on'));
      toast(v === 'on' ? 'All on' : 'All off');
    }
  });
}

const DEFAULT_USE_ADD = 'hours';
function addItemForm(id, { targets = null, button = 'Add' } = {}) {
  return `<form id="${id}" class="form add-item">
    ${targets ? `<label>Plugged into<select name="target">${targets}</select></label>` : ''}
    <label>What is it?
      <select name="preset"><option value="">Choose a common item...</option>${LOAD_PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)} (~${p.watts}W)</option>`).join('')}<option value="custom">Something else (type it)</option></select>
    </label>
    <div class="two">
      <label>Name<input name="name" placeholder="e.g. Space heater" autocomplete="off" list="${id}-catalog"></label>
      <label>Watts running<input name="watts" type="number" inputmode="numeric" min="0" step="1" placeholder="1500"></label>
    </div>
    <datalist id="${id}-catalog">${CATALOG.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
    <div class="prefill-note" hidden></div>
    <details class="watts-help">
      <summary>❓ Don't know the watts? Find it, or enter amps</summary>
      <div class="wh-body">
        <p><b>1. Look for the label.</b> Most things have a sticker or stamped plate on the back, bottom, or inside the door (fridge, microwave, washer). Look for a number with <b>W</b> or <b>Watts</b>, like "1500W".</p>
        <p><b>2. Only amps listed?</b> Multiply volts × amps. A label that says "120V 5A" is about 600W. Use the calculator below.</p>
        <p><b>3. Chargers and power bricks:</b> read the <b>Input</b> line (like "100-240V 1.5A"), not the Output line. Use 120 for volts.</p>
        <p><b>4. No label?</b> Search the model number online with "watts", or check the manual. <a class="lookup-link" data-lookup href="https://www.google.com/search?q=watts" target="_blank" rel="noopener">🔎 Look it up online</a></p>
        <p><b>5. Most accurate:</b> a plug-in watt meter (Kill A Watt style) shows what it really pulls. Plug it in between the outlet and the item.</p>
        <p class="tiny muted">The label is the most it can draw. Heaters, microwaves, hair dryers, and toasters really do pull close to their label. TVs and computers usually pull less.</p>
        <div class="two wh-calc">
          <label>Volts<input name="wvolts" type="number" inputmode="decimal" value="120"></label>
          <label>Amps<input name="wamps" type="number" inputmode="decimal" step="0.1" placeholder="5"></label>
        </div>
        <button type="button" class="btn full" data-wcalc>Use volts × amps as the watts</button>
        <p class="tiny muted">Typing the amps fills in the watts for you (amps × 120, or × 240 for a 240V item).</p>
      </div>
    </details>
    ${usePickHtml(DEFAULT_USE_ADD, false)}
    <div class="two">
      <label>Watts idle <span class="muted">(optional)</span><input name="idleW" type="number" inputmode="decimal" min="0" step="any" placeholder="estimate"></label>
      <label>How many<select name="qty">${opt(['1', '2', '3', '4', '5', '6', '8', '10'], '1')}</select></label>
    </div>
    <label>Note <span class="muted">(optional)</span><input name="note" placeholder="e.g. on a power strip" autocomplete="off"></label>
    <label class="check-line"><input type="checkbox" name="portable"> Moves around (portable)</label>
    <button class="btn primary full" type="submit">${esc(button)}</button>
    <p class="tiny muted">${esc(PRESET_NOTE)}</p>
  </form>`;
}

function bindAddItemForm(f, onAdd) {
  if (!f) return;
  // "How much is it on?" + idle: picked from the name (estimate) until the user taps one.
  const syncCards = () => f.querySelectorAll('.use-pick .pick-card').forEach((c) => c.classList.toggle('on', c.querySelector('input').checked));
  const guessFromName = () => {
    const g = guessHabit(f.elements.name.value);
    if (!f.dataset.useTouched) {
      const r = f.querySelector(`input[name="use"][value="${g.use}"]`);
      if (r) r.checked = true;
      syncCards();
    }
    if (f.elements.idleW) f.elements.idleW.placeholder = `~${g.idle}W (estimate)`;
  };
  f.querySelectorAll('input[name="use"]').forEach((x) => x.addEventListener('change', () => { f.dataset.useTouched = '1'; syncCards(); }));
  f.elements.name.addEventListener('input', guessFromName);
  f.elements.name.addEventListener('change', guessFromName);
  f.elements.preset.addEventListener('change', guessFromName);
  if (f.elements.name.value) guessFromName();
  f.elements.preset.onchange = () => {
    const v = f.elements.preset.value;
    if (v !== '' && v !== 'custom') {
      f.elements.name.value = LOAD_PRESETS[v].name;
      f.elements.watts.value = LOAD_PRESETS[v].watts;
    } else if (v === 'custom') {
      f.elements.name.value = '';
      f.elements.watts.value = '';
      f.elements.name.focus();
    }
  };
  // typing a name that's in the device catalog fills in its typical watts
  f.elements.name.addEventListener('change', () => {
    const c = CATALOG.find((x) => x.name.toLowerCase() === f.elements.name.value.trim().toLowerCase());
    if (c && (!f.elements.watts.value || f.dataset.autoWatts === f.elements.watts.value)) {
      f.elements.watts.value = c.typical;
      f.dataset.autoWatts = String(c.typical);
      if (f.elements.wvolts) f.elements.wvolts.value = c.volts;
      toast(`Typical ${c.name}: ~${c.typical}W`);
    }
  });
  const lk = f.querySelector('[data-lookup]');
  if (lk) lk.onclick = () => { lk.href = lookupUrl(f.elements.name.value.trim() || 'appliance'); };
  if (f.elements.wamps) f.elements.wamps.addEventListener('input', () => {
    const w = wattsFromAmps(f.elements.wamps.value, f.elements.wvolts.value);
    if (w) f.elements.watts.value = w;
  });
  const wc = f.querySelector('[data-wcalc]');
  if (wc) wc.onclick = () => {
    const v = Number(f.elements.wvolts.value) || 120;
    const a = Number(f.elements.wamps.value);
    if (!(a > 0)) return toast('Enter the amps from the label');
    f.elements.watts.value = Math.round(v * a);
    toast(`${Math.round(v * a)}W`);
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const name = f.elements.name.value.trim();
    const watts = Number(f.elements.watts.value);
    if (!name || !(watts > 0)) return toast('Add a name and watts');
    const item = { name, watts, qty: Number(f.elements.qty.value) || 1 };
    const note = f.elements.note.value.trim();
    if (note) item.note = note;
    if (f.elements.portable && f.elements.portable.checked) item.portable = true;
    const useV = (f.querySelector('input[name="use"]:checked') || {}).value;
    if (useV && f.dataset.useTouched) item.use = useV;
    if (f.elements.idleW && f.elements.idleW.value !== '') item.idleW = Math.max(0, Number(f.elements.idleW.value) || 0);
    await onAdd(item, f.elements.target ? f.elements.target.value : '');
    toast('Added');
  };
}

// "Peak 92% ⚠️" - everything running at once.
const warnIcon = (lvl) => (lvl === 'over' || lvl === 'warn' ? ' ⚠️' : '');
function maxLine(s, cls = 'max-line') {
  if (!s.allWatts || !s.rating) return '';
  return `<span class="${cls}">Peak if all running <b class="pct-inline ${s.allLevel}">${Math.round(s.allPct)}%</b>${warnIcon(s.allLevel)}</span>`;
}

function loadHeadline(s, breakerId = '') {
  if (!s.rating) return `<p class="muted">Set the breaker's amps to see the load check.</p>`;
  if (!s.loadCount) return `<p class="muted">Nothing listed yet. Add what's plugged in to see Typical, Idle and Peak.</p>`;
  return `<div class="using-now">${s.overrides ? `Right now <span class="muted">· ${s.overrides} set by hand</span>` : 'Typical'}</div>
    <div class="load-num"><b>${fmtAmps(s.amps)}A</b> <span>of ${s.rating}A</span><span class="pct ${s.level}">${Math.round(s.pct)}%</span></div>
    ${loadBar(s)}
    <p class="lvl-text ${s.level}">${esc(levelText(s.level))}</p>
    <ul class="readings">
      ${s.overrides ? `<li><span>Typical</span><b>${Math.round(s.typPct)}% · ${fmtAmps(s.typAmps)}A</b></li>` : ''}
      <li><span>Idle</span><b>${Math.round(s.idlePct)}% · ${s.idleAmps < 0.1 ? `${wNum(s.idleWatts)}W` : `${fmtAmps(s.idleAmps)}A`}</b></li>
      <li class="peak ${s.allLevel}"><span>Peak if all running</span><b><span class="pct-inline ${s.allLevel}">${Math.round(s.allPct)}%</span>${warnIcon(s.allLevel)} · ${fmtAmps(s.allAmps)}A</b></li>
    </ul>
    ${s.overrides && breakerId ? `<button type="button" class="btn small full" data-clear-now="${esc(breakerId)}">Back to typical</button>` : ''}`;
}

// Where a breaker from the form goes (same rules for the live preview and for saving).
// New tandem / quad = a whole new group (plan); editing one part of an existing group,
// or adding into one empty half, = just that part (pos). Full-size breakers and new
// groups snap to the top number of their row on 2-numbers-per-row panels.
function breakerPlan({ t, slot, pn, isNew, q, base = {}, half }) {
  const P = pn || 'two';
  const isGroup = t === 'tandem' || t === 'quad';
  const makeGroup = isGroup && !(isNew ? q.get('half') : base.groupId);
  const n = parseInt(slot, 10);
  const s = String(makeGroup || !isGroup ? snapSlot(t, n, P) : n);
  const plan = makeGroup ? groupPlan(t, s, P) : [];
  let pos;
  if (makeGroup) pos = { slot: String(plan[0].slot), size: 'half', half: plan[0].half, poles: plan[0].poles };
  else if (isGroup) pos = { slot: s, size: 'half', half: numberingOf(pn) === 'half' ? base.half || 'A' : half || base.half || 'A', poles: base.size === 'half' && base.btype === t ? base.poles || '1' : '1' };
  else pos = { slot: s, size: 'full', half: '', poles: t === 'triple' ? '3' : t === 'double' ? '2' : '1' };
  return { isGroup, makeGroup, plan, pos, all: makeGroup ? plan : [pos] };
}
// Breakers already on the panel that a breaker being edited could run into.
function othersOnPanel(panelId, existing, sameGroupToo = false) {
  const b = existing || {};
  return D().breakers.filter((o) => o.panelId === panelId && o.id !== b.id && !(!sameGroupToo && b.groupId && o.groupId === b.groupId));
}

// Big buttons in the breaker form. pic = a tiny drawing of the breaker.
const COMMERCIAL_AMPS = ['15', '20', '30', '40', '50', '60', '70', '80', '90', '100', '125', '150', '175', '200', '225', '250', '300', '400', '600', '800', '1200', 'other'];
const BTYPE_PICKS = [
  { v: 'single', t: 'Single', d: '1 switch · 1 circuit (120V)', pic: '<i></i>' },
  { v: 'tandem', t: 'Tandem', d: 'One breaker, 2 switches (2 circuits)', pic: '<i></i><i></i>' },
  { v: 'double', t: 'Double-pole 240V', d: '1 wide switch, 2 spaces tall · 1 circuit', pic: '<i></i>' },
  { v: 'quad', t: 'Quad', d: '2 singles + a 240V in the middle', pic: '<i></i><i class="mid"></i><i></i>' },
  { v: 'triple', t: '3-pole (3-phase)', d: '1 wide switch, 3 spaces tall · A + B + C', pic: '<i></i>' },
];
const breakerTypeText = (b) => {
  const t = breakerType(b);
  if (sizeOf(b) === 'half') {
    if (t === 'quad') return String(b.poles) === '2' ? 'Quad breaker: middle 2-pole (240V)' : `Quad breaker: ${b.half === 'B' ? 'bottom' : 'top'} single (120V)`;
    return `Tandem (1 breaker, 2 switches): ${b.half === 'B' ? 'bottom' : 'top'} switch, 120V`;
  }
  return labelOf(POLE_OPTIONS, b.poles);
};
// the other halves of the same tandem / quad breaker (same physical breaker)
const groupMates = (b) => (b.groupId ? D().breakers.filter((o) => o.id !== b.id && o.groupId === b.groupId && o.panelId === b.panelId) : []);
function groupMatesHtml(homeId, b) {
  const mates = sortBreakers(groupMates(b));
  if (!mates.length) return '';
  return `<div class="card mates"><h3>Same breaker, other ${mates.length > 1 ? 'parts' : 'half'}</h3><ul class="list">${mates.map((m) => `<li><a class="row" href="#/h/${homeId}/breaker/${m.id}"><span class="row-icon mate-slot">${esc(slotText(m))}</span><span class="row-main"><b>${esc(m.label || 'Unlabeled')}</b><span class="muted">${esc(ampsText(m))} · ${esc(breakerTypeText(m))}</span></span><span class="row-side" aria-hidden="true">›</span></a></li>`).join('')}</ul></div>`;
}

function renderBreaker(homeId, id) {
  const b = byId('breakers', id);
  if (!b || b.homeId !== homeId) return renderNotFound();
  const panel = byId('panels', b.panelId);
  const devices = inHome('devices', homeId).filter((d) => d.breakerId === b.id);
  const s = sumOf(b);
  const own = b.loads || [];
  const outletOpts = `<option value="">This circuit (no specific outlet)</option>${devices.map((d) => `<option value="${esc(d.id)}">${esc(deviceIcon(d.type))} ${esc(d.name || labelOf(DEVICE_TYPES, d.type))}${d.room ? ' · ' + esc(d.room) : ''}</option>`).join('')}`;
  const body = `
  <section class="detail-head">
    <div class="big-slot">${esc(slotText(b))}</div>
    <div class="detail-title">
      <h2>${esc(b.label || 'Unlabeled breaker')}</h2>
      <p class="muted">${esc(ampsText(b))} · ${esc(breakerTypeText(b))}${isThreePhase(panel) ? ` · <b class="ph-inline">Phase ${breakerPhases(b, panel).map((x) => `<b class="ph ph-${x}">${x}</b>`).join('')}</b>` : b.leg ? ` · Leg ${esc(b.leg)}` : ''}${b.kind && b.kind !== 'standard' ? ` · ${esc(labelOf(BREAKER_KINDS, b.kind))}` : ''}${cleanWire(b.wire) && wireTag(b.wire) ? ` · ${esc(wireTag(b.wire))}` : ''}${panel ? ` · ${esc(panel.name)}` : ''}</p>
      ${(b.rooms || []).length ? `<div class="chips">${b.rooms.map((r) => `<a class="chip" href="#/h/${homeId}/rooms?room=${encodeURIComponent(r)}">${esc(r)}</a>`).join('')}</div>` : ''}
      <p class="sticker-line"><span class="muted tiny">Label it</span> <span class="sticker">${esc(stickerText(b, panel || 'two'))}</span></p>
    </div>
  </section>
  ${b.notes ? `<p class="note-text pre">${esc(b.notes)}</p>` : ''}
  ${groupMatesHtml(homeId, b)}

  ${breakerWireCard(homeId, b, devices)}

  <div class="card">
    <div class="card-head"><h3>What it powers <span class="count">${devices.length}</span></h3><a class="btn small" href="#/edit/devices/new?home=${homeId}&breaker=${b.id}">+ Add</a></div>
    ${devices.length ? `<ul class="list">${devices.map((d) => deviceRow(homeId, d)).join('')}</ul>` : `<p class="muted">Nothing mapped to this breaker yet. Add each outlet and light it feeds, then tap one to list what's plugged in.</p>`}
  </div>

  <div class="card" id="loads">
    <h3>Load check</h3>
    ${loadHeadline(s, b.id)}
    ${s.allWatts ? `<div class="breakdown">
      ${own.length ? `<div class="bd-group"><div class="bd-head"><span>On this circuit</span><span>~${wattsText(s.ownWatts)} <span class="muted">· peak ${wattsText(s.ownAllWatts)}</span></span></div><ul class="list items">${own.map((l, i) => loadRow(l, loadRef('b', b.id, i), homeId)).join('')}</ul></div>` : ''}
      ${s.parts.map(({ device: d, watts, allWatts }) => `<div class="bd-group"><a class="bd-head link" href="#/h/${homeId}/device/${d.id}"><span>${deviceIcon(d.type)} ${esc(d.name || labelOf(DEVICE_TYPES, d.type))}${d.room ? ` <span class="muted">· ${esc(d.room)}</span>` : ''}</span><span>~${wattsText(watts)} <span class="muted">· peak ${wattsText(allWatts)}</span> ›</span></a><ul class="list items sub">${(d.loads || []).map((l, i) => loadRow(l, loadRef('d', d.id, i), homeId, { sub: true })).join('')}</ul></div>`).join('')}
    </div>` : ''}
    <details class="add-wrap" ${s.allWatts ? '' : 'open'}><summary class="btn full">+ Add something plugged in</summary>
      ${addItemForm('loadForm', { targets: devices.length ? outletOpts : null, button: 'Add to this circuit' })}
    </details>
  </div>
  <div class="card qr-card"><div class="qr" id="qrBox"></div><div><h3>Breaker QR</h3><p class="muted">Scan to open this breaker.</p><a class="btn small" href="#/h/${homeId}/print/qr?only=breaker:${b.id}">Print sticker</a></div></div>
  <div class="row-actions"><a class="btn" href="#/edit/breakers/${b.id}?home=${homeId}">Edit breaker</a></div>`;
  app.innerHTML = shell(homeId, 'panel', body, { title: `Breaker ${slotText(b)}`, back: `#/h/${homeId}/panel/${b.panelId}` });
  bindShell();
  qrSvg(deepLink(`/b/${b.id}`)).then((svg) => {
    const el = document.getElementById('qrBox');
    if (el) el.innerHTML = svg;
  });
  // 240V breaker: the amps -> watts helper starts at 240V (amps math already uses 240V)
  { const lf = document.getElementById('loadForm'); if (lf && isTwoPole(b) && lf.elements.wvolts) lf.elements.wvolts.value = '240'; }
  applyPrefill(document.getElementById('loadForm'));
  bindAddItemForm(document.getElementById('loadForm'), async (item, target) => {
    const d = target && byId('devices', target);
    if (d) await store.put('devices', { ...d, loads: [...(d.loads || []), item] });
    else await store.put('breakers', { ...b, loads: [...(b.loads || []), item] });
  });
}

function deviceRow(homeId, d, showBreaker = false) {
  const b = showBreaker ? byId('breakers', d.breakerId) : null;
  const bad = d.status === 'dead' || d.status === 'repair';
  return `<li><a class="row" href="#/h/${homeId}/device/${d.id}">
    <span class="row-icon" aria-hidden="true">${deviceIcon(d.type)}</span>
    <span class="row-main"><b>${esc(d.name || labelOf(DEVICE_TYPES, d.type))}</b><span class="muted">${esc([styleOf(d) ? styleOf(d).label : '', d.room, d.location].filter(Boolean).join(' · ') || (d.loads || []).map((l) => l.name).join(', '))}</span>${outletWireHtml(d)}</span>
    <span class="row-side">${qtyOf(d) > 1 ? `<span class="pill gray">×${qtyOf(d)}</span>` : ''}${d.replace === 'yes' ? '<span class="pill amber">Replace</span>' : ''}${deviceWatts(d) ? `<span class="pill amber">${wattsText(deviceWatts(d))}</span>` : ''}${showBreaker ? (b ? `<span class="pill">#${esc(slotText(b))}</span>` : '<span class="pill gray">?</span>') : ''}${bad ? `<span class="pill red">${esc(labelOf(STATUS_OPTIONS, d.status).split(' ')[0])}</span>` : ''}${d.gfci && !['no', 'unknown'].includes(d.gfci) ? '<span class="pill blue">GFCI</span>' : ''}</span><span class="chev" aria-hidden="true">›</span>
  </a></li>`;
}

// ---------------------------------------------------------------- device view
function renderDevice(homeId, id) {
  const d = byId('devices', id);
  if (!d || d.homeId !== homeId) return renderNotFound();
  const b = byId('breakers', d.breakerId);
  const panel = b ? byId('panels', b.panelId) : null;
  const body = `
  <section class="detail-head">
    <div class="big-icon" aria-hidden="true">${deviceIcon(d.type)}</div>
    <div>
      <h2>${esc(d.name || labelOf(DEVICE_TYPES, d.type))}</h2>
      <p class="muted">${esc([d.room, d.location].filter(Boolean).join(' · '))}</p>
      ${(() => { const e = effectiveWire(d, b); return e.wire ? `<div class="wire-head ${e.from === 'circuit' ? 'inh' : ''}"><span class="wire-chip sm" aria-hidden="true">${esc(wireTag(e.wire) || '〰')}</span><span><b>${esc(wireShort(e.wire) || wireText(e.wire, { short: true }))}</b>${typeText(e.wire, true) ? ` ${esc(typeText(e.wire, true))}` : ''}<span class="muted tiny block">${e.from === 'circuit' ? `From breaker #${esc(slotText(b))}` : 'Set on this ' + (d.type === 'outlet' || !d.type ? 'outlet' : 'item')}</span></span></div>` : ''; })()}
    </div>
  </section>
  ${b ? `<a class="breaker-link" href="#/h/${homeId}/breaker/${b.id}"><span class="big-slot sm">${esc(slotText(b))}</span><span><b>Breaker ${esc(slotText(b))} · ${esc(ampsText(b))}</b><span class="muted">${esc(b.label || '')}${panel ? ` · ${esc(panel.name)}` : ''}</span></span><span aria-hidden="true">›</span></a>` : `<div class="alert warn">Breaker not mapped yet. <a href="#/edit/devices/${d.id}?home=${homeId}">Pick one</a></div>`}
  ${(() => {
    const items = d.loads || [];
    const w = deviceReading(d, 'main');
    const wAll = deviceReading(d, 'peak');
    const cs = b ? sumOf(b) : null;
    const plugTitle = d.type === 'outlet' || !d.type ? 'Plugged in here' : 'What it powers / draws';
    return `<div class="card" id="plugged">
      <div class="card-head"><h3>${plugTitle}</h3>${wAll ? `<span class="pill amber">~${wattsText(w)} · ${fmtAmps(w / voltsFor(b && b.poles))}A typical</span>` : ''}</div>
      ${items.length ? `<ul class="list items">${items.map((l, i) => loadRow(l, loadRef('d', d.id, i), homeId)).join('')}</ul>` : `<p class="muted">Nothing listed yet. Add what's plugged in and it counts toward ${b ? `breaker ${esc(slotText(b))}'s` : 'the breaker'} load check.</p>`}
      <details class="add-wrap" ${items.length ? '' : 'open'}><summary class="btn full">+ Add something plugged in</summary>
        ${addItemForm('itemForm', { button: 'Add to this ' + (d.type === 'outlet' ? 'outlet' : 'item') })}
      </details>
      ${cs && cs.rating ? `<a class="circuit-mini" href="#/h/${homeId}/breaker/${b.id}#loads"><span class="row-main"><b>Whole circuit: ${fmtAmps(cs.amps)}A of ${cs.rating}A typical</b><span class="muted">${w ? `This ${d.type === 'outlet' ? 'outlet' : 'item'}: ~${wattsText(w)} of ~${wattsText(cs.watts)}` : `~${wattsText(cs.watts)} on breaker ${esc(slotText(b))}`}</span>${maxLine(cs, 'muted tiny block')}</span><span class="pct ${cs.level}">${cs.level === 'none' ? '' : Math.round(cs.pct) + '%'}</span>${cs.level !== 'none' ? loadBar(cs, true) : ''}</a>` : ''}
    </div>`;
  })()}
  <div class="card">
    <dl class="facts">
      <dt>Type</dt><dd>${esc(labelOf(DEVICE_TYPES, d.type))}</dd>
      ${styleOf(d) ? `<dt>Style</dt><dd>${esc(styleOf(d).label)}</dd>` : ''}
      <dt>Quantity</dt><dd>${qtyOf(d)}</dd>
      ${d.box ? `<dt>Box</dt><dd>${esc(labelOf(BOX_OPTIONS, d.box))}</dd>` : ''}
      <dt>Needs replacing</dt><dd class="${d.replace === 'yes' ? 'warnc' : ''}">${d.replace === 'yes' ? 'Yes' : 'No'}</dd>
      <dt>Status</dt><dd class="${d.status === 'dead' || d.status === 'repair' ? 'bad' : ''}">${esc(labelOf(STATUS_OPTIONS, d.status))}</dd>
      <dt>GFCI</dt><dd>${esc(labelOf(GFCI_OPTIONS, d.gfci))}</dd>
      <dt>AFCI</dt><dd>${esc(labelOf(AFCI_OPTIONS, d.afci))}</dd>
    </dl>
  </div>
  ${(() => {
    const e = effectiveWire(d, b);
    const label = d.type === 'outlet' || !d.type ? 'outlet' : 'item';
    return `<div class="card wire-card" id="wire">
      <div class="card-head"><h3>Wire</h3>${e.from === 'outlet' ? '<span class="pill wire">Set on this ' + label + '</span>' : e.from === 'circuit' ? `<span class="pill gray">From breaker #${esc(slotText(b))}</span>` : ''}</div>
      ${e.wire ? `${wireLineHtml(e.wire)}${wireChecksHtml(e.wire, breakerAmps(b))}${e.from === 'circuit' ? `<p class="muted tiny">Same wire as the rest of the circuit. <a href="#/edit/devices/${d.id}?home=${homeId}&focus=wire">Different here?</a></p>` : b && cleanWire(b.wire) ? `<p class="muted tiny">The circuit is ${esc(wireText(b.wire, { short: true }))}.</p>` : ''}` : `<p class="muted">Not recorded yet.${b ? ` Add it on <a href="#/edit/breakers/${b.id}?home=${homeId}&focus=wire">breaker #${esc(slotText(b))}</a> and every outlet on it shows it, or set a <a href="#/edit/devices/${d.id}?home=${homeId}&focus=wire">different wire here</a>.` : ''}</p>`}
    </div>`;
  })()}

  ${d.notes ? `<div class="card"><h3>Notes</h3><p class="pre">${esc(d.notes)}</p></div>` : ''}
  <div class="card">
    <h3>Meter readings</h3>
    ${(d.readings || []).length ? `<ul class="list readings">${d.readings.map((r, i) => `<li class="load-row"><span>${esc(r.text)}${r.date ? `<span class="muted tiny block">${esc(r.date)}</span>` : ''}</span><button class="icon-btn small" data-del-reading="${i}" aria-label="Remove reading">✕</button></li>`).join('')}</ul>` : '<p class="muted">No readings yet.</p>'}
    <form id="readingForm" class="form inline-form">
      <label>Add a reading<input name="text" placeholder="e.g. 30V ghost when switch off"></label>
      <button class="btn" type="submit">Save reading</button>
    </form>
  </div>
  <div class="card" id="photoCard"><h3>Photo</h3><div id="photoBox" class="muted">${d.photoId ? 'Loading...' : 'No photo.'}</div>
    <label class="btn small file-btn">${d.photoId ? 'Replace photo' : 'Add photo'}<input type="file" accept="image/*" id="photoIn" hidden></label>
    ${d.photoId ? '<button class="btn small ghost" id="photoDel">Remove photo</button>' : ''}
  </div>
  <div class="card qr-card"><div class="qr big" id="qrBox"></div><div><h3>QR sticker</h3><p class="muted">Scan with your phone camera to open this ${esc(labelOf(DEVICE_TYPES, d.type).toLowerCase())}.</p><a class="btn small" href="#/h/${homeId}/print/qr?only=device:${d.id}">Print sticker</a></div></div>
  <div class="row-actions"><a class="btn primary" href="#/edit/devices/${d.id}?home=${homeId}">Edit</a><button class="btn danger" id="delDev">Delete</button></div>`;
  app.innerHTML = shell(homeId, 'rooms', body, { title: d.room || 'Item', back: b ? `#/h/${homeId}/breaker/${b.id}` : `#/h/${homeId}/rooms` });
  bindShell();
  qrSvg(deepLink(`/d/${d.id}`)).then((svg) => {
    const el = document.getElementById('qrBox');
    if (el) el.innerHTML = svg;
  });
  if (d.photoId)
    store.getPhoto(d.photoId).then((src) => {
      const el = document.getElementById('photoBox');
      if (el) el.innerHTML = src ? `<img class="photo" src="${src}" alt="Photo of ${esc(d.name)}">` : 'Photo not available offline yet.';
    });
  bindPhoto('devices', d);
  applyPrefill(document.getElementById('itemForm'));
  bindAddItemForm(document.getElementById('itemForm'), async (item) => {
    await store.put('devices', { ...d, loads: [...(d.loads || []), item] });
  });
  const rf = document.getElementById('readingForm');
  rf.onsubmit = async (e) => {
    e.preventDefault();
    const text = rf.elements.text.value.trim();
    if (!text) return;
    const date = new Date().toISOString().slice(0, 10);
    await store.put('devices', { ...d, readings: [...(d.readings || []), { text, date }] });
    toast('Reading saved');
  };
  app.querySelectorAll('[data-del-reading]').forEach((btn) => {
    btn.onclick = async () => {
      const r = [...(d.readings || [])];
      r.splice(Number(btn.dataset.delReading), 1);
      await store.put('devices', { ...d, readings: r });
    };
  });
  document.getElementById('delDev').onclick = async () => {
    if (!confirm('Delete this item?')) return;
    if (d.photoId) await store.removePhoto(d.photoId);
    await store.remove('devices', d.id);
    go(b ? `#/h/${homeId}/breaker/${b.id}` : `#/h/${homeId}/rooms`);
  };
}

function bindPhoto(col, item) {
  const input = document.getElementById('photoIn');
  if (!input) return;
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    toast('Shrinking photo...');
    try {
      const dataUrl = await compressPhoto(file);
      const pid = item.photoId || 'ph_' + uid();
      await store.putPhoto(pid, dataUrl);
      await store.put(col, { ...item, photoId: pid });
      toast('Photo saved');
      render();
    } catch (e) {
      console.error(e);
      toast("Couldn't save that photo");
    }
  };
  const del = document.getElementById('photoDel');
  if (del)
    del.onclick = async () => {
      if (!confirm('Remove photo?')) return;
      await store.removePhoto(item.photoId);
      const { photoId, ...rest } = item;
      void photoId;
      await store.put(col, rest);
    };
}

// ---------------------------------------------------------------- rooms
function renderRooms(homeId, roomFilter) {
  const devices = inHome('devices', homeId);
  const groups = new Map();
  for (const d of devices) {
    const r = d.room || 'No room set';
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(d);
  }
  const names = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const shown = roomFilter ? names.filter((n) => n === roomFilter) : names;
  const body = `
  ${roomFilter ? '' : searchBarHtml(homeId)}
  <div class="section-head"><h2>${roomFilter ? esc(roomFilter) : 'Rooms'}</h2><div class="head-actions"><a class="btn small" href="#/h/${homeId}/shop">🛒 Shopping list</a><a class="btn small primary" href="#/edit/devices/new?home=${homeId}${roomFilter ? `&room=${encodeURIComponent(roomFilter)}` : ''}">+ Add</a></div></div>
  ${roomFilter ? `<p><a href="#/h/${homeId}/rooms">‹ All rooms</a></p>` : `<label class="sr-only" for="roomJump">Jump to room</label><select id="roomJump" class="full"><option value="">Jump to a room...</option>${names.map((n) => `<option>${esc(n)}</option>`).join('')}</select>`}
  ${shown.length ? shown.map((r) => {
    const list = groups.get(r);
    const brks = [...new Set(list.map((d) => d.breakerId).filter(Boolean))].map((id) => byId('breakers', id)).filter(Boolean);
    return `<div class="card room-card"><div class="room-head"><h3>${esc(r)}</h3><span class="muted tiny">${brks.length ? 'Breaker' + (brks.length > 1 ? 's ' : ' ') + brks.map((b) => '#' + slotText(b)).join(', ') : ''}</span></div><ul class="list">${list.map((d) => deviceRow(homeId, d, true)).join('')}</ul></div>`;
  }).join('') : `<div class="card empty"><p>No outlets, lights or switches yet. Add one and pick its breaker.</p></div>`}`;
  app.innerHTML = shell(homeId, 'rooms', body);
  bindShell();
  bindSearchBar(homeId);
  const rj = document.getElementById('roomJump');
  if (rj) rj.onchange = () => rj.value && go(`#/h/${homeId}/rooms?room=${encodeURIComponent(rj.value)}`);
}

// ---------------------------------------------------------------- house map
// Rooms as tiles: each room's plugs / lights / devices with a colored tag for the breaker
// that feeds it (color = that breaker's Typical %). Tap a breaker tag = light up every plug
// on it in every room; tap a plug = show its breaker. ?b=breakerId / ?o=deviceId deep-link.
function renderMap(homeId, q) {
  if (q.get('view')) localStorage.setItem(MAPVIEW_KEY, q.get('view') === 'plan' ? 'plan' : 'rooms');
  if ((q.get('view') || localStorage.getItem(MAPVIEW_KEY)) === 'plan') return renderPlan(homeId, q);
  const data = { breakers: inHome('breakers', homeId), devices: inHome('devices', homeId), panels: inHome('panels', homeId) };
  const map = buildHouseMap(data);
  const multi = data.panels.length > 1;
  const tag = (id, { big = false } = {}) => {
    const i = id && map.breakers[id];
    if (!i) return `<span class="btag none">No breaker</span>`;
    return `<button type="button" class="btag lvl-${i.level} ${big ? 'big' : ''}" data-b="${esc(id)}" aria-label="${esc(i.tag)}, typical ${Math.round(i.pct)} percent. Show everything on this breaker">${esc(i.tag)}</button>`;
  };
  const used = Object.values(map.breakers).filter((i) => i.rooms.length).sort((a, b) => {
    if (a.panel !== b.panel) return data.panels.indexOf(a.panel) - data.panels.indexOf(b.panel);
    return (parseInt(a.breaker.slot, 10) || 999) - (parseInt(b.breaker.slot, 10) || 999);
  });
  const loadNames = (loads) => (loads || []).map((l) => l.name + ((Number(l.qty) || 1) > 1 ? ` ×${l.qty}` : '')).join(' · ');
  const rooms = map.rooms.filter((r) => r.outlets.length || r.circuit.length || r.breakerIds.length);
  const tile = (r) => {
    const mixed = !r.wholeRoom;
    const items = [
      ...r.outlets.map((d) => `<li class="map-item" data-ob="${esc(d.breakerId || '')}" data-o="${esc(d.id)}">
        <button type="button" class="map-o" data-o="${esc(d.id)}"><span class="map-ic" aria-hidden="true">${deviceIcon(d.type)}</span><span class="map-txt"><b>${esc(devName(d))}${qtyOf(d) > 1 ? ` ×${qtyOf(d)}` : ''}</b>${outletWireHtml(d, null, 'sm')}${(d.loads || []).length ? `<small>${esc(loadNames(d.loads))}</small>` : d.location ? `<small class="muted">${esc(d.location)}</small>` : ''}</span></button>
        ${mixed ? tag(d.breakerId) : ''}</li>`),
      ...r.circuit.map((c) => `<li class="map-item circuit" data-ob="${esc(c.breakerId)}"><span class="map-o static"><span class="map-ic" aria-hidden="true">⚡</span><span class="map-txt"><b>Listed on the breaker</b><small>${esc(loadNames(c.loads))}</small></span></span>${mixed ? tag(c.breakerId) : ''}</li>`),
    ];
    const add = `#/edit/devices/new?home=${homeId}&room=${encodeURIComponent(r.name === NO_ROOM ? '' : r.name)}${r.wholeRoom ? `&breaker=${r.wholeRoom}` : ''}`;
    return `<section class="map-room" data-room="${esc(r.name)}">
      <div class="map-room-head"><h3>${esc(r.name)}</h3>${r.wholeRoom ? `<span class="map-whole"><small>all on</small>${tag(r.wholeRoom, { big: true })}</span>` : r.breakerIds.length > 1 ? `<small class="muted">${r.breakerIds.length} breakers</small>` : ''}</div>
      ${items.length ? `<ul class="map-list">${items.join('')}</ul>` : '<p class="muted tiny map-empty">No plugs added yet.</p>'}
      <a class="map-add" href="${add}">+ Add a plug or light</a>
    </section>`;
  };
  const body = `
  <div class="section-head"><h2>House map</h2><div class="head-actions"><a class="btn small primary" href="#/edit/devices/new?home=${homeId}">+ Add</a></div></div>
  ${mapToggle(homeId, 'rooms')}
  ${rooms.length ? `
  <p class="muted tiny map-help">Tap a breaker to light up every plug it feeds. Tap a plug to see its breaker. Colors = Typical load.</p>
  <div class="map-brks" role="list" aria-label="Breakers">${used.map((i) => `<span role="listitem">${tag(i.breaker.id)}</span>`).join('')}</div>
  <div class="map-grid" id="mapGrid">${rooms.map(tile).join('')}</div>
  <div class="legend"><span class="dot lvl-ok"></span>under 80% <span class="dot lvl-warn"></span>80%+ <span class="dot lvl-over"></span>over 100% <span class="dot lvl-none"></span>no loads listed</div>
  <div class="map-bar" id="mapBar" hidden></div>` : `<div class="card empty"><p>No rooms yet. Add outlets, lights or devices and pick their room and breaker, and they show up here.</p><a class="btn primary" href="#/edit/devices/new?home=${homeId}">+ Add an outlet</a></div>`}`;
  app.innerHTML = shell(homeId, 'map', body);
  bindShell();
  const grid = document.getElementById('mapGrid');
  if (!grid) return;
  const bar = document.getElementById('mapBar');
  const root = document.getElementById('main');
  const clear = () => {
    root.classList.remove('map-pick');
    root.querySelectorAll('.hit, .sel, .room-hit').forEach((el) => el.classList.remove('hit', 'sel', 'room-hit'));
    root.querySelectorAll('.btag.on').forEach((el) => el.classList.remove('on'));
    bar.hidden = true;
    history.replaceState(null, '', `#/h/${homeId}/map`);
  };
  const show = (bid, oid = '') => {
    const i = map.breakers[bid];
    clear();
    if (!i && !oid) return;
    root.classList.add('map-pick');
    if (i) {
      root.querySelectorAll(`.map-item[data-ob="${CSS.escape(bid)}"]`).forEach((el) => { el.classList.add('hit'); el.closest('.map-room').classList.add('room-hit'); });
      root.querySelectorAll(`.btag[data-b="${CSS.escape(bid)}"]`).forEach((el) => el.classList.add('on'));
      root.querySelectorAll(`.map-room-head .btag[data-b="${CSS.escape(bid)}"]`).forEach((el) => el.closest('.map-room').classList.add('room-hit'));
    }
    let head = '';
    if (oid) {
      const el = root.querySelector(`.map-item[data-o="${CSS.escape(oid)}"]`);
      if (el) { el.classList.add('sel'); el.closest('.map-room').classList.add('room-hit'); }
      const d = byId('devices', oid);
      head = `<div class="mb-line"><b>${esc(devName(d))}</b> <span class="muted">(${esc(d.room || NO_ROOM)})</span> is on</div>`;
    }
    const plugs = i ? outletsOnBreaker(map, bid) : [];
    const s = i ? sumOf(i.breaker) : null;
    bar.innerHTML = `${head}${i ? `<div class="mb-top"><span class="btag lvl-${i.level} big static">${esc(i.tag)}</span><b class="mb-label">${esc(i.breaker.label || 'Unlabeled')}</b><button type="button" class="icon-btn small" id="mbClose" aria-label="Close">✕</button></div>
      <div class="mb-sub">${plugs.length} plug${plugs.length === 1 ? '' : 's'} in ${i.rooms.length} room${i.rooms.length === 1 ? '' : 's'}: ${esc(i.rooms.join(', '))}${multi && i.panel ? ` · ${esc(i.panel.name)}` : ''}</div>
      <div class="mb-sub"><b class="lvl-text ${s.level}">Typical ${Math.round(s.pct)}%</b> · ${esc(fmtAmps(s.amps))} of ${s.rating || '?'}A${s.allPct > 100 ? ` · <span class="lvl-text over">⚠️ Peak ${Math.round(s.allPct)}%</span>` : ` · Peak ${Math.round(s.allPct)}%`}</div>
      ${wireSubHtml(oid ? byId('devices', oid) : null, i.breaker)}
      <div class="mb-actions">${oid ? `<a class="btn small" href="#/h/${homeId}/device/${oid}">Open plug</a>` : ''}<a class="btn small primary" href="#/h/${homeId}/breaker/${bid}">Open breaker ›</a></div>`
      : `<div class="mb-top"><b>No breaker set yet</b><button type="button" class="icon-btn small" id="mbClose" aria-label="Close">✕</button></div><div class="mb-actions"><a class="btn small primary" href="#/edit/devices/${oid}?home=${homeId}">Pick its breaker</a></div>`}`;
    bar.hidden = false;
    document.getElementById('mbClose').onclick = clear;
    history.replaceState(null, '', `#/h/${homeId}/map?${oid ? 'o=' + encodeURIComponent(oid) : 'b=' + encodeURIComponent(bid)}`);
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('.btag[data-b]');
    if (t) {
      e.preventDefault();
      if (t.classList.contains('on') && !root.querySelector('.map-item.sel')) return clear();
      return show(t.dataset.b);
    }
    const o = e.target.closest('.map-o[data-o]');
    if (o) {
      const li = o.closest('.map-item');
      if (li.classList.contains('sel')) return clear();
      return show(li.dataset.ob, o.dataset.o);
    }
  });
  if (q.get('o') && byId('devices', q.get('o'))) show(byId('devices', q.get('o')).breakerId, q.get('o'));
  else if (q.get('b') && map.breakers[q.get('b')]) show(q.get('b'));
}

// ---------------------------------------------------------------- floor plan
// Map tab, "Floor plan": a top-down 2D plan of the home in feet. Rooms are rectangles he can
// add / drag / resize (1-ft grid) and name; plugs, switches and lights are pins on the walls,
// each linked to an outlet (device) and colored by its breaker's Typical %. Tap a breaker or a
// pin = light up every pin on that breaker. Saved as optional fields: home.floorplan and
// device.pos (lib/floorplan.js). The optional background photo is a normal photo doc.
const MAPVIEW_KEY = 'panelbuddy:mapView';
const PLAN_PAD = 1; // ft of margin around the outline
const planUI = { home: '', mode: 'view', sel: '', kind: 'outlet', placing: '', z: 0, bid: '', oid: '', drop: null, photo: null, floor: '', picker: false, swap: '', undo: [], corner: -1, door: '', doorAdd: '', wOther: false, wallMode: false, ow: '' };
// Plan settings kept on this phone: show feet labels, and whether rooms follow the house when
// it is stretched in Shape house.
const FEET_KEY = 'panelbuddy:planFeet';
const FIT_KEY = 'panelbuddy:planFitRooms';
const showFeet = () => localStorage.getItem(FEET_KEY) !== '0'; // "Show sizes": room sizes, wall lengths
const NOWALL_IC = '<svg viewBox="0 0 24 24" width="18" height="18" class="pk-ic" aria-hidden="true"><path d="M3 4v16M21 4v16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M3 12h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="2.2 2.6"/></svg>';
const DOOR_IC = '<svg viewBox="0 0 24 24" width="18" height="18" class="pk-ic" aria-hidden="true"><path d="M3 20h6M15 20h6M9 20V8M9 8a12 12 0 0 1 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const RULER_IC = '<svg viewBox="0 0 24 24" width="18" height="18" class="pk-ic" aria-hidden="true"><path d="M3 15 15 3l6 6L9 21z M7 11l2 2M10 8l2 2M13 5l2 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/></svg>';
const fitRooms = () => localStorage.getItem(FIT_KEY) !== '0';
const HOUSE_IC = '<svg viewBox="0 0 24 24" width="18" height="18" class="pk-ic" aria-hidden="true"><path d="M4 20V9.5L12 4l8 5.5V20z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="4" cy="20" r="2" fill="currentColor"/><circle cx="20" cy="20" r="2" fill="currentColor"/><circle cx="12" cy="4" r="2" fill="currentColor"/></svg>';
const SCRATCH_IC = '<svg viewBox="0 0 24 24" width="18" height="18" class="pk-ic" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ROOMS_IC = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M3 3h18v11h-7v7H3z" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 2" stroke-linejoin="round"/><rect x="5" y="5" width="7" height="6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="12" y="5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="11" width="7" height="8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const OUTLINE_IC = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M3 3h18v11h-7v7H3z" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="3" cy="3" r="1.8" fill="currentColor"/><circle cx="21" cy="3" r="1.8" fill="currentColor"/><circle cx="21" cy="14" r="1.8" fill="currentColor"/><circle cx="14" cy="21" r="1.8" fill="currentColor"/><circle cx="3" cy="21" r="1.8" fill="currentColor"/></svg>';
const SHAPE_PRESETS = [{ v: 'rect', t: 'Rectangle' }, { v: 'L', t: 'L' }, { v: 'T', t: 'T' }, { v: 'U', t: 'U' }];
const shapeIc = (v) => { const pts = presetShape(v, 20, 20, 2, 2); return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><polygon points="${pts.map((p) => p.x + ',' + p.y).join(' ')}" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`; };
const ROOM_HOLD_VIEW = 400; // ms: press and hold a room to pick it up in the normal view (quick swipes still scroll)
const ROOM_HOLD_EDIT = 180; // ms: in Move rooms, a short press picks up any room (the picked one moves at once)
const PIN_ICON = {
  outlet: '<path d="M9.6 7.8v4.6M14.4 7.8v4.6" stroke-width="2.3"/><circle cx="12" cy="16" r="1.5" fill="#fff" stroke="none"/>',
  gfci: '<text x="12" y="16.4" text-anchor="middle" font-size="12.5" font-weight="800" fill="#fff" stroke="none" font-family="system-ui,-apple-system,sans-serif">G</text>',
  switch: '<rect x="8.5" y="5.5" width="7" height="13" rx="1.6"/><path d="M12 8.3v4.4" stroke-width="2.6"/>',
  light: '<circle cx="12" cy="10.4" r="4.7"/><path d="M10 16.6h4M10.6 19.1h2.8"/>',
  fan: '<circle cx="12" cy="12" r="1.8" fill="#fff" stroke="none"/><path d="M12 10.2V5.4M13.6 12.9l4.2 2.5M10.4 12.9l-4.2 2.5" stroke-width="2.4"/>',
  appliance: '<rect x="6.6" y="6" width="10.8" height="12.6" rx="1.6"/><circle cx="12" cy="13.2" r="2.8"/>',
  other: '<path d="M13 4.5 7.5 13h4.5l-1 6.5 5.5-8.5h-4.5z" fill="#fff" stroke="none"/>',
};
const MOVE_IC = '<svg viewBox="0 0 24 24" width="18" height="18" class="pk-ic" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3 9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const pinIconSvg = (k) => `<svg viewBox="0 0 24 24" width="18" height="18" class="pk-ic" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${PIN_ICON[k] || PIN_ICON.other}</g></svg>`;
// lastHash is updated too, so the next render does not jump to the top
const quietHash = (h) => { history.replaceState(null, '', h); lastHash = location.hash; planUI.qh = location.hash; };

function mapToggle(homeId, active) {
  return `<div class="map-toggle" role="tablist" aria-label="Map style">
    <a role="tab" href="#/h/${homeId}/map?view=rooms" class="${active === 'rooms' ? 'on' : ''}" ${active === 'rooms' ? 'aria-selected="true"' : ''}>Rooms</a>
    <a role="tab" href="#/h/${homeId}/map?view=plan" class="${active === 'plan' ? 'on' : ''}" ${active === 'plan' ? 'aria-selected="true"' : ''}>Floor plan</a>
  </div>`;
}

function renderPlan(homeId, q) {
  const home = byId('homes', homeId);
  if (planUI.home !== homeId) Object.assign(planUI, { home: homeId, mode: 'view', sel: '', placing: '', z: 0, bid: '', oid: '', drop: null, photo: null, floor: '', picker: false, swap: '', undo: [], corner: -1, door: '', doorAdd: '', wOther: false, wallMode: false, ow: '' });
  // ?b= / ?o= / ?mode= deep links apply once per address (not again on every save)
  if (location.hash !== planUI.qh) {
    planUI.qh = location.hash;
    if (q.get('b')) { planUI.bid = q.get('b'); planUI.oid = ''; }
    if (q.get('o')) { planUI.oid = q.get('o'); planUI.bid = (byId('devices', q.get('o')) || {}).breakerId || ''; }
    if (q.get('mode') && ['view', 'rooms', 'add', 'shape'].includes(q.get('mode'))) planUI.mode = q.get('mode');
    if (q.get('templates')) planUI.picker = true;
    if (q.get('floor')) planUI.floor = q.get('floor');
  }
  let plan = planOf(home, planUI.floor);
  // a pin picked on another floor: show that floor
  if (planUI.oid && !q.get('floor')) { const d0 = byId('devices', planUI.oid); if (d0 && d0.pos && floorOfPos(d0.pos, plan) !== plan.floor) plan = planOf(home, floorOfPos(d0.pos, plan)); }
  planUI.floor = plan.floor;
  const data = { breakers: inHome('breakers', homeId), devices: inHome('devices', homeId), panels: inHome('panels', homeId) };
  const map = buildHouseMap(data);
  const multi = data.panels.length > 1;
  const { placed, unplaced, elsewhere } = splitPlaced(data.devices, plan);
  // 52 px = the margin kept around the outline for pins on the outside walls (P below)
  const fitW = (Math.min(window.innerWidth || 390, 760) - 32 - 52) / plan.w;
  // Shape house: a wide margin around the house so a wall can be pulled out by eye
  const shaping = planUI.mode === 'shape';
  const SM = shaping ? Math.min(16, Math.max(6, Math.round(Math.min(plan.w, plan.h) * 0.35))) : 0;
  const fitShape = (Math.min(window.innerWidth || 390, 760) - 32) / (plan.w + 2 * SM);
  const fitAll = Math.max(3, Math.min(shaping ? fitShape : fitW, ((window.innerHeight || 844) - 380) / plan.h));
  if (!planUI.z) planUI.z = Math.min(shaping ? fitShape : fitW, 16);
  const P = Math.max(PLAN_PAD, 26 / planUI.z, SM, shaping ? 64 / planUI.z : 0); // room for pins (and Shape house's + buttons) outside the walls
  const pinS = Math.min(1, Math.max(0.68, planUI.z / 16)); // pins shrink a little when zoomed out
  const knownRooms = [...new Set([...map.rooms.map((r) => r.name).filter((n) => n !== NO_ROOM), ...plan.rooms.map((r) => r.name)].filter(Boolean))];
  const lvlOf = (d) => (d.breakerId && map.breakers[d.breakerId] ? map.breakers[d.breakerId].level : 'none');
  // Auto outline on (rooms first): the outline is redrawn around the rooms on every save, and
  // the drawing area grows when a room reaches its edge.
  const savePlan = (next) => {
    if (next.autoOutline) Object.assign(next, withAutoOutline(growArea(next)));
    return store.put('homes', { ...byId('homes', homeId), floorplan: planToSave(next) });
  };
  // the outline as drawn, for outside doors (auto outline, the drawn shape, or the w x h box)
  const doorPoly = (pl) => {
    if (pl.autoOutline && !shaping) { const a = outlineFromRooms(pl.rooms); return a.length >= 4 ? a : null; }
    if (pl.outlinePts && pl.outlinePts.length >= 3) return pl.outlinePts;
    return pl.outline === 'rooms' ? null : rectPts(pl.w, pl.h);
  };
  // a room door on the house's outside wall counts as an outside door
  const isOutside = (sg, poly) => {
    if (!sg) return false;
    if (sg.outside) return true;
    if (!poly) return false;
    const mx = (sg.a.x + sg.b.x) / 2, my = (sg.a.y + sg.b.y) / 2;
    return !pointInPoly({ x: mx - sg.nx * 0.4, y: my - sg.ny * 0.4 }, poly, 0);
  };
  const tag = (id) => {
    const i = id && map.breakers[id];
    if (!i) return '';
    return `<button type="button" class="btag lvl-${i.level} ${planUI.bid === id ? 'on' : ''}" data-b="${esc(id)}" aria-label="${esc(i.tag)}, typical ${Math.round(i.pct)} percent. Light up its plugs">${esc(i.tag)}</button>`;
  };
  const byBrk = pinsByBreaker(data.devices, plan);
  const legend = Object.values(map.breakers)
    .filter((i) => byBrk[i.breaker.id] || (i.breaker.rooms || []).some((n) => plan.rooms.some((r) => r.name.toLowerCase() === n.toLowerCase())))
    .sort((a, b) => (a.panel !== b.panel ? data.panels.indexOf(a.panel) - data.panels.indexOf(b.panel) : (parseInt(a.breaker.slot, 10) || 999) - (parseInt(b.breaker.slot, 10) || 999)));

  // ---- the drawing (re-drawn in place while dragging)
  const svgInner = (pl, { pins = placed, ghost = null, lift = '' } = {}) => {
    const z = planUI.z;
    const px = (n) => n / z; // screen px -> ft
    const hitRooms = new Set(planUI.bid ? roomsOnBreaker(pl, byId('breakers', planUI.bid), data.devices) : []);
    const editing = planUI.mode === 'rooms';
    const feet = showFeet();
    const over = overlapping(pl.rooms);
    // the house outline as a polygon: saved, or (in Shape house) the box / rooms it starts from
    // Auto outline (rooms first): drawn around the rooms as they move, live while dragging
    const auto = pl.autoOutline && !shaping;
    const autoPts = auto ? outlineFromRooms(pl.rooms) : null;
    const poly = auto ? (autoPts.length >= 4 ? autoPts : null) : pl.outlinePts && pl.outlinePts.length >= 3 ? pl.outlinePts : shaping ? shapeOf(pl) : null;
    const polyStr = poly ? poly.map((p) => `${p.x},${p.y}`).join(' ') : '';
    const out = pl.outlinePts && poly && !auto ? roomsOutside(pl.rooms, poly) : new Set();
    let s = `<defs><pattern id="pg1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" class="pl-g1" stroke-width="${px(1)}"/></pattern>
      <pattern id="pg5" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" class="pl-g5" stroke-width="${px(1)}"/></pattern></defs>`;
    const open = pl.outline === 'rooms' || (auto && !poly);
    // rooms first: the whole drawing area stays visible (open) so rooms can go anywhere
    if (auto) s += `<rect class="pl-floor open" x="0" y="0" width="${pl.w}" height="${pl.h}"/>`;
    if (poly) s += `<clipPath id="plClip"><polygon points="${polyStr}"/></clipPath><polygon class="pl-floor" points="${polyStr}"/>`;
    else if (!auto) s += `<rect class="pl-floor ${open ? 'open' : ''}" x="0" y="0" width="${pl.w}" height="${pl.h}"/>`;
    if (open && !poly) for (const r of pl.rooms) s += `<rect class="pl-floor" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`;
    if (pl.photoId && planUI.photo && planUI.photo.id === pl.photoId && planUI.photo.url) {
      const rot = (pl.photoRot || 0) % 180 === 90;
      const iw = rot ? pl.h : pl.w, ih = rot ? pl.w : pl.h;
      s += `<image href="${planUI.photo.url}" x="${(pl.w - iw) / 2}" y="${(pl.h - ih) / 2}" width="${iw}" height="${ih}" preserveAspectRatio="none" opacity="${pl.photoOpacity}" transform="rotate(${pl.photoRot || 0} ${pl.w / 2} ${pl.h / 2})"/>`;
    }
    s += `<g ${poly && !(auto && (editing || !pl.rooms.length)) ? 'clip-path="url(#plClip)"' : ''}><rect x="0" y="0" width="${pl.w}" height="${pl.h}" fill="url(#pg1)" class="pl-grid ${editing || planUI.mode === 'add' ? 'strong' : ''}"/><rect x="0" y="0" width="${pl.w}" height="${pl.h}" fill="url(#pg5)" class="pl-grid ${editing ? 'strong' : ''}"/></g>`;
    // the room being dragged is drawn last, on top of the others
    const order = lift ? [...pl.rooms.filter((r) => r.id !== lift), ...pl.rooms.filter((r) => r.id === lift)] : pl.rooms;
    for (const r of order) {
      const fs = Math.min(px(13.5), (r.w * 0.88) / Math.max(4, (r.name || 'Room').length * 0.64), r.h / 2.4);
      const rc = [planUI.sel === r.id ? 'sel' : '', hitRooms.has(r.id) ? 'hit' : '', over.has(r.id) || out.has(r.id) ? 'overlap' : '', out.has(r.id) ? 'outside' : '', lift === r.id ? 'lift' : '', planUI.swap ? (planUI.swap === r.id ? 'swapfrom' : 'swapto') : ''].filter(Boolean).join(' ');
      s += `<g class="pl-room ${rc}" data-r="${esc(r.id)}">
        <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" stroke-width="${px(2)}"/>
        <text x="${r.x + r.w / 2}" y="${editing ? r.y + r.h / 2 - fs * 0.15 : r.y + Math.min(r.h / 2, fs * 1.6 + px(4))}" font-size="${fs}" text-anchor="middle" class="pl-rname">${esc(r.name || 'Room')}</text>
        ${feet && (editing || r.measured) ? `<text x="${r.x + r.w / 2}" y="${editing ? r.y + r.h / 2 + fs * 1.15 : r.y + Math.min(r.h / 2, fs * 1.6 + px(4)) + Math.min(px(12.5), fs) * 1.15}" font-size="${Math.min(px(11.5), r.w / 7, fs * (editing ? 0.85 : 0.8))}" text-anchor="middle" class="pl-rdim ${r.measured ? 'measured' : ''}">${fmtFtIn(r.w)} × ${fmtFtIn(r.h)}</text>` : ''}
      </g>`;
    }
    // open walls (no wall there, e.g. kitchen open to the living room): the wall is taken out
    // (once, even on a wall two rooms share) and a faint dashed line keeps the rooms apart
    const osegs = planOpenSegs(pl);
    for (const sg of osegs) {
      const sel = editing && planUI.ow === sg.id;
      const L = sg.to - sg.from, k = Math.min(px(1.1), L / 4); // a hair in from the ends: the walls they meet stay whole
      const a = { x: sg.a.x + sg.ux * k, y: sg.a.y + sg.uy * k }, b = { x: sg.b.x - sg.ux * k, y: sg.b.y - sg.uy * k };
      const d = `M${a.x} ${a.y}L${b.x} ${b.y}`;
      s += `<path class="ow-gap" d="${d}" stroke-width="${px(4.4)}"/><path class="ow-line ${sel ? 'sel' : ''} ${editing && planUI.wallMode ? 'tool' : ''}" d="M${sg.a.x} ${sg.a.y}L${sg.b.x} ${sg.b.y}" stroke-width="${px(sel ? 2.6 : 1.5)}" stroke-dasharray="${px(sel ? 7 : 5)} ${px(sel ? 5 : 4.5)}"/>`;
    }
    if (poly) s += `<polygon class="pl-outline ${shaping ? 'shaping' : ''} ${auto ? 'auto' : ''}" points="${polyStr}" stroke-width="${px(shaping ? 5 : 4)}" stroke-linejoin="round"/>`;
    else if (auto) { /* rooms first, no rooms yet: no outline */ }
    else if (!open) s += `<rect class="pl-outline" x="0" y="0" width="${pl.w}" height="${pl.h}" stroke-width="${px(4)}"/>`;
    else for (const r of pl.rooms) s += `<rect class="pl-outline thin" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" stroke-width="${px(3)}"/>`;
    // doors and windows: a gap in the wall with the door's swing (drawn once on a shared wall)
    const dpoly = doorPoly(pl);
    const segs = (pl.doors || []).length ? planDoorSegs(pl, dpoly) : [];
    for (const sg of segs) {
      const sel = editing && planUI.door === sg.id;
      s += `<g class="pl-door ${sel ? 'sel' : ''} ${isOutside(sg, dpoly) ? 'ext' : ''}" stroke-width="${px(sel ? 2.6 : 2)}">${doorSvg(sg, px, { sel })}</g>`;
      if (editing && !planUI.swap) {
        const mx = (sg.a.x + sg.b.x) / 2, my = (sg.a.y + sg.b.y) / 2;
        s += `<g class="dr-hit-g" data-door="${esc(sg.id)}"><path class="dr-hit" d="M${sg.a.x} ${sg.a.y}L${sg.b.x} ${sg.b.y}" stroke-width="${px(34)}"/>`;
        if (sel) s += `<g class="dr-grip" transform="translate(${mx + sg.nx * px(0)} ${my}) scale(${px(1)})"><circle r="15" class="dr-grip-dot"/><path d="${sg.ux ? 'M-7 0H7M-7 0l3.5-3.5M-7 0l3.5 3.5M7 0l-3.5-3.5M7 0l-3.5 3.5' : 'M0 -7V7M0 -7l-3.5 3.5M0 -7l3.5 3.5M0 7l-3.5-3.5M0 7l3.5-3.5'}" class="dr-grip-ic"/></g>`;
        s += '</g>';
      }
    }
    if (editing && planUI.ow && !planUI.swap) {
      const sg = osegs.find((x) => x.id === planUI.ow);
      if (sg) {
        const L = sg.to - sg.from;
        if (showFeet() && L * z >= 46) s += `<text x="${(sg.a.x + sg.b.x) / 2 - sg.uy * px(13)}" y="${(sg.a.y + sg.b.y) / 2 + sg.ux * px(-9) + sg.uy * px(4)}" font-size="${px(12)}" text-anchor="middle" class="ow-len">${fmtFtIn(L)} open</text>`;
        for (const [end, p] of [['from', sg.a], ['to', sg.b]]) s += `<g class="ow-grip" data-owend="${end}" transform="translate(${p.x} ${p.y}) scale(${px(1)})"><circle r="22" class="ow-grip-hit"/><circle r="12" class="ow-grip-dot"/><path d="${sg.ux ? 'M-4.5 0H4.5' : 'M0 -4.5V4.5'}" class="ow-grip-ic"/></g>`;
      }
    }
    if (editing && planUI.sel) {
      const r = pl.rooms.find((x) => x.id === planUI.sel);
      if (r) {
        // big corner handles: drag one to resize (the opposite corner stays put)
        const hs = [['nw', r.x, r.y], ['ne', r.x + r.w, r.y], ['sw', r.x, r.y + r.h], ['se', r.x + r.w, r.y + r.h]];
        if (!planUI.swap && lift !== r.id) for (const [c, hx, hy] of hs) s += `<g class="pl-h h-size" data-h="${c}" transform="translate(${hx} ${hy}) scale(${px(1)})"><circle r="26" class="h-hit"/><circle r="13" class="h-dot"/><path d="${{ nw: 'M-4 3V-4H3', ne: 'M-3 -4H4V3', sw: 'M-4 -3V4H3', se: 'M-3 4H4V-3' }[c]}" class="h-ic"/></g>`;
      }
    }
    if (shaping && poly) {
      // walls: drag anywhere along one (wide invisible hit line); ⊕ outside the wall = + Corner
      const n = poly.length, cw = Math.sign(polyArea(poly)) || 1;
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (!len) continue;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        const ox = ((b.y - a.y) / len) * cw, oy = (-(b.x - a.x) / len) * cw; // outward
        s += `<g class="sh-e" data-e="${i}"><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${px(40)}" class="sh-hit"/>`;
        if (len * z >= 40) s += `<g transform="translate(${mx} ${my}) rotate(${ang}) scale(${px(1)})" class="sh-grip"><rect x="-19" y="-8" width="38" height="16" rx="8"/><path d="M-6 -3.5v7M0 -3.5v7M6 -3.5v7"/></g>`;
        s += '</g>';
        if (feet && len * z >= 90) {
          // the wall's length, just outside the wall beside its grip
          const t = Math.round(len), side = Math.abs(ox) > Math.abs(oy);
          s += side ? `<text class="sh-len" x="${mx + ox * px(12)}" y="${my + px(40)}" font-size="${px(12)}" text-anchor="${ox > 0 ? 'start' : 'end'}">${t} ft</text>`
            : `<text class="sh-len" x="${mx + px(26)}" y="${my + oy * px(14) + px(4)}" font-size="${px(12)}" text-anchor="start">${t} ft</text>`;
        }
        if (len * z >= 64) s += `<g class="sh-add" data-add="${i}" transform="translate(${mx + ox * px(34)} ${my + oy * px(34)}) scale(${px(1)})"><circle r="22" class="h-hit"/><circle r="13" class="sh-add-dot"/><path d="M-6 0H6M0 -6V6"/></g>`;
      }
      poly.forEach((p, i) => { s += `<g class="sh-c ${planUI.corner === i ? 'sel' : ''}" data-c="${i}" transform="translate(${p.x} ${p.y}) scale(${px(1)})"><circle r="25" class="h-hit"/><circle r="${planUI.corner === i ? 15 : 12}" class="sh-dot"/></g>`; });
    }
    for (const d of pins) {
      const cls = planUI.bid ? (d.breakerId === planUI.bid ? 'hit' : 'dim') : '';
      s += `<g class="pin lvl-${lvlOf(d)} ${cls} ${planUI.oid === d.id ? 'sel' : ''} ${editing || shaping ? 'mute' : ''}" data-o="${esc(d.id)}" transform="translate(${d.pos.x} ${d.pos.y}) scale(${px(pinS)})">
        <circle r="23" class="pin-hit"/><circle r="17" class="pin-ring"/><circle r="12.5" class="pin-dot"/>
        <g transform="translate(-12 -12)" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round">${PIN_ICON[pinKind(d)]}</g><title>${esc(devName(d))}</title></g>`;
    }
    if (ghost) s += `<g class="pin ghost" transform="translate(${ghost.x} ${ghost.y}) scale(${px(pinS)})"><circle r="17" class="pin-ring"/><circle r="12.5" class="pin-dot"/><g transform="translate(-12 -12)" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round">${PIN_ICON[planUI.kind] || PIN_ICON.other}</g></g>`;
    return s;
  };
  const svgAttrs = () => {
    const z = planUI.z;
    return `viewBox="${-P} ${-P} ${plan.w + 2 * P} ${plan.h + 2 * P}" width="${Math.round((plan.w + 2 * P) * z)}" height="${Math.round((plan.h + 2 * P) * z)}"`;
  };

  // ---- toolbar per mode
  const m = planUI.mode;
  const kinds = PIN_KINDS.map((k) => `<button type="button" class="pk ${planUI.kind === k.v ? 'on' : ''}" data-kind="${k.v}" aria-pressed="${planUI.kind === k.v}">${pinIconSvg(k.v)}<span>${k.t}</span></button>`).join('');
  const placingDev = planUI.placing && byId('devices', planUI.placing);
  let tools = '';
  const last = (planUI.undo || []).filter((u) => u.floor === plan.floor).length;
  const zoomBtns = '<button type="button" class="icon-btn small" id="plOut" aria-label="Zoom out">−</button><button type="button" class="icon-btn small" id="plIn" aria-label="Zoom in">+</button>';
  const undoBtn = last ? '<button type="button" class="btn small" id="plUndo" aria-label="Undo the last room change">↶ Undo</button>' : '';
  const over = [...overlapping(plan.rooms)].map((id) => plan.rooms.find((r) => r.id === id).name || 'Room');
  const outNames = plan.outlinePts ? [...roomsOutside(plan.rooms, plan.outlinePts)].map((id) => plan.rooms.find((r) => r.id === id).name || 'Room') : [];
  const outTxt = outNames.length ? `<p class="pl-hint warn">⚠️ ${esc(outNames.join(', '))} ${outNames.length === 1 ? 'sticks' : 'stick'} out of the house.${m === 'shape' ? ' Pull the wall out, or move ' + (outNames.length === 1 ? 'it' : 'them') + ' in Move rooms.' : ' That\'s OK if it\'s on purpose.'}</p>` : '';
  const feetBox = `<label class="pl-check pl-feet"><input type="checkbox" id="plFeet" ${showFeet() ? 'checked' : ''}> Show sizes</label>`;
  const hb = bboxOf(shapeOf(plan));
  const aboutTxt = `about ${Math.round(hb.w)} × ${Math.round(hb.h)} ft`;
  const overTxt = over.length ? `<p class="pl-hint warn">⚠️ ${esc(over.join(', '))} overlap${over.length === 2 ? '' : ' each other'}. That's OK if it's on purpose.</p>` : '';
  if (m === 'shape') {
    tools = `<div class="pl-tools pl-shape-top">
      <div class="pk-row pl-presets" role="group" aria-label="Quick shapes">${SHAPE_PRESETS.map((k) => `<button type="button" class="pk" data-preset="${k.v}" aria-label="${k.t} shape">${shapeIc(k.v)}<span>${k.t}</span></button>`).join('')}</div>
      <button type="button" class="btn small primary" id="plDone">Done</button>
    </div>
    <p class="pl-hint move"><b>Drag a wall or a corner</b> to shape your house by eye. Tap <b class="pl-plus">+</b> on a wall to add a corner, tap a corner to remove it.</p>
    <div class="pl-fit" role="group" aria-label="When the house is stretched"><span>Rooms</span><button type="button" class="${fitRooms() ? 'on' : ''}" data-fit="1" aria-pressed="${fitRooms()}">Stretch with house</button><button type="button" class="${fitRooms() ? '' : 'on'}" data-fit="0" aria-pressed="${!fitRooms()}">Keep as they are</button></div>
    <div class="pl-tools pl-tools2">${undoBtn}${showFeet() ? `<b class="pl-about" id="plAbout">${aboutTxt}</b>` : ''}<span class="pl-zoom">${zoomBtns}</span></div>
    ${outTxt}
    <div class="pl-size">${feetBox}${showFeet() ? `<details class="pl-exact"><summary>Type a size instead</summary><label>W <input id="plW" type="number" inputmode="numeric" min="6" max="200" value="${Math.round(hb.w)}"></label><span>×</span><label>L <input id="plH" type="number" inputmode="numeric" min="6" max="200" value="${Math.round(hb.h)}"></label><span>ft</span></details>` : ''}</div>`;
  } else if (m === 'rooms') {
    tools = `<div class="pl-tools">
      <button type="button" class="btn small" id="plAddRoom">+ Room</button>
      <button type="button" class="btn small" id="plTemplates">Templates</button>
      <label class="btn small pl-photo-btn">📷 Photo<input type="file" accept="image/*" id="plPhoto" hidden></label>
      <button type="button" class="btn small primary" id="plDone">Done</button>
    </div>
    <div class="pl-tools pl-tools2"><button type="button" class="btn small pl-move-btn ${planUI.doorAdd ? 'on' : ''}" id="plAddDoor" aria-pressed="${!!planUI.doorAdd}">${DOOR_IC} + Door</button>${plan.rooms.length ? `<button type="button" class="btn small pl-move-btn ${planUI.wallMode ? 'on' : ''}" id="plNoWall" aria-pressed="${!!planUI.wallMode}">${NOWALL_IC} No wall</button>` : ''}<button type="button" class="btn small pl-move-btn" id="plShape">${HOUSE_IC} Shape house</button>${undoBtn}<span class="pl-zoom">${zoomBtns}</span></div>
    <div class="pl-fit pl-auto" role="group" aria-label="House outline"><span>Outline</span><button type="button" class="${plan.autoOutline ? 'on' : ''}" data-auto="1" aria-pressed="${!!plan.autoOutline}">Auto from rooms</button><button type="button" class="${plan.autoOutline ? '' : 'on'}" data-auto="0" aria-pressed="${!plan.autoOutline}">Keep as is</button></div>
    ${(!plan.autoOutline && plan.rooms.length) || planHasDrawing(plan) ? `<div class="pl-tools pl-tools2">${!plan.autoOutline && plan.rooms.length ? '<button type="button" class="btn small" id="plMakeOutline">⬚ Make outline from rooms</button>' : ''}${planHasDrawing(plan) ? `<button type="button" class="btn small" id="plScratch">${SCRATCH_IC} Start from scratch</button>` : ''}</div>` : ''}
    <p class="pl-hint move">${planUI.wallMode ? '<b>Tap a wall that isn\'t really there</b> (like kitchen to living room). It turns into a dashed line, and the rooms stay separate.' : planUI.doorAdd ? `<b>Tap a wall</b>${planUI.doorAdd !== '*' ? ` of ${esc((plan.rooms.find((r) => r.id === planUI.doorAdd) || {}).name || 'the room')}` : ''} where the door goes. Outside walls work too.` : planUI.swap ? `Now tap the room to swap with <b>${esc((plan.rooms.find((r) => r.id === planUI.swap) || {}).name || 'this room')}</b>.` : !plan.rooms.length ? '<b>Tap + Room</b> to add your first room. Add the rest next to it' + (plan.autoOutline ? ' and the house outline draws itself.' : '.') : `<b>Press any room and drag it.</b> Tap a room for Size, + Door, Swap, Turn, and corner handles.${plan.autoOutline ? ' The outline follows your rooms.' : ''}`}</p>${overTxt}${plan.autoOutline ? '' : outTxt}
    <div class="pl-size">${feetBox}${plan.outline === 'rooms' && !plan.outlinePts && !plan.autoOutline ? `<label class="pl-check" title="A garage sticking out: the rooms are the outline"><input type="checkbox" id="plOpen" checked> Outline = rooms</label>` : ''}</div>
    ${plan.photoId ? `<div class="pl-size pl-photo-row"><span>Photo</span><label class="pl-fade">Fade <input id="plFade" type="range" min="10" max="90" step="5" value="${Math.round(plan.photoOpacity * 100)}"></label><button type="button" class="btn small" id="plRot" aria-label="Turn photo">↻ Turn</button><button type="button" class="btn small" id="plPhotoDel">Remove</button></div>` : ''}
    <p class="muted tiny pl-hint">Dragging snaps to 1 ft. For exact feet and inches, tap a room, then Size. Plugs and doors move with their room.${plan.autoOutline ? ' Rooms up to 2 ft apart join into one house.' : ''}${plan.photoId ? ' The photo stays on this phone' + (store.mode === 'cloud' ? ' and in your account' : '') + '.' : ''}</p>`;
  } else if (m === 'add') {
    tools = `<div class="pl-tools">${placingDev ? `<b class="pl-placing">${pinIconSvg(pinKind(placingDev))} ${esc(devName(placingDev))}</b>` : `<div class="pk-row">${kinds}</div>`}<button type="button" class="btn small" id="plCancel">Cancel</button></div>
    <p class="pl-hint add">${placingDev ? `Tap where <b>${esc(devName(placingDev))}</b> is${placingDev.room ? ` (${esc(placingDev.room)})` : ''}.` : 'Tap the wall where it is.'} It snaps to the nearest wall.</p>`;
  } else {
    tools = `<div class="pl-tools">
      <button type="button" class="btn small primary" id="plAdd">+ Plug</button>
      <button type="button" class="btn small pl-move-btn" id="plEdit">${plan.rooms.length ? `${MOVE_IC} Move rooms` : 'Draw rooms'}</button>
      <button type="button" class="btn small pl-move-btn" id="plShape">${HOUSE_IC} Shape house</button>
      ${undoBtn}
      <span class="pl-zoom">${zoomBtns}</span>
    </div>
    ${planHasDrawing(plan) ? `<div class="pl-tools pl-tools2 pl-more"><button type="button" class="btn small" id="plScratch">${SCRATCH_IC} Start from scratch</button><button type="button" class="btn small" id="plTemplates">Templates</button></div>` : ''}
    <p class="muted tiny pl-hint">Tap a breaker or a plug to light up everything on it. Drag a plug to move it.${plan.rooms.length ? ' Press and hold a room to move it.' : ''}${plan.rooms.length ? ' Sizes and doors: Move rooms.' : ''}</p>${plan.rooms.some((r) => r.measured) ? `<div class="pl-size pl-size-view">${feetBox}</div>` : ''}${outTxt}`;
  }
  // template picker: shown on an empty plan, or from "Templates"
  const thumb = (tp) => {
    const f = applyTemplate(tp.v, plan, []);
    const rooms = f.floors[0].rooms;
    const W = f.w, H = f.h, s = 64 / Math.max(W, H);
    return `<svg class="tp-thumb" viewBox="-1 -1 ${W + 2} ${H + 2}" width="${Math.round((W + 2) * s)}" height="${Math.round((H + 2) * s)}" aria-hidden="true">${f.outline === 'rooms' ? '' : `<rect x="0" y="0" width="${W}" height="${H}" class="tp-out" stroke-width="${1.6 / s}"/>`}${rooms.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="tp-room" stroke-width="${1 / s}"/>`).join('')}${tp.v === 'blank' ? `<path d="M${W / 2 - 4 / s} ${H / 2}h${8 / s}M${W / 2} ${H / 2 - 4 / s}v${8 / s}" class="tp-plus" stroke-width="${1.6 / s}"/>` : ''}</svg>`;
  };
  const showPicker = planUI.picker || (!plan.rooms.length && plan.floors.length === 1 && m === 'view');
  const picker = showPicker ? `<div class="card pl-empty"><div class="card-head"><b>${planHasDrawing(plan) ? 'Start over' : 'Draw your home'}</b>${last && !planUI.picker ? '<button type="button" class="btn small" id="plUndo2">↶ Undo</button>' : ''}${planUI.picker ? '<button type="button" class="icon-btn small" id="plPickClose" aria-label="Close">✕</button>' : ''}</div>
    <p class="muted tiny">Start blank, or pick the closest layout and drag the rooms to match.</p>
    <div class="pl-start" role="group" aria-label="Start blank">
      <button type="button" class="pl-start-btn" data-start="rooms">${ROOMS_IC}<b>Start blank: rooms first</b><small>Add rooms. The house outline draws itself around them.</small></button>
      <button type="button" class="pl-start-btn" data-start="outline">${OUTLINE_IC}<b>Start blank: outline first</b><small>Drag the walls to your house shape, then add rooms.</small></button>
    </div>
    <p class="tp-or">Or start from a layout</p>
    <div class="tp-grid">${TEMPLATES.filter((tp) => tp.v !== 'blank').map((tp) => `<button type="button" class="tp" data-tpl="${tp.v}">${thumb(tp)}<b>${esc(tp.t)}</b><small>${esc(tp.sub)}</small></button>`).join('')}</div>
    <label class="btn small pl-photo-btn tp-photo">📷 Trace over a photo or sketch<input type="file" accept="image/*" id="plPhoto" hidden></label></div>` : '';
  const empty = picker;
  const floorTabs = plan.floors.length > 1 || m === 'rooms' ? `<div class="pl-floors" role="tablist" aria-label="Floors">${plan.floors.map((f) => `<button type="button" role="tab" class="${f.id === plan.floor ? 'on' : ''}" aria-selected="${f.id === plan.floor}" data-floor="${esc(f.id)}">${esc(f.name)}</button>`).join('')}${m === 'rooms' ? `<button type="button" class="add" id="plAddFloor">+ Floor</button>${plan.floors.length > 1 && !plan.rooms.length && !placed.length ? '<button type="button" class="add" id="plDelFloor">Remove this floor</button>' : ''}` : ''}</div>` : '';
  const byRoom = new Map();
  for (const d of unplaced) { const r = d.room || NO_ROOM; if (!byRoom.has(r)) byRoom.set(r, []); byRoom.get(r).push(d); }
  const notPlaced = unplaced.length && m === 'view' ? `<div class="card pl-unplaced"><div class="card-head"><h3>Not on the plan yet <span class="count">${unplaced.length}</span></h3></div>
    <p class="muted tiny">Tap one, then tap where it is on the plan.</p>
    ${[...byRoom.entries()].sort((a, b) => roomSort(a[0], b[0])).map(([r, list]) => `<div class="pl-ur"><small class="muted">${esc(r)}</small><div class="pl-uchips">${list.map((d) => `<button type="button" class="pl-uchip lvl-${lvlOf(d)}" data-place="${esc(d.id)}">${pinIconSvg(pinKind(d))}<span>${esc(devName(d))}</span></button>`).join('')}</div></div>`).join('')}</div>` : '';

  const body = `
  <div class="section-head"><h2>House map</h2><div class="head-actions"><a class="btn small" href="#/edit/devices/new?home=${homeId}">+ Add</a></div></div>
  ${mapToggle(homeId, 'plan')}
  ${empty}
  <div class="pl-top">${tools}</div>
  ${floorTabs}
  <div class="pl-wrap ${m === 'add' ? 'adding' : ''} ${m === 'rooms' ? 'editing' : ''} ${m === 'shape' ? 'shaping' : ''}" id="plWrap"><svg id="planSvg" class="plan" ${svgAttrs()} role="img" aria-label="Floor plan, ${plan.w} by ${plan.h} feet">${svgInner(plan)}</svg></div>
  ${notPlaced}
  ${legend.length && m === 'view' ? `<div class="pl-legend"><div class="map-brks" role="list" aria-label="Breakers">${legend.map((i) => `<span role="listitem">${tag(i.breaker.id)}</span>`).join('')}</div>
  <div class="legend"><span class="dot lvl-ok"></span>under 80% <span class="dot lvl-warn"></span>80%+ <span class="dot lvl-over"></span>over 100% <span class="dot lvl-none"></span>no loads</div></div>` : ''}
  <div class="map-bar pl-bar" id="mapBar" hidden></div>`;
  app.innerHTML = shell(homeId, 'map', body);
  bindShell();
  const svg = document.getElementById('planSvg');
  const bar = document.getElementById('mapBar');
  const redraw = (opts) => { svg.innerHTML = svgInner(plan, opts); };
  const rerender = () => renderPlan(homeId, new URLSearchParams());

  // background photo: loaded once, then drawn
  if (plan.photoId && !(planUI.photo && planUI.photo.id === plan.photoId)) {
    planUI.photo = { id: plan.photoId, url: '' };
    store.getPhoto(plan.photoId).then((url) => { if (planUI.photo && planUI.photo.id === plan.photoId) { planUI.photo.url = url || ''; if (document.body.contains(svg)) redraw(); } });
  }

  // ---- bottom bar
  const barFor = () => {
    if (m === 'view' && (planUI.bid || planUI.oid)) {
      const i = planUI.bid && map.breakers[planUI.bid];
      const d = planUI.oid && byId('devices', planUI.oid);
      let html = d ? `<div class="mb-line">${pinIconSvg(pinKind(d))} <b>${esc(devName(d))}</b> <span class="muted">(${esc(d.room || NO_ROOM)})</span>${i ? ' is on' : ''}</div>` : '';
      if (i) {
        const s = sumOf(i.breaker);
        const n = (byBrk[i.breaker.id] || []).length;
        const other = elsewhere.filter((d) => d.breakerId === i.breaker.id);
        const otherTxt = other.length ? ` · ${other.length} on ${[...new Set(other.map((d) => (plan.floors.find((f) => f.id === floorOfPos(d.pos, plan)) || {}).name))].join(', ')}` : '';
        const rms = roomsOnBreaker(plan, i.breaker, data.devices).map((id) => plan.rooms.find((r) => r.id === id).name);
        html += `<div class="mb-top"><span class="btag lvl-${i.level} big static">${esc(i.tag)}</span><b class="mb-label">${esc(i.breaker.label || 'Unlabeled')}</b><button type="button" class="icon-btn small" id="mbClose" aria-label="Close">✕</button></div>
        <div class="mb-sub">${n} on ${plan.floors.length > 1 ? esc((plan.floors.find((f) => f.id === plan.floor) || {}).name) : 'the plan'}${rms.length ? ` · ${esc(rms.join(', '))}` : ''}${esc(otherTxt)}${multi && i.panel ? ` · ${esc(i.panel.name)}` : ''}</div>
        <div class="mb-sub"><b class="lvl-text ${s.level}">Typical ${Math.round(s.pct)}%</b> · ${esc(fmtAmps(s.amps))} of ${s.rating || '?'}A${s.allPct > 100 ? ` · <span class="lvl-text over">⚠️ Peak ${Math.round(s.allPct)}%</span>` : ` · Peak ${Math.round(s.allPct)}%`}</div>
        ${wireSubHtml(d, i.breaker)}
        <div class="mb-actions">${d ? `<a class="btn small" href="#/h/${homeId}/device/${d.id}">Open plug</a>` : ''}<a class="btn small primary" href="#/h/${homeId}/breaker/${i.breaker.id}">Open breaker ›</a></div>`;
      } else if (d) {
        html += `<div class="mb-top"><b class="mb-label">No breaker set yet</b><button type="button" class="icon-btn small" id="mbClose" aria-label="Close">✕</button></div><div class="mb-actions"><a class="btn small primary" href="#/edit/devices/${d.id}?home=${homeId}">Pick its breaker</a></div>`;
      }
      if (d) html += `<button type="button" class="linkish tiny" id="plUnplace">Take it off the plan</button>`;
      return html;
    }
    if (m === 'shape' && planUI.corner >= 0) {
      const n = shapeOf(plan).length;
      if (planUI.corner < n) return `<div class="mb-top"><b class="mb-label">Corner picked</b><button type="button" class="icon-btn small" id="mbClose" aria-label="Close">✕</button></div>
        <div class="mb-sub">Drag it to move it, or take it out (the walls on each side join up).</div>
        <div class="mb-actions"><button type="button" class="btn small danger-ghost" id="plDelCorner" ${n <= 3 ? 'disabled' : ''}>Remove corner</button><button type="button" class="btn small primary" id="plCornerOk">Done</button></div>`;
    }
    if (m === 'rooms' && planUI.ow && !planUI.swap) {
      const o = (plan.openWalls || []).find((x) => x.id === planUI.ow);
      const room = o && plan.rooms.find((r) => r.id === o.roomId);
      if (room) {
        const len = o.wall === 'n' || o.wall === 's' ? room.w : room.h;
        const L = o.toFt - o.fromFt, whole = o.fromFt <= 0.01 && o.toFt >= len - 0.01;
        const sh = sharedSpan(plan, room, o.wall, (o.fromFt + o.toFt) / 2);
        const isShared = sh && Math.abs(sh.t0 - o.fromFt) < 0.01 && Math.abs(sh.t1 - o.toFt) < 0.01;
        const fp = ftInParts(o.fromFt), lp = ftInParts(L);
        const sideW = SIDE_WORDS[o.wall].toLowerCase();
        return `<div class="mb-top"><b class="mb-label">${NOWALL_IC} No wall · ${esc(room.name || 'Room')}${sh ? ` <span class="muted">| ${esc(sh.other.name || 'Room')}</span>` : ''}</b><button type="button" class="icon-btn small" id="mbClose" aria-label="Close">✕</button></div>
        <div class="mb-sub"><b>${fmtFtIn(L)}</b> of the ${fmtFtIn(len)} ${sideW} wall is open. <span class="muted">Drag the round ends on the plan to open just a section.</span></div>
        <div class="dr-row" role="group" aria-label="How much is open"><button type="button" class="dr-chip ${whole ? 'on' : ''}" data-owspan="whole" aria-pressed="${whole}">Whole wall</button>${sh && !(sh.t0 <= 0.01 && sh.t1 >= len - 0.01) ? `<button type="button" class="dr-chip ${isShared ? 'on' : ''}" data-owspan="shared" aria-pressed="${!!isShared}">Only where it meets ${esc(sh.other.name || 'the room')}</button>` : ''}</div>
        <div class="dr-row dr-custom ow-exact"><span class="dr-lbl">From ${o.wall === 'n' || o.wall === 's' ? 'left' : 'top'}</span><label><input id="owFf" type="number" inputmode="numeric" min="0" max="200" value="${fp.ft}" aria-label="From feet"><span>ft</span></label><label><input id="owFi" type="number" inputmode="numeric" min="0" max="11" value="${fp.in}" aria-label="From inches"><span>in</span></label></div>
        <div class="dr-row dr-custom ow-exact"><span class="dr-lbl">Open for</span><label><input id="owLf" type="number" inputmode="numeric" min="0" max="200" value="${lp.ft}" aria-label="Open length feet"><span>ft</span></label><label><input id="owLi" type="number" inputmode="numeric" min="0" max="11" value="${lp.in}" aria-label="Open length inches"><span>in</span></label></div>
        <div class="mb-actions"><button type="button" class="btn small" id="owBack">Put wall back</button><button type="button" class="btn small primary" id="owOk">Done</button></div>`;
      }
    }
    if (m === 'rooms' && planUI.wallMode && !planUI.swap) {
      return `<div class="mb-top"><b class="mb-label">${NOWALL_IC} No wall</b><button type="button" class="icon-btn small" id="owModeX" aria-label="Close">✕</button></div>
        <div class="mb-sub">Tap a wall that isn't really there. Where two rooms touch, only the part they share opens. Tap a dashed line to change it or put the wall back.</div>
        <div class="mb-actions"><button type="button" class="btn small primary" id="owModeOk">Done</button></div>`;
    }
    if (m === 'rooms' && planUI.doorAdd) {
      return `<div class="mb-top"><b class="mb-label">${DOOR_IC} Add a door</b><button type="button" class="icon-btn small" id="plDoorAddX" aria-label="Cancel">✕</button></div>
        <div class="mb-sub">Tap the wall where it goes. You can slide it after, and pick the width and swing.</div>
        <div class="mb-actions"><button type="button" class="btn small" id="plDoorAddCancel">Cancel</button></div>`;
    }
    if (m === 'rooms' && planUI.door) {
      const d = (plan.doors || []).find((x) => x.id === planUI.door);
      const poly = doorPoly(plan);
      const sg = d && doorSeg(d, plan, poly);
      if (!sg) return '';
      const room = d.roomId !== 'outline' && plan.rooms.find((r) => r.id === d.roomId);
      const ext = isOutside(sg, poly);
      const kind = d.kind || 'door';
      const kt = (DOOR_KINDS.find((k) => k.v === kind) || DOOR_KINDS[0]).t;
      const side = isSideways(d.wall) || (sg.uy && !sg.ux);
      const words = { start: side ? 'top' : 'left', end: side ? 'bottom' : 'right' };
      const inW = room ? 'Into room' : 'Inward', outW = room ? 'Out of room' : 'Outward';
      const preset = DOOR_WIDTHS.some((w) => Math.abs(w - d.widthFt) < 0.01) && !planUI.wOther;
      const parts = ftInParts(d.widthFt);
      // little pictures of each swing, drawn on this wall's direction (room side shaded)
      const pic = (swing, hinge) => {
        const ux = sg.ux, uy = sg.uy, nx = sg.nx, ny = sg.ny;
        const a = { x: -0.5 * ux, y: -0.5 * uy }, b = { x: 0.5 * ux, y: 0.5 * uy };
        const q = (p) => `${p.x} ${p.y}`;
        const shade = `<path d="M${q({ x: -1.1 * ux, y: -1.1 * uy })}L${q({ x: 1.1 * ux, y: 1.1 * uy })}L${q({ x: 1.1 * ux + nx * 1.1, y: 1.1 * uy + ny * 1.1 })}L${q({ x: -1.1 * ux + nx * 1.1, y: -1.1 * uy + ny * 1.1 })}Z" class="dp-room"/>`;
        const wall = `<path d="M${q({ x: -1.1 * ux, y: -1.1 * uy })}L${q(a)}M${q(b)}L${q({ x: 1.1 * ux, y: 1.1 * uy })}" class="dp-wall"/>`;
        return `<svg viewBox="-1.15 -1.15 2.3 2.3" width="46" height="46" aria-hidden="true">${shade}${wall}<g class="pl-door" stroke-width="0.09">${doorSvg({ a, b, ux, uy, nx, ny, w: 1, kind, swing, hinge }, (n) => n / 22)}</g></svg>`;
      };
      const swings = kind === 'door' ? [['in', 'start'], ['in', 'end'], ['out', 'start'], ['out', 'end']] : kind === 'double' ? [['in', 'start'], ['out', 'start']] : [];
      return `<div class="mb-top"><b class="mb-label">${DOOR_IC} ${esc(kt)}${room ? ` · ${esc(room.name || 'Room')}` : ''}${ext ? ' <span class="dr-ext">outside</span>' : ''}</b><button type="button" class="icon-btn small" id="mbClose" aria-label="Close">✕</button></div>
        <div class="dr-row" role="group" aria-label="Type">${DOOR_KINDS.map((k) => `<button type="button" class="dr-chip ${kind === k.v ? 'on' : ''}" data-dkind="${k.v}" aria-pressed="${kind === k.v}">${esc(k.t)}</button>`).join('')}</div>
        <div class="dr-row" role="group" aria-label="Width"><span class="dr-lbl">Width</span>${DOOR_WIDTHS.map((w) => `<button type="button" class="dr-chip ${preset && Math.abs(w - d.widthFt) < 0.01 ? 'on' : ''}" data-dw="${w}">${fmtFtIn(w)}</button>`).join('')}<button type="button" class="dr-chip ${preset ? '' : 'on'}" id="drOther" aria-expanded="${!preset}">Other</button></div>
        ${preset ? '' : `<div class="dr-row dr-custom"><span class="dr-lbl">Width</span><label><input id="drWf" type="number" inputmode="numeric" min="1" max="20" value="${parts.ft}" aria-label="Width feet"><span>ft</span></label><label><input id="drWi" type="number" inputmode="numeric" min="0" max="11" value="${parts.in}" aria-label="Width inches"><span>in</span></label></div>`}
        ${swings.length ? `<div class="dr-swings" role="group" aria-label="Which way it opens">${swings.map(([sw, hg]) => { const on = (d.swing === 'out' ? 'out' : 'in') === sw && (kind === 'double' || (d.hinge === 'end' ? 'end' : 'start') === hg); return `<button type="button" class="dr-swing ${on ? 'on' : ''}" data-swing="${sw}" data-hinge="${hg}" aria-pressed="${on}">${pic(sw, hg)}<span>${sw === 'in' ? inW : outW}${kind === 'door' ? `<small>hinge ${words[hg]}</small>` : ''}</span></button>`; }).join('')}</div>` : `<div class="mb-sub muted">${kind === 'window' ? 'A window: drawn as a thin double line.' : 'An opening with no door (a doorway or archway).'}</div>`}
        <div class="mb-sub muted">Drag it along the wall to move it.</div>
        <div class="mb-actions"><button type="button" class="btn small danger-ghost" id="plDelDoor">Delete</button><button type="button" class="btn small primary" id="plDoorOk">Done</button></div>`;
    }
    if (m === 'rooms' && planUI.swap) {
      const r = plan.rooms.find((x) => x.id === planUI.swap);
      if (r) return `<div class="mb-top"><b class="mb-label">⇄ Swap <span class="pl-swapname">${esc(r.name || 'Room')}</span> with…</b><button type="button" class="icon-btn small" id="plSwapX" aria-label="Cancel swap">✕</button></div>
        <div class="mb-sub">Tap the other room on the plan. They trade places, and their plugs go with them.</div>
        <div class="mb-actions"><button type="button" class="btn small" id="plSwapCancel">Cancel</button></div>`;
    }
    if (m === 'rooms' && planUI.sel) {
      const r = plan.rooms.find((x) => x.id === planUI.sel);
      if (!r) return '';
      return `<div class="mb-top"><label class="pl-rn"><span class="sr-only">Room name</span><input id="plRoomName" list="plRoomNames" value="${esc(r.name)}" placeholder="Room name" autocomplete="off"></label><button type="button" class="icon-btn small" id="mbClose" aria-label="Close">✕</button></div>
        <datalist id="plRoomNames">${knownRooms.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="pl-steps"><span>W</span><button type="button" class="icon-btn small" data-step="w-" aria-label="Narrower">−</button><b>${showFeet() ? fmtFtIn(r.w) : ''}</b><button type="button" class="icon-btn small" data-step="w+" aria-label="Wider">+</button>
          <span>L</span><button type="button" class="icon-btn small" data-step="h-" aria-label="Shorter">−</button><b>${showFeet() ? fmtFtIn(r.h) : ''}</b><button type="button" class="icon-btn small" data-step="h+" aria-label="Longer">+</button></div>
        <div class="pl-ract"><button type="button" class="btn pl-big" id="plSize">${RULER_IC} Size</button><button type="button" class="btn pl-big" id="plRoomDoor">${DOOR_IC} + Door</button></div>
        <div class="ow-sides" role="group" aria-label="Walls"><span class="dr-lbl">Walls</span>${WALL_SIDES.map((w) => { const st = sideState(plan, r, w); return `<button type="button" class="ow-side ${st}" data-owside="${w}" aria-pressed="${st === 'wall'}" aria-label="${SIDE_WORDS[w]} wall: ${st === 'wall' ? 'there' : st === 'part' ? 'partly open' : 'no wall'}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1" class="ows-box"/><path d="${{ n: 'M3 3H21', e: 'M21 3V21', s: 'M3 21H21', w: 'M3 3V21' }[w]}" class="ows-wall"/></svg><span>${SIDE_WORDS[w]}<small>${st === 'wall' ? 'wall' : st === 'part' ? 'part open' : 'no wall'}</small></span></button>`; }).join('')}</div>
        <div class="pl-ract">${plan.rooms.length > 1 ? '<button type="button" class="btn pl-big" id="plSwap">⇄ Swap</button>' : ''}<button type="button" class="btn pl-big" id="plTurn" ${r.w === r.h ? 'disabled' : ''}>⟳ Turn</button></div>
        <div class="mb-actions"><button type="button" class="btn small danger-ghost" id="plDelRoom">Delete room</button><button type="button" class="btn small primary" id="plRoomOk">Done</button></div>`;
    }
    if (m === 'add' && planUI.drop) {
      const room = roomAt(plan, planUI.drop.x, planUI.drop.y);
      const rn = room ? room.name : '';
      const same = (d) => rn && (d.room || '').toLowerCase() === rn.toLowerCase();
      const picks = [...unplaced].sort((a, b) => same(b) - same(a)).slice(0, 8);
      const guessB = planUI.bid || (data.breakers.find((b) => rn && (b.rooms || []).some((n) => n.toLowerCase() === rn.toLowerCase())) || {}).id || '';
      const kt = (PIN_KINDS.find((k) => k.v === planUI.kind) || {}).t || 'Outlet';
      return `<div class="mb-top"><b class="mb-label">What's here?${rn ? ` <span class="muted">${esc(rn)}</span>` : ''}</b><button type="button" class="icon-btn small" id="mbClose" aria-label="Cancel">✕</button></div>
        ${picks.length ? `<div class="pl-uchips pl-picks">${picks.map((d) => `<button type="button" class="pl-uchip lvl-${lvlOf(d)}" data-pick="${esc(d.id)}">${pinIconSvg(pinKind(d))}<span>${esc(devName(d))}<small>${esc(d.room || '')}</small></span></button>`).join('')}</div><div class="mb-sub muted">or a new ${esc(kt.toLowerCase())}:</div>` : ''}
        <form id="plNew" class="pl-new"><input name="name" placeholder="${esc(kt)}${rn ? ' in ' + esc(rn) : ''}" aria-label="Name" autocomplete="off">
          <select name="breakerId" aria-label="Breaker"><option value="">Breaker: not sure yet</option>${sortBreakers(data.breakers).map((b) => `<option value="${esc(b.id)}" ${b.id === guessB ? 'selected' : ''}>${esc((map.breakers[b.id] || {}).tag || '')} ${esc(b.label || '')}</option>`).join('')}</select>
          <button class="btn small primary" type="submit">Save</button></form>`;
    }
    return '';
  };
  const showBar = () => {
    const html = barFor();
    bar.innerHTML = html;
    bar.hidden = !html;
    const c = document.getElementById('mbClose');
    if (c) c.onclick = () => { planUI.bid = ''; planUI.oid = ''; planUI.sel = ''; planUI.swap = ''; planUI.corner = -1; planUI.drop = null; planUI.door = ''; planUI.doorAdd = ''; planUI.wOther = false; planUI.ow = ''; if (m === 'add') { planUI.mode = 'view'; planUI.placing = ''; } quietHash(`#/h/${homeId}/map?view=plan`); rerender(); };
    bindBar();
  };
  const select = (bid, oid = '') => {
    planUI.bid = bid || ''; planUI.oid = oid || '';
    quietHash(`#/h/${homeId}/map?view=plan${oid ? '&o=' + encodeURIComponent(oid) : bid ? '&b=' + encodeURIComponent(bid) : ''}`);
    rerender();
  };
  const setMode = (mode) => { quietHash(`#/h/${homeId}/map?view=plan`); if ((mode === 'shape') !== (planUI.mode === 'shape')) planUI.z = 0; planUI.corner = -1; planUI.door = ''; planUI.doorAdd = ''; planUI.wOther = false; planUI.wallMode = false; planUI.ow = ''; planUI.mode = mode; planUI.picker = false; planUI.sel = ''; planUI.swap = ''; planUI.drop = null; if (mode !== 'add') planUI.placing = ''; if (mode !== 'view') { planUI.oid = ''; } rerender(); };
  const placeAt = async (d, pos) => { await store.put('devices', { ...d, pos }); };
  // One room change (move / resize / swap / turn / delete), saved with an undo step.
  // moves = [{ from, to, turn? }]: those rooms get their new rectangle and their plugs go along.
  // Doors go with their room (and go when it's deleted).
  const changeRooms = async (moves, { rooms = null, grow = null } = {}) => {
    const pinPos = movePins(plan, data.devices, moves);
    const next = rooms || plan.rooms.map((r) => { const mv = moves.find((x) => x.from.id === r.id); return mv ? mv.to : r; });
    let doors = plan.doors || [];
    for (const mv of moves) doors = doorsAfterRoomMove(doors, mv.from, mv.to, { turn: mv.turn });
    doors = doorsOfRooms(doors, next);
    let ow = plan.openWalls || [];
    for (const mv of moves) ow = openWallsAfterRoomMove(ow, mv.from, mv.to, { turn: mv.turn });
    ow = openWallsOfRooms(ow, next);
    const same = JSON.stringify(next) === JSON.stringify(plan.rooms) && JSON.stringify(doors) === JSON.stringify(plan.doors || []) && JSON.stringify(ow) === JSON.stringify(plan.openWalls || []) && !Object.keys(pinPos).length;
    if (same) return rerender();
    planUI.undo = [...(planUI.undo || []).slice(-29), { floor: plan.floor, rooms: plan.rooms, doors: plan.doors || [], openWalls: plan.openWalls || [], w: plan.w, h: plan.h, pins: Object.keys(pinPos).map((id) => ({ id, pos: (byId('devices', id) || {}).pos })) }];
    if (grow) { plan.w = grow.w; plan.h = grow.h; }
    plan.doors = doors;
    plan.openWalls = ow;
    if (planUI.ow && !ow.some((o) => o.id === planUI.ow)) planUI.ow = '';
    plan.rooms = next;
    await savePlan(plan);
    for (const [id, pos] of Object.entries(pinPos)) { const d = byId('devices', id); if (d) await store.put('devices', { ...d, pos }); }
  };
  // One house-shape change, saved with an undo step. Rooms (and their plugs) stretch with the
  // house when "Stretch with house" is on; then everything slides so the plan starts at 0, 0.
  const applyShape = async (pts1, { fit = fitRooms() } = {}) => {
    const pts0 = shapeOf(plan);
    pts1 = cleanPts(pts1);
    if (!validShape(pts1)) { toast("That shape crosses itself, try again"); return rerender(); }
    if (plan.outlinePts && JSON.stringify(pts1) === JSON.stringify(cleanPts(pts0))) return rerender();
    const b0 = bboxOf(pts0), b1 = bboxOf(pts1);
    let next = { ...plan, outline: 'box', outlinePts: pts1, autoOutline: false };
    const pins = {};
    if (fit && (b0.x !== b1.x || b0.y !== b1.y || b0.w !== b1.w || b0.h !== b1.h)) {
      const f = fitRoomsToShape(plan, data.devices, b0, b1);
      next.rooms = f.rooms;
      Object.assign(pins, f.pins);
    }
    const devs = data.devices.map((d) => (pins[d.id] ? { ...d, pos: pins[d.id] } : d));
    const n = normalizeShape(next, devs);
    Object.assign(pins, n.pins);
    planUI.undo = [...(planUI.undo || []).slice(-29), { floor: plan.floor, saved: planToSave(plan), pins: Object.keys(pins).map((id) => ({ id, pos: (byId('devices', id) || {}).pos })) }];
    plan = n.plan;
    await savePlan(plan);
    for (const [id, pos] of Object.entries(pins)) { const d = byId('devices', id); if (d) await store.put('devices', { ...d, pos }); }
  };
  // One door change (add / slide / width / swing / delete), saved with an undo step.
  const changeDoors = async (doors) => {
    if (JSON.stringify(doors) === JSON.stringify(plan.doors || [])) return rerender();
    planUI.undo = [...(planUI.undo || []).slice(-29), { floor: plan.floor, rooms: plan.rooms, doors: plan.doors || [], openWalls: plan.openWalls || [], pins: [] }];
    plan.doors = doors;
    await savePlan(plan);
  };
  // One open-wall change (take a wall out / put it back / resize the open section), saved with an
  // undo step. Doors and windows on a stretch that's now open come off in the same step.
  const changeOpen = async (list, { quiet = false } = {}) => {
    const next = { ...plan, openWalls: list };
    const gone = doorsOnOpen(plan.doors || [], next, doorPoly(plan));
    const doors = gone.length ? (plan.doors || []).filter((d) => !gone.includes(d.id)) : plan.doors || [];
    if (JSON.stringify(list) === JSON.stringify(plan.openWalls || []) && !gone.length) { rerender(); return 0; }
    planUI.undo = [...(planUI.undo || []).slice(-29), { floor: plan.floor, rooms: plan.rooms, doors: plan.doors || [], openWalls: plan.openWalls || [], pins: [] }];
    plan.openWalls = list;
    plan.doors = doors;
    if (planUI.ow && !list.some((o) => o.id === planUI.ow)) planUI.ow = '';
    if (planUI.door && gone.includes(planUI.door)) planUI.door = '';
    await savePlan(plan);
    if (gone.length && !quiet) toast(`${gone.length === 1 ? '1 door' : gone.length + ' doors'} on that wall came off · Undo is up top`);
    return gone.length;
  };
  const editDoor = (fn) => {
    const d = (plan.doors || []).find((x) => x.id === planUI.door);
    if (!d) return;
    let n = fn(d);
    const room = n.roomId !== 'outline' && plan.rooms.find((r) => r.id === n.roomId);
    if (room) n = clampDoor(n, room);
    changeDoors(plan.doors.map((x) => (x.id === d.id ? n : x)));
  };
  const undo = async () => {
    const list = planUI.undo || [];
    let i = list.length - 1;
    while (i >= 0 && list[i].floor !== plan.floor) i--;
    if (i < 0) return;
    const u = list[i];
    planUI.undo = list.filter((_, k) => k !== i);
    planUI.corner = -1;
    if (u.saved) { plan = planOf({ ...byId('homes', homeId), floorplan: u.saved }, plan.floor); planUI.picker = false; }
    else {
      if (planUI.sel && !u.rooms.some((r) => r.id === planUI.sel)) planUI.sel = '';
      plan.rooms = u.rooms;
      if (u.doors) { plan.doors = u.doors; if (planUI.door && !u.doors.some((d) => d.id === planUI.door)) planUI.door = ''; }
      if (u.openWalls) { plan.openWalls = u.openWalls; if (planUI.ow && !u.openWalls.some((o) => o.id === planUI.ow)) planUI.ow = ''; }
      if (u.w && u.h && !plan.autoOutline) { plan.w = u.w; plan.h = u.h; }
    }
    await savePlan(plan);
    for (const { id, pos } of u.pins) { const d = byId('devices', id); if (d && pos) await store.put('devices', { ...d, pos }); }
    toast('Undone');
  };

  function bindBar() {
    const un = document.getElementById('plUnplace');
    if (un) un.onclick = async () => { const d = byId('devices', planUI.oid); if (!d) return; const { pos, ...rest } = d; void pos; planUI.oid = ''; quietHash(`#/h/${homeId}/map?view=plan${planUI.bid ? '&b=' + encodeURIComponent(planUI.bid) : ''}`); await store.put('devices', rest); toast('Taken off the plan'); };
    // room editing
    const nm = document.getElementById('plRoomName');
    if (nm) nm.onchange = () => { plan.rooms = plan.rooms.map((r) => (r.id === planUI.sel ? { ...r, name: nm.value.trim() } : r)); savePlan(plan); };
    bar.querySelectorAll('[data-step]').forEach((b) => (b.onclick = () => {
      const [k, sgn] = [b.dataset.step[0], b.dataset.step[1] === '+' ? 1 : -1];
      const r0 = plan.rooms.find((r) => r.id === planUI.sel);
      if (!r0) return;
      changeRooms([{ from: r0, to: resizeRoom(r0, k === 'w' ? sgn : 0, k === 'h' ? sgn : 0, plan) }]);
    }));
    const del = document.getElementById('plDelRoom');
    if (del) del.onclick = () => { const id = planUI.sel; planUI.sel = ''; changeRooms([], { rooms: plan.rooms.filter((r) => r.id !== id) }); };
    const sw = document.getElementById('plSwap');
    if (sw) sw.onclick = () => { planUI.swap = planUI.sel; rerender(); };
    const swx = () => { planUI.swap = ''; rerender(); };
    ['plSwapX', 'plSwapCancel'].forEach((id) => { const el = document.getElementById(id); if (el) el.onclick = swx; });
    const tn = document.getElementById('plTurn');
    if (tn) tn.onclick = () => { const r0 = plan.rooms.find((r) => r.id === planUI.sel); if (r0) changeRooms([{ from: r0, to: rotateRoom(r0, plan), turn: true }]); };
    // open walls (no wall)
    const owExit = () => { planUI.wallMode = false; planUI.ow = ''; rerender(); };
    ['owModeX', 'owModeOk'].forEach((id) => { const el = document.getElementById(id); if (el) el.onclick = owExit; });
    const owOk = document.getElementById('owOk');
    if (owOk) owOk.onclick = () => { planUI.ow = ''; rerender(); };
    const owBack = document.getElementById('owBack');
    if (owBack) owBack.onclick = () => { const id = planUI.ow; planUI.ow = ''; changeOpen(closeWall(plan, id)); toast('Wall put back · Undo is up top'); };
    const curOw = () => (plan.openWalls || []).find((x) => x.id === planUI.ow);
    const editOw = (fn) => { const o = curOw(); if (!o) return; const n = fn(o); if (n) changeOpen(plan.openWalls.map((x) => (x.id === o.id ? n : x))); };
    bar.querySelectorAll('[data-owspan]').forEach((b) => (b.onclick = () => editOw((o) => {
      const room = plan.rooms.find((r) => r.id === o.roomId);
      if (!room) return null;
      const len = o.wall === 'n' || o.wall === 's' ? room.w : room.h;
      if (b.dataset.owspan === 'whole') return { ...o, fromFt: 0, toFt: Math.round(len * 100) / 100 };
      const sh = sharedSpan(plan, room, o.wall, (o.fromFt + o.toFt) / 2);
      return sh ? { ...o, fromFt: Math.round(sh.t0 * 100) / 100, toFt: Math.round(sh.t1 * 100) / 100 } : null;
    })));
    const owIn = ['owFf', 'owFi', 'owLf', 'owLi'].map((id) => document.getElementById(id));
    if (owIn[0]) owIn.forEach((el) => (el.onchange = () => editOw((o) => setOpenSpan(o, plan, (Number(owIn[0].value) || 0) + (Number(owIn[1].value) || 0) / 12, (Number(owIn[2].value) || 0) + (Number(owIn[3].value) || 0) / 12))));
    bar.querySelectorAll('[data-owside]').forEach((b) => (b.onclick = async () => {
      const r = plan.rooms.find((x) => x.id === planUI.sel);
      if (!r) return;
      const w = b.dataset.owside, st = sideState(plan, r, w);
      await changeOpen(setSideOpen(plan, r.id, w, st === 'wall', { id: 'ow' + uid().slice(0, 6) }));
      toast(st === 'wall' ? `${SIDE_WORDS[w]} wall taken out · Undo is up top` : `${SIDE_WORDS[w]} wall put back`);
    }));
    // doors
    const daX = () => { planUI.doorAdd = ''; rerender(); };
    ['plDoorAddX', 'plDoorAddCancel'].forEach((id) => { const el = document.getElementById(id); if (el) el.onclick = daX; });
    const rd = document.getElementById('plRoomDoor');
    if (rd) rd.onclick = () => { planUI.doorAdd = planUI.sel || '*'; planUI.door = ''; planUI.wallMode = false; planUI.ow = ''; rerender(); };
    const sz0 = document.getElementById('plSize');
    if (sz0) sz0.onclick = () => sizeSheet(planUI.sel);
    bar.querySelectorAll('[data-dkind]').forEach((b) => (b.onclick = () => editDoor((d) => {
      const kind = b.dataset.dkind;
      // a double door is usually 5 ft; going back to one door from a double: 3 ft
      const widthFt = kind === 'double' && d.widthFt < 4 ? 5 : d.kind === 'double' && kind === 'door' && d.widthFt >= 4 ? 3 : d.widthFt;
      return { ...d, kind, widthFt };
    })));
    bar.querySelectorAll('[data-dw]').forEach((b) => (b.onclick = () => { planUI.wOther = false; editDoor((d) => { const widthFt = Number(b.dataset.dw); return { ...d, widthFt, kind: widthFt >= 5 && (d.kind || 'door') === 'door' ? 'double' : widthFt < 4 && d.kind === 'double' ? 'door' : d.kind || 'door' }; }); }));
    const oth = document.getElementById('drOther');
    if (oth) oth.onclick = () => { planUI.wOther = true; rerender(); setTimeout(() => { const f = document.getElementById('drWf'); if (f) f.focus(); }, 30); };
    const cw = () => {
      const f = Number(document.getElementById('drWf').value) || 0, i = Number(document.getElementById('drWi').value) || 0;
      const w = f + Math.min(11, Math.max(0, i)) / 12;
      if (!(w >= 1 && w <= 20)) return toast('Width: 1 to 20 ft');
      editDoor((d) => ({ ...d, widthFt: w }));
    };
    ['drWf', 'drWi'].forEach((id) => { const el = document.getElementById(id); if (el) el.onchange = cw; });
    bar.querySelectorAll('[data-swing]').forEach((b) => (b.onclick = () => editDoor((d) => ({ ...d, swing: b.dataset.swing, hinge: b.dataset.hinge }))));
    const dd = document.getElementById('plDelDoor');
    if (dd) dd.onclick = () => { const id = planUI.door; planUI.door = ''; planUI.wOther = false; changeDoors((plan.doors || []).filter((x) => x.id !== id)); toast('Door deleted · Undo is up top'); };
    const dok = document.getElementById('plDoorOk');
    if (dok) dok.onclick = () => { planUI.door = ''; planUI.wOther = false; rerender(); };
    const dc = document.getElementById('plDelCorner');
    if (dc) dc.onclick = () => { const pts = shapeOf(plan), i = planUI.corner; planUI.corner = -1; const next = removeCorner(pts, i); if (next === pts) { toast("Can't take that corner out"); return rerender(); } applyShape(next, { fit: false }); };
    const cok = document.getElementById('plCornerOk');
    if (cok) cok.onclick = () => { planUI.corner = -1; rerender(); };
    const ok = document.getElementById('plRoomOk');
    if (ok) ok.onclick = () => { if (nm && nm.value.trim() !== (plan.rooms.find((r) => r.id === planUI.sel) || {}).name) nm.onchange(); planUI.sel = ''; rerender(); };
    // add: pick an existing outlet, or make a new one
    bar.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = async () => {
      const d = byId('devices', b.dataset.pick);
      const pos = planUI.drop;
      Object.assign(planUI, { mode: 'view', drop: null, placing: '', oid: d.id, bid: d.breakerId || '' });
      await placeAt(d, pos);
      toast(`${devName(d)} placed`);
    }));
    const f = document.getElementById('plNew');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const pos = planUI.drop;
      const room = roomAt(plan, pos.x, pos.y);
      const kt = (PIN_KINDS.find((k) => k.v === planUI.kind) || {}).t || 'Outlet';
      const next = { id: uid(), homeId, ...kindFields(planUI.kind), name: f.name.value.trim() || kt, room: room ? room.name : '', location: '', breakerId: f.breakerId.value, afci: 'unknown', status: 'working', notes: '', readings: [], style: planUI.kind === 'gfci' ? 'gfci' : '', qty: 1, box: '', replace: '', pos, createdAt: Date.now() };
      Object.assign(planUI, { mode: 'view', drop: null, placing: '', oid: next.id, bid: next.breakerId || '' });
      await store.put('devices', next);
      toast(`${next.name} added`);
    };
  }

  // ---- toolbar
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on('plAdd', () => { planUI.bid = ''; setMode('add'); });
  on('plEdit', () => setMode('rooms'));
  on('plAddDoor', () => { if (planUI.doorAdd) planUI.doorAdd = ''; else { planUI.doorAdd = planUI.sel || '*'; planUI.door = ''; planUI.wallMode = false; planUI.ow = ''; } rerender(); });
  on('plNoWall', () => { planUI.wallMode = !planUI.wallMode; Object.assign(planUI, { ow: '', doorAdd: '', door: '', sel: '', swap: '', wOther: false }); rerender(); });
  on('plShape', async () => {
    // Shape house edits the outline by hand, so Auto outline turns off (the last outline stays)
    if (plan.autoOutline) { plan.autoOutline = false; await savePlan(plan); toast('Auto outline is off so you can drag the walls'); }
    setMode('shape'); window.scrollTo(0, 0);
  });
  document.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => {
    const hb0 = bboxOf(shapeOf(plan));
    planUI.corner = -1;
    applyShape(presetShape(b.dataset.preset, hb0.w, hb0.h, hb0.x, hb0.y), { fit: false });
    toast(b.dataset.preset === 'rect' ? 'Rectangle. Drag the walls to fit.' : `${b.dataset.preset} shape. Drag the walls and corners to fit.`);
  }));
  document.querySelectorAll('[data-fit]').forEach((b) => (b.onclick = () => { localStorage.setItem(FIT_KEY, b.dataset.fit); rerender(); }));
  const ft = document.getElementById('plFeet');
  if (ft) ft.onchange = () => { localStorage.setItem(FEET_KEY, ft.checked ? '1' : '0'); rerender(); };
  on('plUndo', undo);
  on('plUndo2', undo);
    on('plDone', () => setMode('view'));
  on('plCancel', () => setMode('view'));
  on('plIn', () => { planUI.z = Math.min(48, planUI.z * 1.4); rerender(); });
  on('plOut', () => { planUI.z = Math.max(fitAll, planUI.z / 1.4); rerender(); });
  document.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { planUI.kind = b.dataset.kind; rerender(); }));
  document.querySelectorAll('[data-place]').forEach((b) => (b.onclick = () => {
    Object.assign(planUI, { mode: 'add', placing: b.dataset.place, drop: null, bid: '', oid: '' });
    rerender();
    document.getElementById('plWrap').scrollIntoView({ block: 'start' });
  }));
  document.querySelectorAll('.pl-legend [data-b]').forEach((b) => (b.onclick = () => (planUI.bid === b.dataset.b && !planUI.oid ? select('') : select(b.dataset.b))));
  on('plAddRoom', () => {
    const spot = newRoomSpot(plan, Math.min(10, plan.w), 10);
    const r = clampRoom({ id: 'fr' + uid().slice(0, 6), name: '', ...spot }, plan);
    plan.rooms = [...plan.rooms, r];
    planUI.sel = r.id; planUI.mode = 'rooms';
    savePlan(plan);
  });
  on('plTemplates', () => { planUI.picker = true; planUI.sel = ''; rerender(); window.scrollTo(0, 0); });
  on('plPickClose', () => { planUI.picker = false; rerender(); });

  // ---- start from scratch / rooms first
  const undoSaved = (pins = []) => { planUI.undo = [...(planUI.undo || []).slice(-29), { floor: plan.floor, saved: planToSave(plan), pins }]; };
  // then: 'rooms' (rooms first, Auto outline on), 'outline' (Shape house), or '' (the empty plan)
  const doClear = async (takePins, then = '') => {
    const onPlan = takePins ? data.devices.filter((d) => d.pos) : [];
    if (planHasDrawing(plan) || onPlan.length) undoSaved(onPlan.map((d) => ({ id: d.id, pos: d.pos })));
    plan = clearPlan(plan, { autoOutline: then === 'rooms' });
    Object.assign(planUI, { sel: '', swap: '', corner: -1, drop: null, z: 0, picker: !then && plan.floors.length > 1, mode: then === 'rooms' ? 'rooms' : then === 'outline' ? 'shape' : 'view' });
    quietHash(`#/h/${homeId}/map?view=plan`);
    await savePlan(plan);
    for (const d of onPlan) { const { pos, ...rest } = byId('devices', d.id) || d; void pos; await store.put('devices', rest); }
    if (then === 'rooms') toast('Tap + Room to add your first room');
    else if (then === 'outline') toast('Drag the walls to shape your house. No measuring needed.');
    else toast('Floor plan cleared. Undo brings it back.');
    window.scrollTo(0, 0);
  };
  // Room size: type what you measured (feet + inches). The top-left corner stays put.
  const sizeSheet = (roomId) => {
    const r0 = plan.rooms.find((r) => r.id === roomId);
    if (!r0) return;
    const W0 = ftInParts(r0.w), H0 = ftInParts(r0.h);
    const box = (id, v, max, lbl) => `<label class="sz-box"><input id="${id}" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${max}" value="${v}" aria-label="${lbl}"><span>${lbl.split(' ').pop()}</span></label>`;
    const el = document.createElement('div');
    el.className = 'pl-sheet-bg';
    el.innerHTML = `<div class="pl-sheet pl-size-sheet" role="dialog" aria-modal="true" aria-labelledby="szT">
      <h3 id="szT">${RULER_IC} ${esc(r0.name || 'Room')} size</h3>
      <p class="muted tiny">Type what you measured. Width goes across the plan, length goes down it.</p>
      <div class="sz-row"><b>Width</b>${box('szWf', W0.ft, 200, 'Width ft')}${box('szWi', W0.in, 11, 'Width in')}</div>
      <div class="sz-row"><b>Length</b>${box('szHf', H0.ft, 200, 'Length ft')}${box('szHi', H0.in, 11, 'Length in')}</div>
      <p class="sz-prev" id="szPrev"></p>
      <button type="button" class="btn full primary" id="szGo">Set size</button>
      <button type="button" class="btn full" id="szNo">Cancel</button>
    </div>`;
    document.body.appendChild(el);
    const v = (id) => Number(el.querySelector('#' + id).value) || 0;
    const read = () => ({ w: v('szWf') + Math.min(11, v('szWi')) / 12, h: v('szHf') + Math.min(11, v('szHi')) / 12 });
    const prev = () => { const { w, h } = read(); el.querySelector('#szPrev').textContent = w >= 3 && h >= 3 ? `${fmtFtIn(w)} × ${fmtFtIn(h)}` : 'At least 3 ft each way'; };
    el.querySelectorAll('input').forEach((i) => { i.oninput = prev; i.onfocus = () => i.select(); });
    prev();
    const close = () => el.remove();
    el.onclick = (e) => { if (e.target === el) close(); };
    el.querySelector('#szNo').onclick = close;
    el.querySelector('#szGo').onclick = async () => {
      const { w, h } = read();
      if (!(w >= 3 && h >= 3 && w <= 200 && h <= 200)) return toast('At least 3 ft each way');
      const cur = plan.rooms.find((r) => r.id === roomId);
      if (!cur) return close();
      const res = setRoomSize(cur, w, h, plan);
      close();
      await changeRooms([{ from: cur, to: res.room }], { grow: res.plan !== plan ? { w: res.plan.w, h: res.plan.h } : null });
      toast(`${cur.name || 'Room'} is ${fmtFtIn(res.room.w)} × ${fmtFtIn(res.room.h)}`);
    };
    setTimeout(() => { const f = el.querySelector('#szWf'); if (f) f.focus(); }, 60);
  };
  const scratchSheet = (then = '') => {
    const n = data.devices.filter((d) => d.pos).length;
    const multiF = plan.floors.length > 1;
    const el = document.createElement('div');
    el.className = 'pl-sheet-bg';
    el.innerHTML = `<div class="pl-sheet" role="dialog" aria-modal="true" aria-labelledby="plSheetT">
      <h3 id="plSheetT">Clear the floor plan?</h3>
      <p>Your breakers, outlets and devices stay. Only the room boxes and the house outline${multiF ? ' (on every floor)' : ''} are cleared.</p>
      ${n ? `<label class="pl-check pl-sheet-pins"><input type="checkbox" id="plSheetPins"> Also take the ${n} plug${n === 1 ? '' : 's'} off the plan</label>` : ''}
      <p class="muted tiny">Changed your mind after? Tap Undo.</p>
      <button type="button" class="btn full pl-sheet-go" id="plSheetGo">Clear floor plan</button>
      <button type="button" class="btn full" id="plSheetNo">Cancel</button>
    </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.onclick = (e) => { if (e.target === el) close(); };
    el.querySelector('#plSheetNo').onclick = close;
    el.querySelector('#plSheetGo').onclick = () => { const pins = el.querySelector('#plSheetPins'); const take = !!(pins && pins.checked); close(); doClear(take, then); };
    el.querySelector('#plSheetGo').focus();
  };
  on('plScratch', () => scratchSheet(''));
  document.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => {
    if (planHasDrawing(plan)) return scratchSheet(b.dataset.start);
    doClear(false, b.dataset.start);
  }));
  document.querySelectorAll('[data-auto]').forEach((b) => (b.onclick = async () => {
    const want = b.dataset.auto === '1';
    if (want === !!plan.autoOutline) return;
    if (want) {
      undoSaved();
      plan.autoOutline = true;
      await savePlan(plan);
      toast(plan.rooms.length ? 'Outline now follows your rooms' : 'Add rooms and the outline draws itself');
    } else {
      plan.autoOutline = false;
      await savePlan(plan);
      toast('Outline stays as it is. Shape house can change it.');
    }
  }));
  on('plMakeOutline', async () => {
    const pts = outlineFromRooms(plan.rooms);
    if (pts.length < 4) return toast('Add a room first');
    undoSaved();
    plan = { ...plan, outline: 'box', outlinePts: pts };
    await savePlan(plan);
    toast('Outline made from your rooms. Shape house can tweak it.');
  });
  document.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = async () => {
    const any = plan.floors.some((f) => f.rooms.length);
    if (any && !confirm('Replace your rooms with this layout? Plugs stay where they are.')) return;
    const f = applyTemplate(b.dataset.tpl, plan, knownRooms);
    plan = { ...plan, w: f.w, h: f.h, outline: f.outline, floors: f.floors, floor: f.floors[0].id, rooms: f.floors[0].rooms, outlinePts: null, autoOutline: false, doors: [], openWalls: [] };
    Object.assign(planUI, { picker: false, mode: 'rooms', sel: '', floor: plan.floor, z: 0, corner: -1 });
    await savePlan(plan);
    if (b.dataset.tpl === 'blank') { planUI.mode = 'shape'; planUI.z = 0; await savePlan(plan); }
    toast(b.dataset.tpl === 'blank' ? 'Drag the walls to shape your house. No measuring needed.' : 'Layout added. Drag rooms to match, or Shape house to stretch it.');
  }));
  document.querySelectorAll('[data-floor]').forEach((b) => (b.onclick = () => { Object.assign(planUI, { floor: b.dataset.floor, sel: '', bid: planUI.bid, oid: '' }); quietHash(`#/h/${homeId}/map?view=plan`); rerender(); }));
  on('plAddFloor', () => {
    const n = plan.floors.length + 1;
    let id = 'f' + n;
    while (plan.floors.some((f) => f.id === id)) id += 'x';
    plan = { ...plan, floors: [...plan.floors.map((f) => (f.id === plan.floor ? { ...f, rooms: plan.rooms, doors: plan.doors || [], openWalls: plan.openWalls || [] } : f)), { id, name: `Floor ${n}`, rooms: [], ...(plan.outlinePts ? { outlinePts: plan.outlinePts } : {}) }], floor: id, rooms: [], doors: [], openWalls: [] };
    planUI.floor = id; planUI.sel = '';
    plan.outlinePts = plan.floors.find((f) => f.id === id).outlinePts || null;
    savePlan(plan);
  });
  on('plDelFloor', () => {
    const floors = plan.floors.filter((f) => f.id !== plan.floor);
    plan = { ...plan, floors, floor: floors[0].id, rooms: floors[0].rooms, outlinePts: floors[0].outlinePts || null, doors: floors[0].doors || [], openWalls: floors[0].openWalls || [] };
    planUI.floor = plan.floor;
    savePlan(plan);
  });
  const op = document.getElementById('plOpen');
  if (op) op.onchange = () => { plan.outline = op.checked ? 'rooms' : 'box'; savePlan(plan); };
  // typed size (optional, Show feet on): the house shape stretches to it
  const sz = () => {
    const w = Number(document.getElementById('plW').value), h = Number(document.getElementById('plH').value);
    if (!(w >= 6 && h >= 6 && w <= 200 && h <= 200)) return;
    const pts = shapeOf(plan), b = bboxOf(pts);
    applyShape(pts.map((p) => ({ x: b.x + ((p.x - b.x) * w) / (b.w || 1), y: b.y + ((p.y - b.y) * h) / (b.h || 1) })));
  };
  ['plW', 'plH'].forEach((id) => { const el = document.getElementById(id); if (el) el.onchange = sz; });
  const fade = document.getElementById('plFade');
  if (fade) { fade.oninput = () => { plan.photoOpacity = Number(fade.value) / 100; redraw(); }; fade.onchange = () => savePlan(plan); }
  on('plRot', () => { plan.photoRot = ((plan.photoRot || 0) + 90) % 360; savePlan(plan); });
  on('plPhotoDel', async () => { if (!confirm('Remove the photo?')) return; const id = plan.photoId; plan.photoId = ''; planUI.photo = null; await savePlan(plan); if (id) store.removePhoto(id).catch(() => {}); });
  const ph = document.getElementById('plPhoto');
  if (ph) ph.onchange = async () => {
    const file = ph.files && ph.files[0];
    if (!file) return;
    toast('Shrinking photo...');
    try {
      const url = await compressPhoto(file, { maxSide: 1400, maxBytes: 300_000 });
      const pid = plan.photoId || 'ph_' + uid();
      await store.putPhoto(pid, url);
      planUI.photo = { id: pid, url };
      plan.photoId = pid;
      planUI.mode = 'rooms';
      await savePlan(plan);
      toast('Photo added. Trace your rooms over it.');
    } catch (e) {
      console.error(e);
      toast("Couldn't use that photo");
    }
  };

  // ---- pointer: tap / drag pins, rooms, handles
  // Rooms: press anywhere inside one and drag to move it (plugs go along). In Move rooms the
  // picked room moves at once and any other after a short press; in the normal view a room
  // is picked up by pressing and holding (ROOM_HOLD_VIEW), so a quick swipe still scrolls.
  const ptOf = (e) => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) / planUI.z - P, y: (e.clientY - r.top) / planUI.z - P }; };
  const roomUnder = (pt) => roomAt(plan, pt.x, pt.y);
  // stop the page from scrolling when a drag starts on a pin, a handle or the picked room (iOS)
  svg.addEventListener('touchstart', (e) => {
    const t = e.target.closest ? e.target : null;
    if (!t) return;
    // iOS keeps sending this touch's moves to the element it started on, even after a redraw
    // takes it out of the page, so the "don't scroll" listener rides on that element too
    t.addEventListener('touchmove', noScroll, { passive: false });
    t.addEventListener('touchend', () => t.removeEventListener('touchmove', noScroll), { once: true });
    if (planUI.mode === 'view' && t.closest('.pin')) e.preventDefault();
    else if (planUI.mode === 'shape' && (t.closest('.sh-c') || t.closest('.sh-e') || t.closest('.sh-add'))) e.preventDefault();
    else if (planUI.mode === 'rooms' && !planUI.swap && !planUI.doorAdd && t.closest('.dr-hit-g')) e.preventDefault();
    else if (planUI.mode === 'rooms' && planUI.ow && t.closest('.ow-grip')) e.preventDefault();
    else if (planUI.mode === 'rooms' && !planUI.swap && (t.closest('.pl-h') || (planUI.sel && t.closest(`.pl-room[data-r="${CSS.escape(planUI.sel)}"]`)))) e.preventDefault();
  }, { passive: false });
  // once a room is picked up, the finger drags it instead of scrolling the page
  const noScroll = (e) => { if (drag && (drag.lifted || drag.shape || drag.door || drag.owEnd) && e.cancelable) e.preventDefault(); };
  svg.addEventListener('touchmove', noScroll, { passive: false });
  svg.addEventListener('contextmenu', (e) => { if (drag && (drag.lifted || drag.timer)) e.preventDefault(); });
  let drag = null;
  const lift = (dr, draw = true) => {
    if (!dr || dr !== drag) return;
    dr.timer = 0;
    dr.lifted = true;
    dr.moved = true;
    try { svg.setPointerCapture(dr.id); } catch { /* pointer already gone */ }
    if (navigator.vibrate) navigator.vibrate(12);
    if (m === 'rooms' && planUI.sel !== dr.room) planUI.sel = dr.room;
    dr.r0 = plan.rooms.find((r) => r.id === dr.room);
    dr.room1 = dr.r0;
    // no redraw inside pointerdown: the touch has to reach its element first (to stop the scroll)
    if (draw) preview(dr);
    autoScroll(dr);
  };
  const preview = (dr) => {
    const r = dr.room1 || dr.r0;
    const moves = [{ from: dr.r0, to: r }];
    const pos = movePins(plan, data.devices, moves);
    const rooms = plan.rooms.map((x) => (x.id === r.id ? r : x));
    const doors = (plan.doors || []).length ? doorsAfterRoomMove(plan.doors, dr.r0, r) : plan.doors;
    const openWalls = (plan.openWalls || []).length ? openWallsAfterRoomMove(plan.openWalls, dr.r0, r) : plan.openWalls;
    svg.innerHTML = svgInner({ ...plan, rooms, doors, openWalls }, { pins: placed.map((d) => (pos[d.id] ? { ...d, pos: pos[d.id] } : d)), lift: dr.lifted && !dr.h ? r.id : '' });
  };
  // dragging a room near the top / bottom of the screen scrolls the page (a single-wide is long)
  const autoScroll = (dr) => {
    const step = () => {
      if (drag !== dr || !dr.lifted) return;
      const y = dr.cy, H = window.innerHeight;
      const v = y < 90 ? -Math.ceil((90 - y) / 6) : y > H - 140 ? Math.ceil((y - (H - 140)) / 6) : 0;
      if (v) { window.scrollBy(0, v); dragTo(dr); }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const dragTo = (dr) => {
    const p = ptOf({ clientX: dr.cx, clientY: dr.cy });
    const dx = p.x - dr.start.x, dy = p.y - dr.start.y;
    if (!dr.r0) return;
    dr.room1 = dr.h ? resizeCorner(dr.r0, dr.h, dx, dy, plan) : snapToRooms(moveRoom(dr.r0, dx, dy, plan), plan.rooms, plan);
    preview(dr);
  };
  // keep the picked door above the door sheet (the sheet covers the bottom of the screen)
  const keepDoorInView = () => setTimeout(() => {
    const el = planUI.door && document.querySelector(`.dr-hit-g[data-door="${CSS.escape(planUI.door)}"]`);
    const sheet = document.getElementById('mapBar');
    if (!el || !sheet || sheet.hidden) return;
    const b = el.getBoundingClientRect(), top = sheet.getBoundingClientRect().top;
    if (b.bottom + 24 > top) window.scrollBy(0, b.bottom + 60 - top);
    else if (b.top < 80) window.scrollBy(0, b.top - 120);
  }, 30);
  // ---- open walls: drag a section's end along its wall (snaps to 6")
  const owMove = (dr, e) => {
    if (!dr.o0) return;
    const p = ptOf(e);
    const n = moveOpenEnd(dr.o0, plan, dr.owEnd, p.x, p.y);
    dr.next = n;
    svg.innerHTML = svgInner({ ...plan, openWalls: (plan.openWalls || []).map((x) => (x.id === n.id ? n : x)) });
    const sb = bar.querySelector('.mb-sub b');
    if (sb) sb.textContent = fmtFtIn(n.toFt - n.fromFt);
  };
  // ---- doors: drag along the wall; pulled well away from it, it hops to the wall under the finger
  const doorMove = (dr, e) => {
    const d0 = dr.d0;
    if (!d0) return;
    const p = ptOf(e), poly = doorPoly(plan);
    let n = slideDoor(d0, plan, p.x, p.y, poly);
    const sg = doorSeg(n, plan, poly);
    if (sg && Math.abs((p.x - sg.a.x) * sg.nx + (p.y - sg.a.y) * sg.ny) > 1.6) {
      const spot = doorSpot(plan, p.x, p.y, { poly, widthFt: d0.widthFt, max: 1.2 });
      if (spot) {
        const { x, y, wall, offsetFt, roomId, ...keep } = d0; void x; void y; void wall; void offsetFt; void roomId;
        n = { ...keep, ...spot };
      }
    }
    dr.next = n;
    svg.innerHTML = svgInner({ ...plan, doors: (plan.doors || []).map((x) => (x.id === n.id ? n : x)) });
  };
  // ---- Shape house: drag a corner or a wall; tap ⊕ = new corner, tap a corner = pick it
  const shapePreview = (dr) => {
    const draft = dr.draft || dr.pts0;
    let rooms = plan.rooms, pins = placed;
    if (fitRooms() && dr.draft) {
      const b0 = bboxOf(dr.pts0), b1 = bboxOf(draft);
      if (b0.x !== b1.x || b0.y !== b1.y || b0.w !== b1.w || b0.h !== b1.h) {
        const f = fitRoomsToShape(plan, data.devices, b0, b1);
        rooms = f.rooms;
        pins = placed.map((d) => (f.pins[d.id] ? { ...d, pos: f.pins[d.id] } : d));
      }
    }
    svg.innerHTML = svgInner({ ...plan, rooms, outlinePts: draft }, { pins });
    const ab = document.getElementById('plAbout');
    if (ab) { const b = bboxOf(cleanPts(draft)); ab.textContent = `about ${Math.round(b.w)} × ${Math.round(b.h)} ft`; }
  };
  const shapeDown = (e) => {
    const t = e.target;
    const c = t.closest('.sh-c'), ad = t.closest('.sh-add'), ed = t.closest('.sh-e');
    if (!c && !ad && !ed) return false;
    const pts0 = shapeOf(plan);
    if (planUI.corner >= 0 && !(c && Number(c.dataset.c) === planUI.corner)) { planUI.corner = -1; bar.hidden = true; }
    drag = { start: ptOf(e), sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, moved: false, id: e.pointerId, shape: c ? 'c' : ad ? 'add' : 'e', i: Number((c || ad || ed).dataset[c ? 'c' : ad ? 'add' : 'e']), pts0, draft: null };
    try { svg.setPointerCapture(e.pointerId); } catch { /* gone */ }
    e.preventDefault();
    return true;
  };
  const shapeMove = (dr, e) => {
    if (dr.shape === 'add') return;
    const p = ptOf(e);
    const dx = p.x - dr.start.x, dy = p.y - dr.start.y;
    const raw = dr.shape === 'c' ? moveCorner(dr.pts0, dr.i, dr.pts0[dr.i].x + dx, dr.pts0[dr.i].y + dy) : moveEdge(dr.pts0, dr.i, dx, dy).pts;
    // stays on the drawing (the margin around the house) and doesn't cross itself
    const inView = raw.every((q) => q.x >= -P + 0.5 && q.y >= -P + 0.5 && q.x <= plan.w + P - 0.5 && q.y <= plan.h + P - 0.5);
    if (!inView || !validShape(cleanPts(raw))) return;
    dr.draft = raw;
    shapePreview(dr);
  };
  const shapeEnd = async (dr) => {
    if (dr.moved && dr.draft) {
      planUI.corner = -1;
      return applyShape(dr.draft);
    }
    if (dr.moved) return rerender();
    if (dr.shape === 'add') {
      const next = addCorner(dr.pts0, dr.i);
      if (next === dr.pts0) return toast('That wall is too short for another corner');
      planUI.corner = dr.i + 1;
      await applyShape(next, { fit: false });
      return toast('Corner added. Drag it, or drag half the wall to make an L.');
    }
    if (dr.shape === 'c') { planUI.corner = planUI.corner === dr.i ? -1 : dr.i; return rerender(); }
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    if (m === 'shape') { if (drag && drag.timer) clearTimeout(drag.timer); drag = null; if (!shapeDown(e) && planUI.corner >= 0) { planUI.corner = -1; rerender(); } return; }
    const t = e.target;
    const pin = t.closest('.pin[data-o]');
    const h = t.closest('.pl-h');
    const start = ptOf(e);
    // No wall (Move rooms): a tap on a wall takes it out / picks a dashed section; the picked
    // section's round ends drag along the wall
    if (m === 'rooms' && !planUI.swap && (planUI.wallMode || planUI.ow)) {
      const g = planUI.ow && t.closest('.ow-grip');
      if (g || planUI.wallMode) {
        if (drag && drag.timer) clearTimeout(drag.timer);
        drag = { start, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, moved: false, id: e.pointerId, timer: 0, lifted: false, owEnd: g ? g.dataset.owend : '', wallTap: !g };
        if (g) { drag.o0 = (plan.openWalls || []).find((x) => x.id === planUI.ow); try { svg.setPointerCapture(e.pointerId); } catch { /* gone */ } e.preventDefault(); }
        return;
      }
    }
    // doors (Move rooms): + Door waits for a tap on a wall; a door drags along its wall
    if (m === 'rooms' && !planUI.swap) {
      const dh = !planUI.doorAdd && !h && t.closest('.dr-hit-g');
      if (planUI.doorAdd || dh) {
        if (drag && drag.timer) clearTimeout(drag.timer);
        drag = { start, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, moved: false, id: e.pointerId, timer: 0, lifted: false, doorAdd: !!planUI.doorAdd, door: dh ? dh.dataset.door : '' };
        if (dh) { drag.d0 = (plan.doors || []).find((x) => x.id === drag.door); try { svg.setPointerCapture(e.pointerId); } catch { /* gone */ } e.preventDefault(); }
        return;
      }
    }
    const under = roomUnder(start);
    if (drag && drag.timer) clearTimeout(drag.timer);
    drag = { start, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, moved: false, pin: m === 'view' && pin ? pin.dataset.o : '', h: m === 'rooms' && !planUI.swap && h ? h.dataset.h : '', room: under ? under.id : '', id: e.pointerId, timer: 0, lifted: false };
    const dr = drag;
    if (dr.pin) { svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (dr.h) { dr.room = planUI.sel; dr.r0 = plan.rooms.find((r) => r.id === planUI.sel); dr.lifted = true; svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (!dr.room || m === 'add' || planUI.swap) return;
    if (m === 'rooms' && dr.room === planUI.sel) { e.preventDefault(); return lift(dr, false); }
    dr.timer = setTimeout(() => lift(dr), m === 'rooms' ? ROOM_HOLD_EDIT : ROOM_HOLD_VIEW);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dr = drag;
    dr.cx = e.clientX; dr.cy = e.clientY;
    const far = Math.hypot(e.clientX - dr.sx, e.clientY - dr.sy);
    if (dr.timer) {
      // moved before the hold finished: that's a scroll, not a pick-up
      if (far > 9) { clearTimeout(dr.timer); dr.timer = 0; dr.scrolling = true; }
      return;
    }
    if (dr.scrolling) return;
    if (!dr.moved && far < 6) return;
    dr.moved = true;
    if (dr.shape) return shapeMove(dr, e);
    if (dr.wallTap) { dr.scrolling = true; return; }
    if (dr.owEnd) return owMove(dr, e);
    if (dr.doorAdd) { dr.scrolling = true; return; }
    if (dr.door) return doorMove(dr, e);
    const p = ptOf(e);
    if (dr.pin) {
      const at = snapPin(plan, p.x, p.y);
      dr.at = at;
      redraw({ pins: placed.map((d) => (d.id === dr.pin ? { ...d, pos: at } : d)) });
    } else if (dr.lifted) dragTo(dr);
  });
  const end = async (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const dr = drag;
    drag = null;
    if (dr.timer) clearTimeout(dr.timer);
    if (e && e.type === 'pointercancel') { if (dr.lifted || dr.pin || dr.shape || dr.door || dr.owEnd) rerender(); return; }
    if (dr.shape) return shapeEnd(dr);
    if (dr.owEnd) {
      if (dr.moved && dr.next) return changeOpen((plan.openWalls || []).map((x) => (x.id === dr.next.id ? dr.next : x)));
      return rerender();
    }
    if (dr.wallTap) {
      if (dr.scrolling || dr.moved) return;
      const max = Math.min(2, Math.max(0.6, 26 / planUI.z));
      const o = openAt(plan, dr.start.x, dr.start.y, { max });
      if (o) {
        // a dashed section: the first tap picks it, a second tap puts the wall back
        if (planUI.ow === o.id) { planUI.ow = ''; await changeOpen(closeWall(plan, o.id)); return toast('Wall put back · Undo is up top'); }
        planUI.ow = o.id;
        return rerender();
      }
      const res = openWallAt(plan, dr.start.x, dr.start.y, { max, id: 'ow' + uid().slice(0, 6) });
      if (!res) { if (planUI.ow) { planUI.ow = ''; return rerender(); } return toast('Tap right on a wall'); }
      planUI.ow = res.section.id;
      const n = await changeOpen(res.list, { quiet: true });
      return toast(`Wall taken out${n ? ` · ${n === 1 ? 'its door' : n + ' doors'} came off` : ''} · Undo is up top`);
    }
    if (dr.door) {
      if (dr.moved && dr.next && segOnOpen(doorSeg(dr.next, plan, doorPoly(plan)), planOpenSegs(plan))) { toast("No wall there, so no door. Put the wall back first."); return rerender(); }
      if (dr.moved && dr.next) { planUI.door = dr.door; planUI.sel = ''; await changeDoors((plan.doors || []).map((x) => (x.id === dr.door ? dr.next : x))); return keepDoorInView(); }
      if (dr.moved) return rerender();
      planUI.door = planUI.door === dr.door ? '' : dr.door; planUI.sel = ''; planUI.wOther = false;
      rerender();
      return keepDoorInView();
    }
    if (dr.doorAdd) {
      if (dr.scrolling || dr.moved) return;
      const poly = doorPoly(plan);
      const only = planUI.doorAdd !== '*' && plan.rooms.find((r) => r.id === planUI.doorAdd);
      let d = only ? placeDoor({ ...plan, rooms: [only] }, dr.start.x, dr.start.y, { id: 'dr' + uid().slice(0, 6) }) : null;
      if (!d) d = placeDoor(plan, dr.start.x, dr.start.y, { poly, id: 'dr' + uid().slice(0, 6) });
      if (!d) return toast('Tap right on a wall');
      if (segOnOpen(doorSeg(d, plan, poly), planOpenSegs(plan))) return toast("There's no wall there. Put the wall back first (No wall, tap the dashed line).");
      Object.assign(planUI, { doorAdd: '', door: d.id, sel: '', wOther: false });
      await changeDoors([...(plan.doors || []), d]);
      keepDoorInView();
      return toast('Door added. Drag it to slide it.');
    }
    if (dr.scrolling) return;
    if (dr.lifted) {
      const r1 = dr.room1, r0 = dr.r0;
      if (!r0 || !r1) return rerender();
      if (r1.x === r0.x && r1.y === r0.y && r1.w === r0.w && r1.h === r0.h) {
        // picked up and put back: in Move rooms that's a tap that picks the room
        if (m === 'rooms') planUI.sel = r0.id;
        return rerender();
      }
      await changeRooms([{ from: r0, to: r1 }]);
      if (m === 'view') toast(`Moved ${r0.name || 'room'} · Undo is up top`);
      return;
    }
    if (dr.moved) {
      if (dr.pin && dr.at) { const d = byId('devices', dr.pin); if (d) await placeAt(d, dr.at); return; }
      return;
    }
    // a tap
    if (m === 'view') {
      if (dr.pin) { const d = byId('devices', dr.pin); return planUI.oid === dr.pin ? select('') : select(d.breakerId || '', dr.pin); }
      if (planUI.bid || planUI.oid) return select('');
      return;
    }
    if (m === 'rooms') {
      if (dr.h) return;
      if (planUI.swap) {
        const a0 = plan.rooms.find((r) => r.id === planUI.swap), b0 = dr.room && plan.rooms.find((r) => r.id === dr.room);
        if (!b0 || !a0 || b0.id === a0.id) { if (!b0) { planUI.swap = ''; rerender(); } return; }
        const { a: a1, b: b1 } = swapRooms(a0, b0, plan);
        planUI.swap = ''; planUI.sel = a0.id;
        await changeRooms([{ from: a0, to: a1 }, { from: b0, to: b1 }]);
        return toast(`Swapped ${a0.name || 'room'} and ${b0.name || 'room'}`);
      }
      planUI.sel = dr.room || '';
      planUI.door = ''; planUI.wOther = false; planUI.ow = '';
      rerender();
      // keep the picked room (and its handles) above the bottom sheet
      const el = planUI.sel && document.querySelector(`.pl-room[data-r="${CSS.escape(planUI.sel)}"] rect`);
      if (el) { const b = el.getBoundingClientRect(); const room = window.innerHeight - 330; if (b.bottom + 30 > room && b.top > 120) window.scrollBy(0, Math.min(b.top - 120, b.bottom + 40 - room)); }
      return;
    }
    if (m === 'add') {
      const at = snapPin(plan, dr.start.x, dr.start.y);
      if (!inBounds(at, plan)) return;
      if (placingDev) {
        Object.assign(planUI, { mode: 'view', placing: '', drop: null, oid: placingDev.id, bid: placingDev.breakerId || '' });
        await placeAt(placingDev, at);
        return toast(`${devName(placingDev)} placed`);
      }
      planUI.drop = at;
      redraw({ ghost: at });
      showBar();
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  if (planUI.drop && m === 'add') redraw({ ghost: planUI.drop });
  showBar();
  if (q.get('o') || q.get('b')) setTimeout(() => { const el = svg.querySelector('.pin.sel') || svg.querySelector('.pin.hit'); if (el) el.scrollIntoView({ block: 'center' }); }, 60);
}

// ---------------------------------------------------------------- bulk add
// Several breakers in one screen: one row each (slot, type, amps, label, rooms), one Save.
// Same slot math / overlap rules as the one-breaker form, checked per row (lib/bulk.js).
const BULK_AMPS = ['15', '20', '25', '30', '40', '50', '60', '70', '80', '100'];
function bulkRowHtml(i) {
  return `<div class="card bulk-row" data-i="${i}">
    <div class="bulk-top"><b class="bulk-n">Row ${i + 1}</b><span class="bulk-covers tiny muted"></span><button type="button" class="icon-btn small bulk-rm" aria-label="Remove this row">✕</button></div>
    <div class="bulk-grid">
      <label>Slot #<input name="slot" type="number" inputmode="numeric" min="1" max="84" placeholder="e.g. 26"></label>
      <label>Type<select name="btype">${BULK_TYPES.map((t) => `<option value="${t.v}">${esc(t.t)}</option>`).join('')}</select></label>
      <label>Amps<select name="amps">${opt(BULK_AMPS, '15')}</select></label>
    </div>
    <label class="bulk-l1"><span class="bulk-l1-t">Label</span><input name="label" placeholder="e.g. Master bedroom + bath"></label>
    <div class="bulk-mates" hidden>${[1, 2].map((k) => `<div class="bulk-mate" data-k="${k}"><label><span class="bm-t"></span><input name="m${k}label" placeholder="Label"></label><label>Amps<select name="m${k}amps">${opt(BULK_AMPS, k === 1 ? '20' : '15')}</select></label></div>`).join('')}</div>
    <label>Room(s)<input name="rooms" list="roomList" placeholder="Separate with commas"></label>
    <p class="bulk-err" role="alert"></p>
  </div>`;
}

function renderBulk(homeId, q) {
  const panels = inHome('panels', homeId).filter((p) => p.type !== 'rv');
  if (!panels.length) return go(`#/h/${homeId}/panel`);
  const panel = panels.find((p) => p.id === q.get('panel')) || panels[0];
  const rooms = [...new Set([...inHome('devices', homeId).map((d) => d.room), ...inHome('breakers', homeId).flatMap((b) => b.rooms || []), ...HOME_ROOMS].filter(Boolean))].sort();
  const half = numberingOf(panel) === 'half';
  const body = `
  <form id="bulkForm" class="form bulk-form" novalidate>
    ${panels.length > 1 ? `<label>Panel<select name="panelId">${opt(panels.map((p) => ({ value: p.id, label: p.name })), panel.id)}</select></label>` : `<p class="muted"><b>${esc(panel.name)}</b></p>`}
    <p class="tiny muted">${half ? 'Numbered 2 per row, like your sticker (1/3, 5/7…). ' : ''}One row per breaker. Type the number from the panel sticker; tandems and quads fill in their other switches.</p>
    <div id="bulkRows">${[0, 1, 2].map(bulkRowHtml).join('')}</div>
    <button type="button" class="btn full-w" id="bulkAdd">+ Add another row</button>
    <datalist id="roomList">${rooms.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
    <div class="bulk-save"><span id="bulkCount" class="muted">Nothing to save yet</span><button type="submit" class="btn primary">Save all</button></div>
  </form>`;
  app.innerHTML = shell(homeId, 'panel', body, { title: 'Add several breakers', back: `#/h/${homeId}/panel/${panel.id}` });
  const f = document.getElementById('bulkForm');
  const box = document.getElementById('bulkRows');
  let tried = false;
  const curPanel = () => byId('panels', f.elements.panelId ? f.elements.panelId.value : panel.id) || panel;
  const rowEls = () => [...box.querySelectorAll('.bulk-row')];
  const readRow = (el) => {
    const v = (n) => (el.querySelector(`[name="${n}"]`) || {}).value || '';
    return { slot: v('slot'), btype: v('btype'), amps: v('amps'), label: v('label'), rooms: v('rooms'), labels: [v('m1label'), v('m2label')], ampsList: [v('m1amps'), v('m2amps')] };
  };
  const check = () => {
    const P = curPanel();
    const els = rowEls();
    const rows = els.map(readRow);
    const res = planBulk(rows, P, inHome('breakers', homeId), { homeId, makeId: () => 'b_' + uid() });
    els.forEach((el, i) => {
      const r = res.rows[i];
      const row = rows[i];
      el.querySelector('.bulk-n').textContent = `Row ${i + 1}`;
      const n = partsOf(row.btype);
      const mates = el.querySelector('.bulk-mates');
      mates.hidden = n < 2;
      const plan = planFor(row.btype, row.slot, P);
      const names = row.btype === 'tandem' ? ['Top switch', 'Bottom switch'] : row.btype === 'quad' ? ['Top single', 'Middle 240V', 'Bottom single'] : ['Label'];
      const at = (k) => (plan[k] ? ` (${slotLabel(plan[k], P)})` : '');
      el.querySelector('.bulk-l1-t').textContent = n > 1 ? `${names[0]}${at(0)} label` : 'Label';
      el.querySelectorAll('.bulk-mate').forEach((m) => {
        const k = Number(m.dataset.k);
        m.hidden = k >= n;
        m.querySelector('.bm-t').textContent = `${names[k] || ''}${at(k)} label`;
      });
      el.querySelector('.bulk-covers').textContent = r.blank ? '' : r.covers;
      const show = r.error && (tried || String(row.slot).trim() !== '');
      el.querySelector('.bulk-err').textContent = show ? `⚠️ ${r.error}` : '';
      el.classList.toggle('bad', !!show);
    });
    const live = res.rows.filter((r) => !r.blank);
    const bad = live.filter((r) => r.error).length;
    document.getElementById('bulkCount').textContent = !live.length ? 'Nothing to save yet' : bad ? `${bad} row${bad > 1 ? 's' : ''} to fix` : `${res.count} breaker${res.count === 1 ? '' : 's'} ready`;
    return res;
  };
  box.addEventListener('input', check);
  box.addEventListener('change', (e) => {
    const el = e.target.closest('.bulk-row');
    if (e.target.name === 'amps') e.target.dataset.touched = '1';
    if (e.target.name === 'btype' && el) {
      const a = el.querySelector('[name="amps"]');
      if (!a.dataset.touched) a.value = e.target.value === 'double' ? '30' : e.target.value === 'tandem' || e.target.value === 'quad' ? '20' : '15';
      if (e.target.value === 'quad') el.querySelector('[name="m1amps"]').value = '30';
      else el.querySelector('[name="m1amps"]').value = '20';
    }
    check();
  });
  box.addEventListener('click', (e) => {
    const rm = e.target.closest('.bulk-rm');
    if (!rm) return;
    if (rowEls().length === 1) { rm.closest('.bulk-row').querySelectorAll('input').forEach((x) => (x.value = '')); return check(); }
    rm.closest('.bulk-row').remove();
    check();
  });
  document.getElementById('bulkAdd').onclick = () => {
    box.insertAdjacentHTML('beforeend', bulkRowHtml(rowEls().length));
    check();
    const last = rowEls().at(-1);
    last.querySelector('[name="slot"]').focus();
  };
  if (f.elements.panelId) f.elements.panelId.addEventListener('change', check);
  f.onsubmit = async (e) => {
    e.preventDefault();
    tried = true;
    const res = check();
    if (!res.ok) {
      const first = box.querySelector('.bulk-row.bad');
      if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return toast(res.rows.every((r) => r.blank) ? 'Fill in at least one row' : 'Fix the rows marked ⚠️');
    }
    const all = res.rows.flatMap((r) => r.breakers);
    for (const b of all) await store.put('breakers', b);
    toast(`Saved ${all.length} breaker${all.length === 1 ? '' : 's'}`);
    go(`#/h/${homeId}/panel/${curPanel().id}`);
  };
  check();
}

// ---------------------------------------------------------------- quick panel
// Map a panel fast, no rooms needed: one card for the next breaker (space #, single or
// 2-pole, amps, what it feeds, optional wire) -> "Save & next" -> it jumps to the next
// open space. The schedule fills in below. Rooms and the floor plan stay optional.
const quickUI = {
  panel: '', btype: 'single', amps: '20', ampsOther: '', wtag: '', wtype: '', slot: '', last: '',
  typing() { const f = document.getElementById('quickForm'); return !!(f && f.elements.label && (f.elements.label.value.trim() || document.activeElement === f.elements.label)); },
};
function quickRowHtml(homeId, b, panel) {
  const w = cleanWire(b.wire);
  const chk = w ? wireChecks(w, breakerAmps(b)) : [];
  const sub = [ampsText(b), isTwoPole(b) ? '240V' : '', w ? wireText(w, { short: true }) : ''].filter(Boolean).join(' · ');
  return `<li class="qk-row ${quickUI.last === b.id ? 'just' : ''}"><a class="row" href="#/h/${homeId}/breaker/${b.id}">
    <span class="qk-n ${isTwoPole(b) ? 'dbl' : ''}">${esc(slotLabel(b, panel))}</span>
    <span class="row-main"><b>${esc(b.label || 'Unlabeled')}</b><span class="muted">${esc(sub)}</span>${chk.length ? `<span class="qk-warn">⚠️ ${esc(chk[0].text.replace(/^Check: /, ''))}</span>` : ''}</span>
    <span class="chev" aria-hidden="true">›</span></a></li>`;
}
function renderQuick(homeId, q) {
  const panels = inHome('panels', homeId);
  if (!panels.length) return go(`#/edit/panels/new?home=${homeId}&quick=1`);
  const panel = panels.find((p) => p.id === (q.get('panel') || quickUI.panel)) || panels.find((p) => p.type === 'main') || panels[0];
  if (quickUI.panel !== panel.id) Object.assign(quickUI, { panel: panel.id, slot: '', last: '' });
  const breakers = inHome('breakers', homeId).filter((b) => b.panelId === panel.id);
  const sp = spacesUsed(panel, breakers);
  const slot = nextFreeSlot(panel, breakers, quickUI.btype, Number(quickUI.slot) || 1) || '';
  const ampsList = [...QUICK_AMPS, 'other'];
  const pill = (name, value, label, on) => `<label class="chip-opt"><input type="radio" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
  const body = `
  <section class="qk-head">
    <div>
      ${panels.length > 1 ? `<select id="qkPanel" class="panel-pick" aria-label="Panel">${panels.map((p) => `<option value="${p.id}" ${p.id === panel.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : `<h2>${esc(panel.name)}</h2>`}
      <p class="muted">${panel.mainAmps ? `${esc(mainAmpsText(panel))}A main · ` : ''}${sp.used} of ${sp.max} spaces mapped</p>
    </div>
    <div class="qk-meter" aria-hidden="true"><span style="width:${sp.max ? Math.min(100, Math.round((sp.used / sp.max) * 100)) : 0}%"></span></div>
  </section>
  <form id="quickForm" class="card form qk-card" novalidate autocomplete="off">
    <div class="qk-top">
      <h3>${slot ? 'Next breaker' : 'Panel is full'}</h3>
      <label class="qk-slot">Space<input name="slot" type="number" inputmode="numeric" min="1" max="84" value="${esc(String(slot))}" aria-label="Space number from the panel sticker"></label>
    </div>
    <div class="seg-pick" role="radiogroup" aria-label="Breaker type">
      <label class="seg-opt"><input type="radio" name="btype" value="single" ${quickUI.btype !== 'double' ? 'checked' : ''}><span>Single · 120V</span></label>
      <label class="seg-opt"><input type="radio" name="btype" value="double" ${quickUI.btype === 'double' ? 'checked' : ''}><span>2-pole · 240V</span></label>
    </div>
    <p class="tiny muted qk-covers" id="qkCovers"></p>
    <div class="qk-group"><span class="qk-cap">Amps</span>
      <div class="chip-pick" role="radiogroup" aria-label="Amps">${ampsList.map((a) => pill('amps', a, a === 'other' ? 'Other' : a + 'A', quickUI.amps === a)).join('')}</div>
      <label class="other-field" ${quickUI.amps === 'other' ? '' : 'hidden'}>Amps (type it)<input name="ampsOther" type="number" inputmode="numeric" value="${esc(quickUI.ampsOther)}"></label>
    </div>
    <label>What it feeds<input name="label" list="feedsList" placeholder="e.g. Kitchen counters / dishwasher" enterkeyhint="next" autocapitalize="sentences"></label>
    <datalist id="feedsList">${FEEDS_SUGGESTIONS.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="qk-group"><span class="qk-cap">Wire <span class="opt-tag">optional</span></span>
      <div class="chip-pick" role="radiogroup" aria-label="Wire">${pill('wtag', '', 'Skip', !quickUI.wtag)}${QUICK_WIRES.map((w) => pill('wtag', w.tag, w.tag, quickUI.wtag === w.tag)).join('')}</div>
      <label class="qk-wtype">Wire type<select name="wtype">${opt(WIRE_TYPES, quickUI.wtype)}</select></label>
    </div>
    <div id="qkCheck"></div>
    <p class="bulk-err" id="qkErr" role="alert"></p>
    <button class="btn primary qk-save" type="submit" ${slot ? '' : 'disabled'}>Save &amp; next breaker</button>
    <p class="tiny muted qk-more">Tandem, quad, rooms or notes? <a href="#/edit/breakers/new?home=${homeId}&panel=${panel.id}">Full form</a> · <a href="#/h/${homeId}/bulk?panel=${panel.id}">Several at once</a></p>
  </form>
  <div class="card qk-sched">
    <div class="card-head"><h3>Panel schedule <span class="count">${breakers.length}</span></h3>${breakers.length ? `<a class="btn small" href="#/h/${homeId}/print/directory/${panel.id}">🖨 Print</a>` : ''}</div>
    ${breakers.length ? `<ul class="list qk-list">${sortBreakers(breakers).map((b) => quickRowHtml(homeId, b, panel)).join('')}</ul>` : '<p class="muted">Nothing yet. Start at the top of the panel: type what the first breaker feeds and tap Save &amp; next.</p>'}
  </div>
  <div class="row-actions"><a class="btn" href="#/h/${homeId}/panel/${panel.id}">See the panel</a>${breakers.length ? `<a class="btn primary" href="#/h/${homeId}/print/directory/${panel.id}">Print panel schedule</a>` : ''}</div>`;
  app.innerHTML = shell(homeId, 'panel', body, { title: 'Quick panel', back: `#/h/${homeId}/panel/${panel.id}` });
  bindShell();
  const f = document.getElementById('quickForm');
  const pp = document.getElementById('qkPanel');
  if (pp) pp.onchange = () => go(`#/h/${homeId}/quick?panel=${pp.value}`);
  const read = () => {
    const v = Object.fromEntries(new FormData(f).entries());
    const amps = v.amps === 'other' ? v.ampsOther : v.amps;
    const wire = v.wtag ? quickWire(v.wtag, v.wtype) : cleanWire({ type: v.wtype });
    return { v, amps, wire };
  };
  const upd = () => {
    const { v, amps, wire } = read();
    Object.assign(quickUI, { btype: v.btype, amps: v.amps, ampsOther: v.ampsOther || '', wtag: v.wtag || '', wtype: v.wtype || '' });
    f.elements.ampsOther.closest('label').hidden = v.amps !== 'other';
    const n = parseInt(v.slot, 10);
    const res = Number.isFinite(n) ? quickBreaker({ slot: n, btype: v.btype, amps: amps || '20', label: 'x' }, panel, breakers, { homeId }) : null;
    document.getElementById('qkCovers').textContent = res && !res.error ? res.covers : '';
    document.getElementById('qkCheck').innerHTML = wireChecksHtml(wire, Number(amps) || 0, 'small');
    document.getElementById('qkErr').textContent = res && res.error && String(v.slot).trim() ? `⚠️ ${res.error}` : '';
  };
  f.addEventListener('input', upd);
  f.addEventListener('change', (e) => {
    // switching to 2-pole: suggest 30A and move to a space that fits
    if (e.target.name === 'btype') {
      if (e.target.value === 'double' && ['15', '20'].includes(f.querySelector('[name=amps]:checked')?.value)) f.querySelector('[name=amps][value="30"]').checked = true;
      if (e.target.value === 'single' && f.querySelector('[name=amps]:checked')?.value === '30') f.querySelector('[name=amps][value="20"]').checked = true;
      const n = parseInt(f.elements.slot.value, 10) || 1;
      const fit = nextFreeSlot(panel, breakers, e.target.value, n);
      if (fit) f.elements.slot.value = fit;
    }
    upd();
  });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const { v, amps, wire } = read();
    const res = quickBreaker({ slot: v.slot, btype: v.btype, amps, label: v.label, wire }, panel, inHome('breakers', homeId), { homeId, makeId: () => 'b_' + uid() });
    if (res.error) { document.getElementById('qkErr').textContent = `⚠️ ${res.error}`; return; }
    for (const b of res.breakers) await store.put('breakers', b);
    const b0 = res.breakers[0];
    const after = inHome('breakers', homeId).filter((b) => b.panelId === panel.id);
    Object.assign(quickUI, { last: b0.id, btype: 'single', slot: nextFreeSlot(panel, after, 'single', parseInt(b0.slot, 10) + 1) || '' });
    if (quickUI.amps === '30' && b0.poles === '2') quickUI.amps = '20';
    toast(`Saved ${slotLabel(b0, panel)} · ${b0.label || 'Unlabeled'}`);
    renderQuick(homeId, q);
    const lf = document.getElementById('quickForm');
    if (lf && quickUI.slot) lf.elements.label.focus({ preventScroll: true });
  };
  upd();
}

// ---------------------------------------------------------------- search
// One search for everything: what the user has mapped (loads they listed, outlets, breakers,
// rooms) comes first, then the built-in catalog of household devices with typical watts/amps.
const homeData = (homeId) => ({ breakers: inHome('breakers', homeId), devices: inHome('devices', homeId), panels: inHome('panels', homeId), fuses: true });
const qs = (query) => (query ? '?q=' + encodeURIComponent(query) : '');
const devName = (d) => d.name || labelOf(DEVICE_TYPES, d.type);

function homeRowHtml(homeId, r) {
  if (r.kind === 'load') {
    const l = r.load;
    const w = (Number(l.watts) || 0) * (Number(l.qty) || 1);
    const where = r.device ? [r.device.room, devName(r.device)].filter(Boolean).join(' · ') : 'Listed on the breaker';
    const brk = r.breaker ? `Breaker ${slotText(r.breaker)}${r.breaker.label ? ` (${r.breaker.label})` : ''}` : 'No breaker picked yet';
    const href = r.device ? `#/h/${homeId}/device/${r.device.id}#plugged` : `#/h/${homeId}/breaker/${r.breaker.id}#loads`;
    return `<li><a class="row" href="${href}"><span class="row-icon" aria-hidden="true">🔌</span><span class="row-main"><b>${esc(l.name)}${Number(l.qty) > 1 ? ` <span class="muted">×${esc(l.qty)}</span>` : ''}</b><span class="muted wrap">${esc(where)} · ${esc(brk)}</span></span><span class="row-side">${w ? `<span class="pill amber" title="Typical · runs ${wattsText(w)}">~${wNum(loadReading(l, 'main'))}W</span>` : ''}${r.breaker ? `<span class="pill">#${esc(slotText(r.breaker))}</span>` : '<span class="pill gray">?</span>'}</span><span class="chev" aria-hidden="true">›</span></a></li>`;
  }
  if (r.kind === 'fuse')
    return `<li><a class="row" href="#/h/${homeId}/panel/${r.panel.id}#fuses"><span class="fuse-num">${esc(r.item.num)}</span><span class="row-main"><b>${esc(r.item.powers || 'Fuse')}</b><span class="muted">12V fuse · ${esc(r.item.amps === 'other' ? r.item.ampsOther : r.item.amps)}A · ${esc(r.panel.name)}</span></span></a></li>`;
  if (r.kind === 'breaker')
    return `<li><a class="row" href="#/h/${homeId}/breaker/${r.item.id}"><span class="big-slot sm">${esc(slotText(r.item))}</span><span class="row-main"><b>${esc(r.item.label || 'Breaker')}</b><span class="muted">Breaker · ${esc(ampsText(r.item))}${(r.item.rooms || []).length ? ' · ' + esc(r.item.rooms.join(', ')) : ''}</span></span><span class="chev" aria-hidden="true">›</span></a></li>`;
  return deviceRow(homeId, r.item, true);
}

function catalogRowHtml(homeId, c, query) {
  const tag = circuitTag(c);
  const cls = tag === '240V' ? 'blue' : tag === 'Own circuit' || tag === 'Big draw' ? 'amber' : 'gray';
  return `<li><a class="row" href="#/h/${homeId}/search/dev/${c.id}${qs(query)}"><span class="row-icon" aria-hidden="true">${categoryOf(c.cat).icon}</span><span class="row-main"><b>${esc(c.name)}</b><span class="muted wrap">${esc(wattsRange(c))} · ${esc(ampsRange(c))}</span></span><span class="row-side">${tag ? `<span class="pill ${cls}">${esc(tag)}</span>` : ''}</span><span class="chev" aria-hidden="true">›</span></a></li>`;
}

function notFoundHtml(homeId, query, partial = false) {
  return `<div class="card not-found">
    <h3>${partial ? 'No exact match for that model' : "Not in AmpMap's list yet"}</h3>
    <p class="muted">Easiest: check the sticker or nameplate on the back or bottom. It lists watts, or amps (watts = amps × 120).</p>
    <div class="row-actions">
      <a class="btn" href="${esc(lookupUrl(query))}" target="_blank" rel="noopener">🔎 Look it up online</a>
      <a class="btn primary" href="#/h/${homeId}/search/add?name=${encodeURIComponent(query.trim())}">+ Add it with its watts</a>
    </div>
  </div>`;
}

function searchResultsHtml(homeId, query, { compact = false, cat = '' } = {}) {
  const has = query.trim().length > 0;
  if (!has && !cat) return '';
  const home = has ? searchHome(query, homeData(homeId)) : [];
  const cats = searchCatalog(query, { limit: compact ? 5 : 80, cat });
  const homeShown = compact ? home.slice(0, 4) : home;
  let html = '';
  if (homeShown.length)
    html += `<h3 class="sr-head">In your home <span class="muted">${home.length}</span></h3><ul class="list card sr-list">${homeShown.map((r) => homeRowHtml(homeId, r)).join('')}</ul>`;
  const partial = cats.length && cats[0].partial;
  if (partial && !compact) html += notFoundHtml(homeId, query, true);
  if (cats.length)
    html += `<h3 class="sr-head">${partial ? 'Closest matches' : cat && !has ? esc(categoryOf(cat).label) : 'Typical power use'} <span class="muted">estimates</span></h3><ul class="list card sr-list">${cats.map((h) => catalogRowHtml(homeId, h.entry, query)).join('')}</ul>`;
  if (has && !cats.length && parseBreakerQuery(query) == null) html += notFoundHtml(homeId, query);
  else if (has && !homeShown.length && !cats.length) html += `<p class="muted center">Nothing matches "${esc(query)}".</p>`;
  if (has && cats.length && !compact) html += `<p class="tiny muted sr-foot">Values are typical estimates. Check the nameplate. <a href="${esc(lookupUrl(query))}" target="_blank" rel="noopener">🔎 Look up "${esc(query.trim())}" online</a></p>`;
  if (compact && (home.length > homeShown.length || cats.length >= 5 || has))
    html += `<a class="btn full sr-all" href="#/h/${homeId}/search${qs(query)}">See all results ›</a>`;
  return html;
}

// Search bar at the top of the Panel and Rooms screens. Results show right under it as you type.
function searchBarHtml(homeId) {
  return `<form class="search-box sbar" role="search" data-sbar>
    <label class="sr-only" for="sbarIn">Search devices, outlets and breakers</label>
    <span class="sb-icon" aria-hidden="true">⌕</span>
    <input id="sbarIn" type="search" placeholder="Search anything plugged in, or a breaker" autocomplete="off" autocorrect="off" enterkeyhint="search">
  </form>
  <div id="sbarResults" class="sbar-results" aria-live="polite"></div>`;
}
function bindSearchBar(homeId) {
  const f = app.querySelector('[data-sbar]');
  const input = document.getElementById('sbarIn');
  const out = document.getElementById('sbarResults');
  if (!f || !input || !out) return;
  input.oninput = () => (out.innerHTML = searchResultsHtml(homeId, input.value, { compact: true }));
  f.onsubmit = (e) => {
    e.preventDefault();
    if (input.value.trim()) go(`#/h/${homeId}/search${qs(input.value.trim())}`);
  };
}

function renderSearch(homeId, query, cat = '') {
  const rv = inHome('panels', homeId).some((p) => p.type === 'rv');
  const tries = rv ? ['breaker 2', 'water pump', 'fuse 3', 'microwave', 'air fryer', 'space heater'] : ["where's the fridge", 'breaker 11', 'gfci', 'air fryer', 'space heater', 'PS5', 'well pump', 'stock tank heater'];
  const body = `
  <form id="searchForm" class="search-box sbar" role="search">
    <label class="sr-only" for="sq">Search</label>
    <span class="sb-icon" aria-hidden="true">⌕</span>
    <input id="sq" type="search" value="${esc(query)}" placeholder="Fridge, air fryer, breaker 7, well pump..." autocomplete="off" autocorrect="off" enterkeyhint="search">
  </form>
  <div id="results"></div>
  <div id="searchHome" ${query || cat ? 'hidden' : ''}>
    <p class="muted search-lead">Type anything that plugs in (or is wired in) to see its typical watts and amps, whether it needs its own circuit, and where it is in your home.</p>
    <div class="chips examples">${tries.map((x) => `<button type="button" class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <h3 class="sr-head">Browse by type <span class="muted">${CATALOG.length} devices</span></h3>
    <div class="cat-grid">${CATEGORIES.map((c) => `<a class="cat-tile" href="#/h/${homeId}/search?cat=${c.id}"><span aria-hidden="true">${c.icon}</span>${esc(c.label)}</a>`).join('')}</div>
    <p class="tiny muted">${esc(CATALOG_NOTE)}</p>
  </div>`;
  const title = cat && !query ? categoryOf(cat).label : '';
  app.innerHTML = shell(homeId, 'search', body, title ? { title, back: `#/h/${homeId}/search` } : {});
  bindShell();
  const input = document.getElementById('sq');
  let curCat = cat;
  const run = () => {
    const qv = input.value;
    if (qv.trim()) curCat = '';
    const url = `#/h/${homeId}/search${qv ? '?q=' + encodeURIComponent(qv) : curCat ? '?cat=' + curCat : ''}`;
    history.replaceState(null, '', url);
    lastHash = location.hash;
    document.getElementById('searchHome').hidden = !!(qv.trim() || curCat);
    document.getElementById('results').innerHTML = searchResultsHtml(homeId, qv, { cat: curCat });
  };
  input.oninput = run;
  document.getElementById('searchForm').onsubmit = (e) => { e.preventDefault(); input.blur(); };
  app.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => { input.value = b.dataset.ex; run(); }));
  run();
  if (!query && !cat) setTimeout(() => input.focus(), 50);
}

// Where a catalog device already shows up in this home (loads, outlets, breakers).
function homeMatchesFor(homeId, c) {
  const res = searchHome(c.aka[0] && c.name.length > 18 ? c.aka[0] : c.name, homeData(homeId));
  return res.filter((r) => r.kind === 'load' || r.score >= 200);
}

function renderCatalogItem(homeId, id, q) {
  const c = catById(id);
  if (!c) return renderNotFound();
  const cat = categoryOf(c.cat);
  const query = q.get('q') || '';
  const back = query ? `#/h/${homeId}/search${qs(query)}` : `#/h/${homeId}/search?cat=${c.cat}`;
  const mine = homeMatchesFor(homeId, c).slice(0, 6);
  const f = (n) => Number(n).toLocaleString('en-US');
  const body = `
  <section class="detail-head">
    <div class="big-icon" aria-hidden="true">${cat.icon}</div>
    <div><h2>${esc(c.name)}</h2><p class="muted">${esc(cat.label)}${c.hardwired ? ' · usually hardwired' : ''}</p></div>
  </section>
  <div class="card dev-stats">
    <div class="stat"><span>Running watts</span><b>${esc(wattsRange(c))}</b></div>
    <div class="stat"><span>Amps</span><b>${esc(ampsRange(c))}</b></div>
    <div class="stat"><span>Startup surge</span><b>${c.surge ? `~${f(c.surge[0])}-${f(c.surge[1])}W` : 'Little or none'}</b></div>
    <div class="stat"><span>Voltage</span><b>${c.volts === 240 ? '240V (2-pole breaker)' : '120V outlet'}</b></div>
    <p class="tiny muted stat-foot">Load check uses about ${f(c.typical)}W (${fmtAmps(c.typical / c.volts)}A) unless you change it.</p>
  </div>
  <div class="card circuit-note">
    <h3>⚡ What circuit it needs</h3>
    <p>${esc(c.note)}</p>
    ${c.cont ? '<p class="muted">It runs for hours at a time, so keep the whole circuit under 80% (12A on a 15A breaker, 16A on a 20A).</p>' : ''}
    ${c.surge ? `<p class="muted">The startup surge (${esc(surgeText(c))}) is why a motor can trip a breaker that's already loaded up.</p>` : ''}
  </div>
  <p class="estimate-note">ⓘ ${esc(CATALOG_NOTE)} <a href="${esc(lookupUrl(c.name))}" target="_blank" rel="noopener">🔎 Look up exact specs online</a></p>
  <a class="btn primary full add-cta" href="#/h/${homeId}/search/add/${c.id}">+ Add to an outlet or breaker</a>
  ${mine.length ? `<h3 class="sr-head">Already in your home</h3><ul class="list card sr-list">${mine.map((r) => homeRowHtml(homeId, r)).join('')}</ul>` : ''}
  ${c.aka.length ? `<p class="tiny muted">Also found by: ${esc(c.aka.slice(0, 8).join(', '))}</p>` : ''}`;
  app.innerHTML = shell(homeId, 'search', body, { title: 'Device', back });
  bindShell();
}

// "Add to an outlet or breaker": pick where it plugs in, then the normal add form opens pre-filled.
function renderAddPicker(homeId, id, q) {
  const c = id ? catById(id) : null;
  const name = c ? c.name : (q.get('name') || '').trim();
  if (!name) return renderNotFound();
  const watts = c ? c.typical : 0;
  const addQ = c ? `add=${c.id}` : `addname=${encodeURIComponent(name)}`;
  const breakers = sortBreakers(inHome('breakers', homeId).filter((b) => b.kind !== 'spare'));
  const devices = inHome('devices', homeId);
  const is240 = c && c.volts === 240;
  const proj = (b) => {
    if (!b) return '';
    const s = sumOf(b);
    if (!s.rating) return '';
    if (!watts) return `<span class="pill gray">${s.level === 'none' ? '0' : Math.round(s.pct)}% typical</span>`;
    // Typical now -> after (the new item at its typical use); ⚠️ if Peak would go over 100%.
    const p = projectLoad(s, { name, watts, qty: 1 });
    const lvl = p.pct > 100 ? 'red' : p.pct >= 80 ? 'amber' : 'green';
    return `<span class="pill ${lvl}" title="Typical load now and after adding it. Peak if all running: ${Math.round(p.peakPct)}%">${Math.round(s.pct)}% → ${Math.round(p.pct)}%${p.peakPct > 100 ? ' ⚠️' : ''}</span>`;
  };
  const rooms = new Map();
  for (const d of devices) {
    const r = d.room || 'No room set';
    if (!rooms.has(r)) rooms.set(r, []);
    rooms.get(r).push(d);
  }
  const roomNames = [...rooms.keys()].sort((a, b) => a.localeCompare(b));
  // 240V items: 2-pole breakers first. 120V items never go on a 2-pole (240V) breaker.
  const bList = is240 ? [...breakers.filter((b) => String(b.poles) === '2'), ...breakers.filter((b) => String(b.poles) !== '2')] : breakers.filter((b) => String(b.poles) !== '2');
  const body = `
  <section class="detail-head">
    <div class="big-icon" aria-hidden="true">${c ? categoryOf(c.cat).icon : '🔌'}</div>
    <div><h2>Add ${esc(name)}</h2><p class="muted">${c ? `Typical ~${Number(watts).toLocaleString('en-US')}W · you can change it next` : 'You will type the watts (or amps) next'}</p></div>
  </section>
  ${watts ? `<p class="tiny muted">% = breaker's Typical now → with it. ⚠️ = could trip if everything runs at once.</p>` : ''}
  ${breakers.length + devices.length > 8 ? `<form class="search-box sbar pick-filter" onsubmit="return false"><label class="sr-only" for="pickFilter">Filter outlets and breakers</label><span class="sb-icon" aria-hidden="true">⌕</span><input id="pickFilter" type="search" placeholder="Filter: room, outlet or breaker #" autocomplete="off" enterkeyhint="done"></form>` : ''}
  ${is240 ? '<div class="alert warn">This is a 240V item, so it goes on a 2-pole (240V) breaker. Those are listed first.</div>' : ''}
  ${!breakers.length && !devices.length ? `<div class="card empty"><p>Map a breaker first, then you can add what's plugged into it.</p><a class="btn primary" href="#/edit/breakers/new?home=${homeId}">+ Add a breaker</a></div>` : ''}
  ${devices.length && !is240 ? `<h3 class="sr-head">Pick the outlet it's plugged into</h3>
  ${roomNames.map((r) => `<div class="card room-card pick-card"><div class="room-head"><h3>${esc(r)}</h3></div><ul class="list">${rooms.get(r).map((d) => {
    const b = byId('breakers', d.breakerId);
    return `<li><a class="row" href="#/h/${homeId}/device/${d.id}?${addQ}#plugged"><span class="row-icon" aria-hidden="true">${deviceIcon(d.type)}</span><span class="row-main"><b>${esc(devName(d))}</b><span class="muted">${b ? `Breaker ${esc(slotText(b))}${b.label ? ' · ' + esc(b.label) : ''}` : 'No breaker picked'}</span></span><span class="row-side">${proj(b)}</span><span class="chev" aria-hidden="true">›</span></a></li>`;
  }).join('')}</ul></div>`).join('')}` : ''}
  ${breakers.length ? `<h3 class="sr-head">${devices.length && !is240 ? 'Or put it straight on a breaker' : 'Pick the breaker'}</h3>
  <ul class="list card sr-list pick-breakers">${bList.map((b) => `<li><a class="row" href="#/h/${homeId}/breaker/${b.id}?${addQ}#loads"><span class="big-slot sm">${esc(slotText(b))}</span><span class="row-main"><b>${esc(b.label || 'Breaker')}</b><span class="muted">${esc(ampsText(b))}${String(b.poles) === '2' ? ' · 240V' : ''}${(b.rooms || []).length ? ' · ' + esc(b.rooms.join(', ')) : ''}</span></span><span class="row-side">${proj(b)}</span><span class="chev" aria-hidden="true">›</span></a></li>`).join('')}</ul>` : ''}
  <p class="tiny muted">The % is the breaker's load check now → after adding it (typical watts). Over 80% is too much for things that run 3+ hours.</p>`;
  app.innerHTML = shell(homeId, 'search', body, { title: 'Add to...', back: c ? `#/h/${homeId}/search/dev/${c.id}` : `#/h/${homeId}/search${qs(name)}` });
  bindShell();
  const pf = document.getElementById('pickFilter');
  if (pf)
    pf.oninput = () => {
      const t = pf.value.trim().toLowerCase().replace(/^#/, '');
      app.querySelectorAll('.pick-card').forEach((card) => {
        const roomHit = !t || card.querySelector('.room-head').textContent.toLowerCase().includes(t);
        let any = false;
        card.querySelectorAll('li').forEach((li) => {
          const show = roomHit || li.textContent.toLowerCase().includes(t);
          li.hidden = !show;
          any = any || show;
        });
        card.hidden = !any;
      });
      app.querySelectorAll('.pick-breakers li').forEach((li) => (li.hidden = !!t && !li.textContent.toLowerCase().includes(t)));
    };
}

// Breaker / outlet screens: when opened from search ("?add=<catalog id>" or "?addname=<name>"),
// open the normal add form pre-filled. The parameter is removed right away so saving
// (which re-renders the screen) doesn't fill the form again.
function applyPrefill(f) {
  if (!f) return;
  const { q, parts, anchor } = parseRoute();
  const id = q.get('add');
  const nm = q.get('addname');
  if (!id && !nm) return;
  const c = id ? catById(id) : null;
  f.elements.name.value = c ? c.name : nm;
  if (c) {
    f.elements.watts.value = c.typical;
    f.dataset.autoWatts = String(c.typical);
    if (f.elements.wvolts) f.elements.wvolts.value = c.volts;
  }
  const det = f.closest('details');
  if (det) det.open = true;
  const note = f.querySelector('.prefill-note');
  if (note) {
    note.hidden = false;
    note.innerHTML = c
      ? `Pre-filled with a <b>typical</b> ${esc(c.name)} (${esc(wattsRange(c))}). If its label says different, change the watts.`
      : `Type the watts from its label. Only know the amps? Open the help below and enter them.`;
  }
  if (!c) {
    const wh = f.querySelector('.watts-help');
    if (wh) wh.open = true;
  }
  history.replaceState(null, '', `#/${parts.join('/')}${anchor ? '#' + anchor : ''}`);
  lastHash = location.hash;
  setTimeout(() => f.scrollIntoView({ block: 'center', behavior: 'smooth' }), 160);
}

// ---------------------------------------------------------------- move / plug in
// Where a load lives, in words: "Living room · Desk outlet · breaker 13"
function whereText(ref) {
  const r = parseRef(ref);
  if (!r) return '';
  if (r.kind === 'p') return 'Not plugged in';
  if (r.kind === 'b') {
    const b = byId('breakers', r.id);
    return b ? `Breaker ${slotText(b)}${b.label ? ` (${b.label})` : ''}` : '';
  }
  const d = byId('devices', r.id);
  if (!d) return '';
  const b = byId('breakers', d.breakerId);
  return [d.room, devName(d), b ? `breaker ${slotText(b)}` : 'no breaker yet'].filter(Boolean).join(' · ');
}

// The circuit a load counts on (null for unplugged portables / outlets with no breaker).
function breakerOfRef(ref) {
  const r = parseRef(ref);
  if (!r || r.kind === 'p') return null;
  if (r.kind === 'b') return byId('breakers', r.id) || null;
  const d = byId('devices', r.id);
  return d ? byId('breakers', d.breakerId) || null : null;
}

function renderMove(homeId, q) {
  const from = q.get('from') || '';
  const l = loadAt(D(), from);
  const fr = parseRef(from);
  if (!l || !fr) return renderNotFound();
  const plugIn = fr.kind === 'p';
  const back = q.get('back') || (fr.kind === 'b' ? `#/h/${homeId}/breaker/${fr.id}#loads` : fr.kind === 'd' ? `#/h/${homeId}/device/${fr.id}#plugged` : `#/h/${homeId}/portable`);
  const w = loadWatts(l);
  const counts = true; // Typical counts every listed device (no switching needed)
  const curB = breakerOfRef(from);
  const breakers = sortBreakers(inHome('breakers', homeId).filter((b) => b.kind !== 'spare'));
  const devices = inHome('devices', homeId).filter((d) => !d.type || ['outlet', 'appliance', 'other'].includes(d.type) || (d.loads || []).length);
  const proj = (b) => {
    if (!b) return '<span class="pill gray">no breaker</span>';
    const s = sumOf(b);
    if (!s.rating) return '';
    const same = curB && curB.id === b.id;
    const p = same ? { pct: s.pct, peakPct: s.allPct } : projectLoad(s, l);
    const lvl = p.pct > 100 ? 'red' : p.pct >= 80 ? 'amber' : 'green';
    return `<span class="pill ${lvl}">${Math.round(s.pct)}% → ${Math.round(p.pct)}%${p.peakPct > 100 ? ' ⚠️' : ''}</span>`;
  };
  const overNote = (b) => {
    if (!b || !counts || (curB && curB.id === b.id)) return '';
    const s = sumOf(b);
    if (!s.rating) return '';
    const p = projectLoad(s, l);
    return p.pct > 100 ? `<span class="over-note">Too much here, try another outlet</span>` : p.peakPct > 100 ? `<span class="over-note">Peak ${Math.round(p.peakPct)}% if everything runs at once</span>` : '';
  };
  const target = (kind, id, icon, title, sub, b) => `<li><button type="button" class="row pick-row" data-move-to="${kind}:${esc(id)}">${kind === 'b' ? icon : `<span class="row-icon" aria-hidden="true">${icon}</span>`}<span class="row-main"><b>${esc(title)}</b><span class="muted">${esc(sub)}</span>${overNote(b)}</span><span class="row-side">${proj(b)}</span></button></li>`;
  const rooms = new Map();
  for (const d of devices) {
    if (fr.kind === 'd' && d.id === fr.id) continue;
    const rn = d.room || 'No room set';
    if (!rooms.has(rn)) rooms.set(rn, []);
    rooms.get(rn).push(d);
  }
  const roomNames = [...rooms.keys()].sort((a, b) => a.localeCompare(b));
  const bList = breakers.filter((b) => !(fr.kind === 'b' && b.id === fr.id));
  const body = `
  <section class="detail-head">
    <div class="big-icon" aria-hidden="true">${plugIn ? '🔌' : '⇄'}</div>
    <div><h2>${plugIn ? 'Plug in' : 'Move'} ${esc(l.name)}</h2><p class="muted">Runs ${wattsText(w)} · ${esc(useLabel(habitOf(l).use))} · now: ${esc(whereText(from))}</p></div>
  </section>
  ${!plugIn ? `<div class="card move-opts">
    <label class="check-line"><input type="checkbox" id="portableChk" ${l.portable ? 'checked' : ''}> Moves around (portable)</label>
    ${l.portable ? `<button type="button" class="btn small" id="unplugBtn">Unplug (put away)</button>` : ''}
  </div>` : ''}
  <p class="tiny muted">Pick where it's plugged in now. The % is that breaker's Typical now → with ${esc(l.name)}. ⚠️ = Peak over 100%.</p>
  ${breakers.length + devices.length > 8 ? `<form class="search-box sbar pick-filter" onsubmit="return false"><label class="sr-only" for="pickFilter">Filter outlets and breakers</label><span class="sb-icon" aria-hidden="true">⌕</span><input id="pickFilter" type="search" placeholder="Filter: room, outlet or breaker #" autocomplete="off" enterkeyhint="done"></form>` : ''}
  ${roomNames.length ? `<h3 class="sr-head">Outlets</h3>${roomNames.map((rn) => `<div class="card room-card pick-card pick-group"><div class="room-head"><h3>${esc(rn)}</h3></div><ul class="list">${rooms.get(rn).map((d) => { const b = byId('breakers', d.breakerId); return target('d', d.id, deviceIcon(d.type), devName(d), b ? `Breaker ${slotText(b)}${b.label ? ' · ' + b.label : ''}` : 'Breaker not mapped yet', b); }).join('')}</ul></div>`).join('')}` : ''}
  ${bList.length ? `<h3 class="sr-head">Or a breaker (no specific outlet)</h3><ul class="list card sr-list pick-breakers pick-group">${bList.map((b) => target('b', b.id, `<span class="big-slot sm">${esc(slotText(b))}</span>`, b.label || 'Breaker', `${ampsText(b)}${String(b.poles) === '2' ? ' · 240V' : ''}${(b.rooms || []).length ? ' · ' + b.rooms.join(', ') : ''}`, b)).join('')}</ul>` : ''}`;
  app.innerHTML = shell(homeId, 'load', body, { title: plugIn ? 'Plug in at...' : 'Move to...', back });
  bindShell();
  const pf = document.getElementById('pickFilter');
  if (pf)
    pf.oninput = () => {
      const t = pf.value.trim().toLowerCase();
      app.querySelectorAll('.pick-row').forEach((row) => {
        row.parentElement.hidden = t && !row.textContent.toLowerCase().includes(t);
      });
      app.querySelectorAll('.pick-group').forEach((g) => {
        g.hidden = t && ![...g.querySelectorAll('li')].some((li) => !li.hidden);
      });
    };
  const chk = document.getElementById('portableChk');
  if (chk)
    chk.onchange = async () => {
      const u = setPortable(D(), from, chk.checked);
      if (u) await store.put(u.col, u.obj);
      toast(chk.checked ? 'Marked portable' : 'Not portable');
    };
  const un = document.getElementById('unplugBtn');
  if (un)
    un.onclick = async () => {
      await saveUpdates(moveLoad(D(), from, { kind: 'p', id: homeId }));
      toast(`${l.name} put away`);
      go(`#/h/${homeId}/portable`);
    };
  app.querySelectorAll('[data-move-to]').forEach((btn) => {
    btn.onclick = async () => {
      const [kind, id] = btn.dataset.moveTo.split(/:(.+)/);
      const tb = kind === 'b' ? byId('breakers', id) : byId('breakers', (byId('devices', id) || {}).breakerId);
      const s = tb ? sumOf(tb) : null;
      const after = s && s.rating ? projectLoad(s, l).pct : null;
      const ups = moveLoad(D(), from, { kind, id });
      if (!ups.length) return;
      await saveUpdates(ups);
      if (after && after > 100) toast(`${l.name} here → ${Math.round(after)}% ⚠️ try another outlet`);
      else toast(`${plugIn ? 'Plugged in' : 'Moved'}: ${l.name}`);
      go(q.get('back') || (kind === 'b' ? `#/h/${homeId}/breaker/${id}#loads` : `#/h/${homeId}/device/${id}#plugged`));
    };
  });
}

// ---------------------------------------------------------------- portable devices
// ---------------------------------------------------------------- one device: running / idle / how much it's on
const pctOf = (o) => `${Math.round(o.share * 100)}%`;
function usePickHtml(cur, guessed) {
  return `<fieldset class="pick-cards use-pick"><legend>How much is it on?</legend>
    ${USE_OPTIONS.map((o) => `<label class="pick-card ${cur === o.id ? 'on' : ''}"><input type="radio" name="use" value="${o.id}" ${cur === o.id ? 'checked' : ''}><span class="pc-text"><b>${esc(o.label)}</b><small>${esc(o.sub)} · ~${pctOf(o)}</small></span></label>`).join('')}
    ${guessed ? '<p class="tiny muted use-guess">Picked for you (estimate). Tap to change.</p>' : ''}
  </fieldset>`;
}
function itemPreview(l, volts) {
  const q = Number(l.qty) || 1;
  const typ = loadReading(l, 'typical');
  const h = habitOf(l);
  return `<div class="item-preview">
    <div><span>Typical</span><b>${wNum(typ)}W</b><small>${fmtAmps(typ / volts)}A</small></div>
    <div><span>Idle</span><b>${wNum(h.idle * q)}W</b><small>${fmtAmps((h.idle * q) / volts)}A</small></div>
    <div><span>Peak</span><b>${wNum(h.run * q)}W</b><small>${fmtAmps((h.run * q) / volts)}A</small></div>
  </div>`;
}
function renderItem(homeId, q) {
  const ref = q.get('ref') || '';
  const l = loadAt(D(), ref);
  const r = parseRef(ref);
  if (!l || !r || r.kind === 'p') return renderNotFound();
  const back = r.kind === 'b' ? `#/h/${homeId}/breaker/${r.id}#loads` : `#/h/${homeId}/device/${r.id}#plugged`;
  const b = breakerOfRef(ref);
  const volts = voltsFor(b && b.poles);
  const h = habitOf(l);
  const g = guessHabit(l.name);
  const now = nowState(l);
  const hasIdle = l.idleW !== undefined && l.idleW !== null && l.idleW !== '';
  const body = `
  <section class="detail-head">
    <div class="big-icon" aria-hidden="true">🔌</div>
    <div><h2>${esc(l.name)}</h2><p class="muted">${esc(whereText(ref))}</p></div>
  </section>
  <form id="itemEdit" class="form card">
    <label>Name<input name="name" value="${esc(l.name)}" autocomplete="off"></label>
    <div class="two">
      <label>When running <span class="muted">(W)</span><input name="watts" type="number" inputmode="decimal" min="0" step="any" value="${esc(l.watts)}"></label>
      <label>When idle <span class="muted">(W)</span><input name="idleW" type="number" inputmode="decimal" min="0" step="any" value="${hasIdle ? esc(l.idleW) : ''}" placeholder="${esc(wNum(Math.min(g.idle, Number(l.watts) || 0)))}"></label>
    </div>
    <p class="tiny muted">${hasIdle ? 'Idle = off or on standby.' : `Idle is an estimate (~${esc(wNum(h.idle))}W). Off or standby: TV ~0.5W, fridge between cycles ~5W.`}</p>
    <div class="amps-line"><span class="muted tiny">Only know the amps?</span><input name="amps" type="number" inputmode="decimal" step="0.1" min="0" placeholder="amps" aria-label="Amps"><span class="muted tiny">× ${volts}V</span></div>
    ${usePickHtml(h.use, h.useIsGuess)}
    <div id="itemPrev">${itemPreview(l, volts)}</div>
    <fieldset class="seg now-pick"><legend>Right now <span class="muted">(optional, resets after ${NOW_HOURS} hrs)</span></legend>
      ${[['auto', 'Typical'], ['on', 'On now'], ['off', 'Off now']].map(([v, t]) => `<label class="seg-opt"><input type="radio" name="now" value="${v}" ${now === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
    </fieldset>
    <div class="two">
      <label>How many<input name="qty" type="number" inputmode="numeric" min="1" step="1" value="${esc(Number(l.qty) || 1)}"></label>
      <label>Note <span class="muted">(optional)</span><input name="note" value="${esc(l.note || '')}" autocomplete="off"></label>
    </div>
    <label class="check-line"><input type="checkbox" name="portable" ${l.portable ? 'checked' : ''}> Moves around (portable)</label>
    <button class="btn primary full" type="submit">Save</button>
    <p class="tiny muted">${esc(HABIT_NOTE)}</p>
  </form>`;
  app.innerHTML = shell(homeId, 'panel', body, { title: 'Edit device', back });
  bindShell();
  const f = document.getElementById('itemEdit');
  const draft = () => {
    const use = (f.querySelector('input[name="use"]:checked') || {}).value;
    const idle = f.elements.idleW.value;
    return { name: f.elements.name.value.trim() || l.name, watts: Number(f.elements.watts.value) || 0, qty: Number(f.elements.qty.value) || 1, use, ...(idle !== '' ? { idleW: Number(idle) } : {}) };
  };
  const refresh = () => {
    f.querySelectorAll('.use-pick .pick-card').forEach((c) => c.classList.toggle('on', c.querySelector('input').checked));
    document.getElementById('itemPrev').innerHTML = itemPreview(draft(), volts);
  };
  f.addEventListener('input', (e) => {
    if (e.target.name === 'amps') {
      const a = Number(e.target.value);
      if (a > 0) f.elements.watts.value = Math.round(a * volts);
    }
    if (e.target.name === 'use') { const gl = f.querySelector('.use-guess'); if (gl) gl.remove(); }
    refresh();
  });
  f.addEventListener('change', refresh);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = draft();
    if (!(d.watts > 0)) return toast('Add the running watts');
    const nowV = (f.querySelector('input[name="now"]:checked') || {}).value || 'auto';
    const cur = loadAt(D(), ref);
    const patch = {
      name: d.name,
      watts: d.watts,
      qty: d.qty,
      idleW: f.elements.idleW.value === '' ? null : Math.max(0, Number(f.elements.idleW.value) || 0),
      use: h.useIsGuess && d.use === h.use && !f.dataset.useTouched ? null : d.use,
      note: f.elements.note.value.trim() || null,
      portable: f.elements.portable.checked ? true : null,
    };
    if (nowV === 'auto') { patch.on = null; patch.nowAt = null; }
    else if (nowV !== nowState(cur)) { patch.on = nowV === 'on'; patch.nowAt = Date.now(); }
    const u = updateLoad(D(), ref, patch);
    if (u) await saveUpdates([u]);
    toast('Saved');
    go(back);
  };
  f.querySelectorAll('input[name="use"]').forEach((x) => x.addEventListener('change', () => { f.dataset.useTouched = '1'; }));
}

function renderPortables(homeId) {
  const home = byId('homes', homeId);
  const ps = portablesOf(D(), homeId);
  const have = new Set(ps.map((x) => String(x.load.name).toLowerCase()));
  const sugg = PORTABLE_SUGGESTIONS.map((id) => catById(id)).filter((c) => c && !have.has(c.name.toLowerCase()));
  const back = encodeURIComponent(`#/h/${homeId}/portable`);
  const row = ({ ref, load: l, where }) => {
    const w = loadWatts(l);
    const b = where ? where.breaker : null;
    const s = b ? sumOf(b) : null;
    const status = !where ? 'Put away · not counted' : `${whereText(ref)}${s && s.rating ? ` · ${Math.round(s.pct)}% typical · peak ${Math.round(s.allPct)}%` : ''}`;
    return `<li class="item-row portable-row ${where ? '' : 'is-off'}">
      <span class="onoff-gap" aria-hidden="true">${where ? '🔌' : '🧳'}</span>
      <span class="item-main"><b>${esc(l.name)} <span class="tag-portable">portable</span></b><span class="muted tiny">${esc(status)}${s && (s.level === 'over' || s.allLevel === 'over') ? ' ⚠️' : ''}</span></span>
      <span class="item-w">${wattsText(w)}</span>
      <span class="portable-acts">
        <a class="btn small" href="#/h/${homeId}/move?from=${encodeURIComponent(ref)}&back=${back}">${where ? 'Move' : 'Plug in at...'}</a>
        ${where ? `<button type="button" class="btn small ghost" data-unplug="${esc(ref)}">Unplug</button>` : `<button type="button" class="icon-btn small" data-del-ref="${esc(ref)}" aria-label="Remove ${esc(l.name)}">✕</button>`}
      </span>
    </li>`;
  };
  const body = `
  <div class="section-head"><h2>Portable devices</h2></div>
  <p class="muted">Things you carry room to room. They don't count on any breaker until you plug them in somewhere. Plug one in and you'll see what it does to that breaker first.</p>
  <div class="card">
    ${ps.length ? `<ul class="list items">${ps.map(row).join('')}</ul>` : '<p class="muted">No portable devices yet. Add the ones you use below.</p>'}
  </div>
  ${sugg.length ? `<div class="card"><h3>Add a common one</h3><div class="chips">${sugg.map((c) => `<button type="button" class="chip" data-add-portable="${esc(c.id)}">+ ${esc(c.name)} <span class="muted">~${Number(c.typical).toLocaleString('en-US')}W</span></button>`).join('')}</div><p class="tiny muted">Typical estimates. Check the label on yours and edit the watts if it's different.</p></div>` : ''}
  <details class="card add-wrap"><summary class="btn full">+ Add your own</summary>
    <form id="portForm" class="form">
      <div class="two"><label>Name<input name="name" placeholder="e.g. Shop vac" autocomplete="off"></label><label>Watts<input name="watts" type="number" inputmode="numeric" min="0" placeholder="1200"></label></div>
      <button class="btn primary full" type="submit">Add portable</button>
    </form>
  </details>`;
  app.innerHTML = shell(homeId, 'load', body, { title: 'Portable devices', back: `#/h/${homeId}/load` });
  bindShell();
  const addP = async (item) => {
    const h = byId('homes', homeId);
    await store.put('homes', { ...h, portables: [...(h.portables || []), { ...item, portable: true }] });
  };
  app.querySelectorAll('[data-add-portable]').forEach((btn) => {
    btn.onclick = async () => {
      const c = catById(btn.dataset.addPortable);
      if (!c) return;
      await addP({ name: c.name, watts: c.typical, qty: 1, note: 'Typical estimate' });
      toast(`Added ${c.name}`);
    };
  });
  const pfm = document.getElementById('portForm');
  pfm.onsubmit = async (e) => {
    e.preventDefault();
    const name = pfm.elements.name.value.trim();
    const watts = Number(pfm.elements.watts.value);
    if (!name || !(watts > 0)) return toast('Add a name and watts');
    await addP({ name, watts, qty: 1 });
    toast('Added');
  };
  app.querySelectorAll('[data-unplug]').forEach((btn) => {
    btn.onclick = async () => {
      await saveUpdates(moveLoad(D(), btn.dataset.unplug, { kind: 'p', id: homeId }));
      toast('Unplugged');
    };
  });
  void home;
}

// ---------------------------------------------------------------- load check
function renderLoad(homeId) {
  const breakers = inHome('breakers', homeId).filter((b) => b.kind !== 'spare');
  const rows = breakers.map((b) => ({ b, s: sumOf(b) })).sort((x, y) => y.s.pct - x.s.pct || (parseInt(x.b.slot, 10) - parseInt(y.b.slot, 10)));
  const over = rows.filter((r) => r.s.level === 'over').length;
  const warn = rows.filter((r) => r.s.level === 'warn').length;
  const body = `
  <div class="section-head"><h2>Load check</h2></div>
  <div class="card summary">
    <div><b class="${over ? 'bad' : ''}">${over}</b><span>over 100%</span></div>
    <div><b class="${warn ? 'warnc' : ''}">${warn}</b><span>at 80%+</span></div>
    <div><b>${rows.filter((r) => r.s.level === 'ok').length}</b><span>OK</span></div>
  </div>
  ${inHome('panels', homeId).filter((p) => p.type === 'rv').map((p) => shoreCard(p, inHome('breakers', homeId).filter((b) => b.panelId === p.id), homeId, true)).join('')}
  ${(() => {
    const ps = portablesOf(D(), homeId);
    const placed = ps.filter((x) => x.where).length;
    return `<a class="card portable-link" href="#/h/${homeId}/portable"><span class="row-icon" aria-hidden="true">🧳</span><span class="row-main"><b>Portable devices${ps.length ? ` <span class="count">${ps.length}</span>` : ''}</b><span class="muted">${ps.length ? `${placed} plugged in · ${ps.length - placed} put away` : 'Vacuum, hair dryer, heater... check an outlet before you plug in'}</span></span><span class="chev" aria-hidden="true">›</span></a>`;
  })()}
  <p class="tiny muted">Typical = each device's running watts × how much it's on, plus idle the rest of the time. Peak = everything running at once. Keep Typical under 80%.</p>
  <ul class="list load-list">${rows.map(({ b, s }) => `<li><a class="load-item" href="#/h/${homeId}/breaker/${b.id}#loads">
    <div class="load-top"><span class="big-slot sm">${esc(slotText(b))}</span><span class="row-main"><b>${esc(b.label || 'Breaker')}</b><span class="muted">${s.level === 'none' ? 'No loads listed yet' : `Typical ${fmtAmps(s.amps)}A of ${s.rating}A`}</span>${maxLine(s, 'muted tiny block')}</span><span class="pct ${s.level}">${s.level === 'none' ? '-' : Math.round(s.pct) + '%'}</span></div>
    ${s.level !== 'none' ? loadBar(s, true) : ''}
  </a></li>`).join('')}</ul>`;
  app.innerHTML = shell(homeId, 'load', body);
  bindShell();
}

// ---------------------------------------------------------------- more
function renderMore(homeId) {
  const home = byId('homes', homeId);
  const panels = inHome('panels', homeId);
  const body = `
  <div class="section-head"><h2>Settings</h2></div>
  <div class="card">
    <h3>Appearance</h3>
    <label class="sr-only" for="themePick">Appearance</label>
    <select id="themePick" class="full">${opt(THEME_OPTIONS, getThemePref())}</select>
    <p class="tiny muted">Saved on this device. System follows your phone's light / dark mode.</p>
  </div>
  <div class="card">
    <h3>Print</h3>
    <div class="stack">
      ${panels.map((p) => `<a class="btn" href="#/h/${homeId}/print/directory/${p.id}">Panel door label: ${esc(p.name)}</a>`).join('')}
      <a class="btn" href="#/h/${homeId}/print/qr">QR sticker sheet</a>
      <a class="btn" href="#/h/${homeId}/print/shop">Shopping list</a>
    </div>
  </div>
  <div class="card">
    <h3>This home</h3>
    <p class="muted">${esc(home.name)}${home.address ? ' · ' + esc(home.address) : ''}</p>
    <div class="stack">
      <a class="btn" href="#/edit/homes/${homeId}">Edit home</a>
      <a class="btn" href="#/edit/homes/new">+ Add another home</a>
      <a class="btn" href="#/edit/panels/new?home=${homeId}">+ Add a panel / sub-panel</a>
    </div>
  </div>
  <div class="card access-entry">
    <h3>Who can edit</h3>
    <p class="muted">Give an electrician a code to make changes, see what they changed, or hand this home to its owner.</p>
    <a class="btn primary" href="#/h/${homeId}/access">Edit codes &amp; history ›</a>
  </div>
  <div id="sharedWithMe"></div>
  <div class="card" id="share">
    <h3>Share a read-only copy</h3>
    ${home.shareToken
      ? `<p class="muted">Anyone with this link can view (not edit) the panel directory for ${esc(home.name)}. Scanning this home's panel QR sticker also offers it.</p>
         <input class="share-url" readonly value="${esc(deepLink('/share/' + home.shareToken))}" aria-label="Share link">
         <div class="stack" style="margin-top:8px"><button class="btn primary" id="shareCopy">Copy link</button><button class="btn" id="shareUpdate">Update shared copy with latest changes</button><button class="btn danger" id="shareStop">Stop sharing</button></div>`
      : `<p class="muted">Make a link a customer, landlord or family member can open to see the panel directory (no account needed). It's a snapshot; update it any time.</p><button class="btn" id="shareMake">Create share link</button>`}
  </div>
  <div class="card">
    <h3>Backup &amp; export</h3>
    <div class="stack">
      <button class="btn" id="expJson">Download backup (JSON, everything)</button>
      <button class="btn" id="expBrk">Breakers spreadsheet (CSV)</button>
      <button class="btn" id="expDev">Outlets &amp; lights spreadsheet (CSV)</button>
      <button class="btn" id="expShop">Shopping list spreadsheet (CSV)</button>
      ${D().panels.some((p) => (p.fuses || []).length) ? '<button class="btn" id="expFuse">12V fuses spreadsheet (CSV)</button>' : ''}
      <label class="btn file-btn">Restore from backup (JSON)<input type="file" accept="application/json,.json" id="impJson" hidden></label>
      ${store.mode === 'cloud' && localStorage.getItem('panelbuddy:data:v1') ? '<button class="btn" id="impLocal">Copy demo data from this device into my account</button>' : ''}
    </div>
    <p class="tiny muted">For a PDF: open a print page and choose "Save as PDF" (Windows) or Share > Print > pinch out (iPhone).</p>
  </div>
  <div class="card">
    <h3>Account type</h3>
    <label class="sr-only" for="acctType">Account type</label>
    <select id="acctType" class="full">${opt([{ value: 'personal', label: 'Personal (my own home / RV)' }, { value: 'pro', label: 'Tech / Pro (I service customers)' }], isPro() ? 'pro' : 'personal')}</select>
    <p class="tiny muted">Tech / Pro adds a Customers tab: customer list, their properties and RVs, service log, and labels to leave at the job.</p>
  </div>
  <div class="card">
    <h3>Account</h3>
    ${store.mode === 'cloud'
      ? `<p>Signed in as <b>${esc(store.user.email)}</b>. Synced across your devices; works offline and syncs when you have signal.</p><button class="btn" id="signOut">Sign out</button>`
      : `<p>Demo mode: everything is saved only in this browser.</p>
         <div class="stack">${isFirebaseConfigured() ? '<button class="btn primary" id="goCloud">Sign in / create a free account</button>' : ''}<button class="btn ghost" id="resetDemo">Reset demo to the sample home</button></div>`}
  </div>
  <div class="card">
    <h3>Install on your phone</h3>
    <p class="muted"><b>iPhone:</b> open in Safari, tap Share, then "Add to Home Screen".<br><b>Android / Windows (Chrome or Edge):</b> menu, then "Install app".</p>
  </div>
  <p class="tiny muted center">AmpMap · free, no ads, no trackers. Not a substitute for a licensed electrician; turn the breaker off and verify with a tester before touching wiring.<br><a href="/privacy.html">Privacy Policy</a></p>`;
  app.innerHTML = shell(homeId, 'more', body);
  bindShell();
  const $ = (id) => document.getElementById(id);
  $('themePick').onchange = (e) => { setThemePref(e.target.value); toast(`Appearance: ${e.target.options[e.target.selectedIndex].text}`); };
  $('expJson').onclick = async () => {
    const data = JSON.parse(JSON.stringify(D()));
    const photos = {};
    for (const c of ['panels', 'devices']) for (const it of data[c]) if (it.photoId) photos[it.photoId] = await store.getPhoto(it.photoId);
    for (const h of data.homes) if (h.floorplan && h.floorplan.photoId) photos[h.floorplan.photoId] = await store.getPhoto(h.floorplan.photoId);
    download(`ampmap-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'panel-buddy', version: 1, exportedAt: new Date().toISOString(), ...data, settings: store.settings, photos }, null, 2));
  };
  $('expBrk').onclick = () => download('ampmap-breakers.csv', breakersCsv(D()), 'text/csv');
  if ($('expFuse')) $('expFuse').onclick = () => download('ampmap-12v-fuses.csv', fusesCsv(D()), 'text/csv');
  $('acctType').onchange = async (e) => {
    const t = e.target.value;
    await store.saveSettings({ accountType: t });
    if (t === 'pro' && store.mode === 'demo' && !D().customers.length) await store.addMany(seedPro());
    toast(t === 'pro' ? 'Tech / Pro mode on' : 'Personal mode');
    if (t === 'pro') go('#/customers');
  };
  const panelIds = inHome('panels', homeId).map((p) => p.id);
  if ($('shareMake')) $('shareMake').onclick = async () => {
    const token = shareToken();
    try {
      await store.createShare(token, sharePayload(homeId), panelIds);
      await store.put('homes', { ...home, shareToken: token });
      toast('Share link ready');
    } catch (ex) {
      alert("Couldn't create the link: " + ex.message);
    }
  };
  if ($('shareCopy')) $('shareCopy').onclick = async () => {
    const url = deepLink('/share/' + home.shareToken);
    try {
      if (navigator.share) await navigator.share({ title: `${home.name} panel directory`, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied'); }
    } catch {
      const i = document.querySelector('.share-url');
      i.select();
    }
  };
  if ($('shareUpdate')) $('shareUpdate').onclick = async () => { await store.createShare(home.shareToken, sharePayload(homeId), panelIds); toast('Shared copy updated'); };
  if ($('shareStop')) $('shareStop').onclick = async () => {
    if (!confirm('Turn off this link? Anyone who has it will lose access, and any edit code stops working.')) return;
    if (store.deleteEditCode) await store.deleteEditCode(home.shareToken, homeId).catch(() => {});
    await store.deleteShare(home.shareToken, panelIds);
    const { shareToken: _t, ...rest } = home;
    void _t;
    await store.put('homes', rest);
  };
  $('expShop').onclick = () => download('ampmap-shopping-list.csv', shoppingCsv(inHome('devices', homeId), shopScope(homeId), home.name), 'text/csv');
  $('expDev').onclick = () => download('ampmap-outlets-lights.csv', devicesCsv(D()), 'text/csv');
  $('impJson').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.homes)) throw new Error('Not an AmpMap backup');
      if (!confirm(`Replace everything here with this backup (${parsed.homes.length} home(s), ${(parsed.breakers || []).length} breakers, ${(parsed.devices || []).length} items)?`)) return;
      await importAll(parsed);
      toast('Backup restored');
      go('#/');
    } catch (ex) {
      alert("Couldn't read that file: " + ex.message);
    }
  };
  if ($('impLocal'))
    $('impLocal').onclick = async () => {
      const parsed = JSON.parse(localStorage.getItem('panelbuddy:data:v1'));
      if (!confirm('Replace your account data with the demo data saved on this device?')) return;
      await importAll(parsed);
      toast('Copied');
      go('#/');
    };
  if ($('signOut')) $('signOut').onclick = () => store.signOut();
  if ($('goCloud')) $('goCloud').onclick = () => { localStorage.removeItem(MODE_KEY); location.hash = '#/'; location.reload(); };
  sharedWithMeHtml().then((html) => {
    const el = document.getElementById('sharedWithMe');
    if (!el || !html) return;
    el.innerHTML = html;
    store.listMyGrants().then((gs) => el.querySelectorAll('[data-opengrant]').forEach((b) => (b.onclick = () => {
      const g = gs[Number(b.dataset.opengrant)];
      if (!g) return;
      sessionStorage.setItem(GUEST_KEY, JSON.stringify({ mode: 'grant', ownerUid: g.owner, homeId: g.homeId, name: store.user.email || 'Installer', token: '' }));
      location.hash = `#/h/${g.homeId}/panel`;
      location.reload();
    })));
  }).catch(() => {});
  if ($('resetDemo')) $('resetDemo').onclick = async () => { if (confirm('Erase demo data on this device and reload the sample home?')) { await store.resetDemo(); go('#/'); } };
}

async function importAll(parsed) {
  await store.replaceAll(parsed);
  if (parsed.settings && parsed.settings.accountType) await store.saveSettings({ accountType: parsed.settings.accountType });
  const photos = parsed.photos || {};
  for (const [id, dataUrl] of Object.entries(photos)) if (dataUrl) await store.putPhoto(id, dataUrl);
}


// ---------------------------------------------------------------- customers (Tech / Pro)
function renderCustomers(q) {
  const homeId = currentHomeId();
  const sort = q.get('sort') || 'recent';
  const all = D().customers;
  const sorters = {
    recent: (a, b) => (b.lastOpenedAt || b.createdAt || 0) - (a.lastOpenedAt || a.createdAt || 0),
    name: (a, b) => (a.name || '').localeCompare(b.name || ''),
    serviced: (a, b) => String(b.lastServiced || '').localeCompare(String(a.lastServiced || '')),
    frequent: (a, b) => (b.openCount || 0) - (a.openCount || 0),
  };
  const list = [...all].sort(sorters[sort] || sorters.recent);
  const body = `
  <div class="section-head"><h2>Customers</h2><a class="btn small primary" href="#/edit/customers/new">+ Customer</a></div>
  ${!isPro() ? `<div class="alert warn">Customers are part of Tech / Pro mode. Turn it on in More > Account type.</div>` : ''}
  <form class="search-box" role="search" id="cForm"><label class="sr-only" for="cq">Search customers</label><input id="cq" type="search" placeholder="Search name, phone, address..." autocomplete="off"></form>
  <label class="sr-only" for="cSort">Sort</label>
  <select id="cSort" class="full" style="margin-top:10px">${opt([{ value: 'recent', label: 'Sort: recently opened' }, { value: 'frequent', label: 'Sort: most opened' }, { value: 'serviced', label: 'Sort: last serviced' }, { value: 'name', label: 'Sort: name A-Z' }], sort)}</select>
  <ul class="list card" id="cList"></ul>`;
  app.innerHTML = shell(homeId, 'customers', body);
  bindShell();
  const input = document.getElementById('cq');
  const draw = () => {
    const t = input.value.trim().toLowerCase();
    const shown = list.filter((c) => {
      if (!t) return true;
      const props = D().homes.filter((h) => h.customerId === c.id).map((h) => h.name + ' ' + (h.address || '')).join(' ');
      return [c.name, c.phone, c.email, c.notes, props].join(' ').toLowerCase().includes(t);
    });
    document.getElementById('cList').innerHTML = shown.length
      ? shown.map((c) => {
          const n = D().homes.filter((h) => h.customerId === c.id).length;
          return `<li><a class="row" href="#/customers/${c.id}"><span class="row-icon" aria-hidden="true">👤</span><span class="row-main"><b>${esc(c.name)}</b><span class="muted">${esc([c.phone, n ? `${n} propert${n > 1 ? 'ies' : 'y'}` : 'no properties yet', c.lastServiced ? 'last serviced ' + c.lastServiced : ''].filter(Boolean).join(' · '))}</span></span></a></li>`;
        }).join('')
      : `<li class="muted" style="padding:16px 0">${all.length ? 'No match.' : 'No customers yet. Add your first one.'}</li>`;
  };
  input.oninput = draw;
  document.getElementById('cForm').onsubmit = (e) => { e.preventDefault(); input.blur(); };
  document.getElementById('cSort').onchange = (e) => go(`#/customers?sort=${e.target.value}`);
  draw();
}

let lastOpenedCustomer = null;
function renderCustomer(id) {
  const c = byId('customers', id);
  if (!c) return renderNotFound();
  if (lastOpenedCustomer !== location.hash) {
    lastOpenedCustomer = location.hash;
    store.put('customers', { ...c, lastOpenedAt: Date.now(), openCount: (c.openCount || 0) + 1 });
    return; // the save re-renders
  }
  const homeId = currentHomeId();
  const props = D().homes.filter((h) => h.customerId === c.id);
  const visits = [...(c.visits || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const today = new Date().toISOString().slice(0, 10);
  const body = `
  <section class="detail-head"><div class="big-icon" aria-hidden="true">👤</div><div><h2>${esc(c.name)}</h2><p class="muted">${c.lastServiced ? 'Last serviced ' + esc(c.lastServiced) : 'Not serviced yet'}</p></div></section>
  <div class="row-actions">
    ${c.phone ? `<a class="btn" href="tel:${esc(c.phone.replace(/[^0-9+]/g, ''))}">📞 Call</a><a class="btn" href="sms:${esc(c.phone.replace(/[^0-9+]/g, ''))}">💬 Text</a>` : ''}
    ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">✉️ Email</a>` : ''}
    <a class="btn" href="#/edit/customers/${c.id}">Edit</a>
  </div>
  ${c.phone || c.email ? `<div class="card"><dl class="facts">${c.phone ? `<dt>Phone</dt><dd>${esc(c.phone)}</dd>` : ''}${c.email ? `<dt>Email</dt><dd>${esc(c.email)}</dd>` : ''}</dl></div>` : ''}
  ${c.notes ? `<div class="card"><h3>Notes</h3><p class="pre">${esc(c.notes)}</p></div>` : ''}
  <div class="card">
    <div class="room-head"><h3>Properties &amp; RVs (${props.length})</h3><a class="btn small" href="#/edit/homes/new?customer=${c.id}">+ Add</a></div>
    ${props.length ? `<ul class="list">${props.map((h) => {
      const ps = inHome('panels', h.id);
      return `<li class="prop"><a class="row" href="#/h/${h.id}/panel"><span class="row-icon" aria-hidden="true">${h.type === 'rv' ? '🚐' : '🏠'}</span><span class="row-main"><b>${esc(h.name)}</b><span class="muted">${esc([labelOf(HOME_TYPES, h.type), h.address, `${ps.length} panel${ps.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '))}</span></span></a>
        <div class="prop-actions">${ps[0] ? `<a class="btn small" href="#/h/${h.id}/print/directory/${ps[0].id}">Label</a>` : ''}<a class="btn small" href="#/h/${h.id}/print/qr">QR stickers</a><a class="btn small" href="#/h/${h.id}/more#share">Share</a></div></li>`;
    }).join('')}</ul>` : '<p class="muted">Add their house, shop or RV, then map its panel.</p>'}
  </div>
  <div class="card">
    <h3>Service log</h3>
    <form id="visitForm" class="form inline-form" style="border:0;margin:0;padding:0">
      <label>Date<input type="date" name="date" value="${today}" required></label>
      <label>What was done<textarea name="notes" rows="3" placeholder="e.g. Replaced 20A breaker #6, added GFCI in bath"></textarea></label>
      <button class="btn primary" type="submit">Add visit</button>
    </form>
    ${visits.length ? `<ul class="list visits">${visits.map((v) => `<li class="load-row"><span><b>${esc(v.date)}</b><span class="block pre">${esc(v.notes)}</span></span><button class="icon-btn small" data-del-visit="${esc(v.date)}|${esc((v.notes || '').slice(0, 40))}" aria-label="Remove visit">✕</button></li>`).join('')}</ul>` : '<p class="muted">No visits logged yet.</p>'}
  </div>`;
  app.innerHTML = shell(homeId, 'customers', body, { title: 'Customer', back: '#/customers' });
  bindShell();
  const vf = document.getElementById('visitForm');
  vf.onsubmit = async (e) => {
    e.preventDefault();
    const v = { date: vf.elements.date.value, notes: vf.elements.notes.value.trim() };
    if (!v.date) return;
    const nextVisits = [...(c.visits || []), v];
    const last = nextVisits.map((x) => x.date).sort().pop();
    await store.put('customers', { ...c, visits: nextVisits, lastServiced: last });
    toast('Visit saved');
  };
  app.querySelectorAll('[data-del-visit]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Remove this visit?')) return;
      const [date, start] = b.dataset.delVisit.split('|');
      const i = (c.visits || []).findIndex((x) => x.date === date && (x.notes || '').slice(0, 40) === start);
      const nv = [...(c.visits || [])];
      if (i >= 0) nv.splice(i, 1);
      await store.put('customers', { ...c, visits: nv, lastServiced: nv.map((x) => x.date).sort().pop() || '' });
    };
  });
}


// ---------------------------------------------------------------- QR short links + scanner
// Stickers carry only https://<app>/#/p/<panelId> (or /d/, /b/). No personal data.
async function resolveShort(kind, id) {
  const col = { p: 'panels', d: 'devices', b: 'breakers' }[kind];
  const view = { p: 'panel', d: 'device', b: 'breaker' }[kind];
  if (store.mode === 'cloud' && !store.user) {
    pendingRoute = location.hash;
    return renderLogin();
  }
  const item = byId(col, id);
  if (item) return location.replace(`#/h/${item.homeId}/${view}/${id}`);
  const homeId = currentHomeId();
  app.innerHTML = shell(homeId, '', `<div class="card empty"><h2>Not in your AmpMap</h2>
    <p>This sticker belongs to ${store.mode === 'cloud' ? 'another account' : 'data that isn\'t on this device'}.</p>
    <div id="shareHint" class="muted">Checking for a shared copy...</div>
    ${store.mode === 'cloud' ? '<button class="btn" id="switchAcct">Sign in with a different account</button>' : ''}
    <a class="btn ghost" href="#/">Go to my panel</a></div>`, { title: 'Scanned sticker', back: '#/' });
  bindShell();
  const sw = document.getElementById('switchAcct');
  if (sw) sw.onclick = async () => { pendingRoute = `#/${kind}/${id}`; await store.signOut(); };
  const token = kind === 'p' && store.lookupPanelShare ? await store.lookupPanelShare(id) : null;
  const hint = document.getElementById('shareHint');
  if (hint) hint.innerHTML = token ? `<a class="btn primary" href="#/share/${token}">View the shared panel directory (read-only)</a>` : 'The owner hasn\'t shared a read-only copy of this panel.';
}

let scanStream = null;
function stopScan() {
  if (scanStream) scanStream.getTracks().forEach((t) => t.stop());
  scanStream = null;
}
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/scan')) stopScan(); });

function handleScanned(text) {
  stopScan();
  const m = String(text).match(/#(\/(?:p|d|b|h|share)\/[^\s]*)/);
  if (m) return go('#' + m[1]);
  const el = document.getElementById('scanMsg');
  if (el) el.textContent = `That QR code isn't an AmpMap sticker: ${String(text).slice(0, 120)}`;
}

async function decodeImageData(imgData) {
  const { default: jsQR } = await import('jsqr');
  const r = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'attemptBoth' });
  return r ? r.data : null;
}

async function renderScan() {
  const homeId = currentHomeId();
  const body = `
  <div class="scan-wrap">
    <video id="scanVideo" playsinline muted aria-label="Camera view"></video>
    <div class="scan-frame" aria-hidden="true"></div>
  </div>
  <p id="scanMsg" class="center muted" role="status">Point the camera at an AmpMap QR sticker.</p>
  <label class="btn full file-btn">Take a photo of the sticker instead<input type="file" accept="image/*" capture="environment" id="scanFile" hidden></label>
  <p class="tiny muted center">Tip: your phone's regular Camera app can scan the stickers too.</p>`;
  app.innerHTML = homeId ? shell(homeId, '', body, { title: 'Scan sticker', back: '#/' }) : body;
  if (homeId) bindShell();
  const msg = document.getElementById('scanMsg');
  document.getElementById('scanFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const c = document.createElement('canvas');
      const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const text = await decodeImageData(ctx.getImageData(0, 0, c.width, c.height));
      URL.revokeObjectURL(url);
      if (text) handleScanned(text);
      else msg.textContent = "Couldn't find a QR code in that photo. Try closer, with good light.";
    };
    img.src = url;
  };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    msg.textContent = 'Live camera isn\'t available here. Use "Take a photo" below.';
    return;
  }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (e) {
    msg.textContent = 'Camera permission was blocked. Use "Take a photo" below, or allow the camera in Settings.';
    return;
  }
  const video = document.getElementById('scanVideo');
  if (!video) return stopScan();
  video.srcObject = scanStream;
  await video.play().catch(() => {});
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (!scanStream || !document.getElementById('scanVideo')) return stopScan();
    if (video.readyState >= 2 && video.videoWidth) {
      const s = Math.min(1, 720 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * s);
      canvas.height = Math.round(video.videoHeight * s);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const text = await decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (text) return handleScanned(text);
    }
    setTimeout(tick, 250);
  };
  tick();
}

// ---------------------------------------------------------------- read-only share
function shareToken() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join(''); // 36 chars
}

function sharePayload(homeId) {
  const home = byId('homes', homeId);
  return {
    v: 1,
    homeId,
    home: { name: home.name, type: home.type || '', address: home.address || '' },
    panels: inHome('panels', homeId).map((p) => ({
      id: p.id, name: p.name, type: p.type, numbering: p.numbering || 'space', layout: p.layout || 'auto', mainAmps: p.mainAmps || '', mainAmpsOther: p.mainAmpsOther || '',
      spaces: p.spaces || '', spacesOther: p.spacesOther || '', shorePower: p.shorePower || '', shorePowerOther: p.shorePowerOther || '', powerSource: p.powerSource || '', sourceAmps: p.sourceAmps || '', sourceAmpsOther: p.sourceAmpsOther || '', location: p.location || '',
      fuses: (p.fuses || []).map((f) => ({ num: f.num, amps: f.amps, ampsOther: f.ampsOther || '', powers: f.powers, notes: f.notes || '' })),
      breakers: inHome('breakers', homeId).filter((b) => b.panelId === p.id).map((b) => ({ slot: b.slot, poles: b.poles, size: b.size || 'full', half: b.half || '', btype: b.btype || '', amps: b.amps, ampsOther: b.ampsOther || '', label: b.label || '', rooms: b.rooms || [], kind: b.kind || '', ...(cleanWire(b.wire) ? { wire: cleanWire(b.wire) } : {}) })),
    })),
  };
}

async function renderShare(token) {
  app.innerHTML = `<div class="center-msg">Loading shared panel...</div>`;
  let doc = null;
  try {
    doc = await store.getShare(token);
  } catch (e) {
    doc = null;
  }
  if (!doc) {
    app.innerHTML = `<div class="auth"><img class="auth-logo" src="./brand/badge.png" alt="AmpMap logo" width="116" height="128"><h1>Link not found</h1><p class="muted">This shared panel link was turned off or doesn't exist.</p><a class="btn" href="#/">Open AmpMap</a></div>`;
    return;
  }
  const sections = (doc.panels || []).map((p) => {
    const one = layoutOf(p) === 'one';
    return `<div class="sheet directory full share-sheet">
      <div class="dir-head"><b>${esc(p.name)}</b>${p.mainAmps ? ` · Main ${esc(p.mainAmps === 'other' ? p.mainAmpsOther : p.mainAmps)}A` : ''}${p.type === 'rv' && p.shorePower ? ` · ${esc(shoreText(p))} shore` : ''}${sourceText(p) ? ` · ${esc(sourceText(p))}` : ''}${p.location ? ` · ${esc(p.location)}` : ''}</div>
      <table class="dir-table ${one ? 'one' : ''}"><thead><tr><th>#</th><th>A</th><th>Circuit</th>${one ? '' : '<th>#</th><th>A</th><th>Circuit</th>'}</tr></thead><tbody>${dirRowsHtml(p, p.breakers, { wire: true })}</tbody></table>
      ${p.fuses.length ? `<div class="dir-head" style="margin-top:8px"><b>12V DC fuses</b></div><table class="dir-table one"><thead><tr><th>#</th><th>A</th><th>Powers</th></tr></thead><tbody>${p.fuses.map((f) => `<tr><td class="n">${esc(f.num)}</td><td class="a">${esc(f.amps === 'other' ? f.ampsOther : f.amps)}A</td><td class="l">${esc(f.powers)}${f.notes ? ` <span class="rm">(${esc(f.notes)})</span>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
    </div>`;
  });
  app.innerHTML = `
  <header class="topbar"><img class="logo" src="./brand/house-108.png" alt="" aria-hidden="true" width="34" height="34"><div class="topbar-title"><h1>${esc(doc.home.name)}</h1></div></header>
  <main class="main share-main">
    ${guestEnded ? `<div class="alert warn no-print">${esc(guestEnded)}</div>` : ''}
    <p class="muted no-print">Read-only panel directory shared from AmpMap${doc.updatedAt ? ' · updated ' + new Date(doc.updatedAt).toLocaleDateString() : ''}.</p>
    <div class="row-actions no-print">${isGuest() ? `<a class="btn primary" href="#/h/${esc(store.guest.homeId)}/panel">✎ Back to editing</a>` : `<a class="btn primary" href="#/share/${esc(token)}/edit">✎ Edit</a>`}<button class="btn" id="doPrint">Print / Save as PDF</button><a class="btn ghost" href="#/get">Get AmpMap (free)</a></div>
    ${isGuest() ? '' : '<p class="tiny muted no-print edit-hint">Electricians: tap Edit and type the code from the homeowner.</p>'}
    ${sections.join('') || '<p>No panels in this share.</p>'}
  </main>`;
  document.getElementById('doPrint').onclick = () => window.print();
}

// ---------------------------------------------------------------- print
const STICKERS = {
  '5160': { label: 'Address labels 1" x 2-5/8" (30 per sheet, e.g. Avery 5160)', cls: 'st-5160', per: 30 },
  '22806': { label: '2" square stickers (12 per sheet, e.g. Avery 22806)', cls: 'st-22806', per: 12 },
  plain: { label: 'Plain paper, cut out (20 per page)', cls: 'st-plain', per: 20 },
};

// ---------------------------------------------------------------- shopping list
function shopScope(homeId, scope) {
  if (scope === 'all' || scope === 'replace') return scope;
  return inHome('devices', homeId).some((d) => d.replace === 'yes') ? 'replace' : 'all';
}
const SHOP_SCOPES = [{ value: 'replace', label: 'Only items marked "Needs replacing"' }, { value: 'all', label: 'Everything in this home' }];
function shopSections(s) {
  const outlets = s.items.filter((i) => i.type === 'outlet');
  const switches = s.items.filter((i) => i.type === 'switch');
  const other = s.items.filter((i) => i.type !== 'outlet' && i.type !== 'switch');
  return [
    ['Outlets', outlets],
    ['Switches', switches],
    ['Other items', other],
    ['Boxes needed', s.boxes],
    [`Wall plates (1 per gang · ${s.platesNeeded} total)`, s.plates],
  ].filter(([, list]) => list.length);
}

function renderShop(homeId, scopeQ) {
  const home = byId('homes', homeId);
  const scope = shopScope(homeId, scopeQ);
  const s = shoppingList(inHome('devices', homeId), scope);
  const secs = shopSections(s);
  const body = `
  <div class="section-head"><h2>Shopping list</h2><a class="btn small" href="#/h/${homeId}/print/shop?scope=${scope}">Print</a></div>
  <label class="sr-only" for="shopScope">What to count</label>
  <select id="shopScope" class="full">${opt(SHOP_SCOPES, scope)}</select>
  ${s.count ? `<div class="card summary">
      <div><b>${s.items.filter((i) => i.type === 'outlet').reduce((a, i) => a + i.qty, 0)}</b><span>outlets</span></div>
      <div><b>${s.items.filter((i) => i.type === 'switch').reduce((a, i) => a + i.qty, 0)}</b><span>switches</span></div>
      <div><b>${s.boxesNeeded}</b><span>new boxes</span></div>
    </div>
    ${secs.map(([title, list]) => `<div class="card shop-group"><h3>${esc(title)}</h3><ul class="list">${list.map((i) => `<li class="shop-row"><span class="shop-qty">${i.qty}</span><span class="row-main">${esc(lineText(i).replace(/^\d+ /, ''))}</span></li>`).join('')}</ul></div>`).join('')}
    <p class="tiny muted">Counts come from each item's Style, Quantity, Box and Needs replacing fields. Items with no style set are listed as "style not set". Edit any outlet or switch to fill them in.</p>`
    : `<div class="card empty"><p>${scope === 'replace' ? 'Nothing is marked "Needs replacing" yet.' : 'No outlets or switches yet.'}</p><p class="muted">Open an outlet or switch, tap Edit, and set its Style, Quantity, Box and Needs replacing.</p></div>`}
  <button class="btn full" id="shopCsv">Download spreadsheet (CSV)</button>`;
  app.innerHTML = shell(homeId, 'rooms', body, { title: 'Shopping list', back: `#/h/${homeId}/rooms` });
  bindShell();
  document.getElementById('shopScope').onchange = (e) => go(`#/h/${homeId}/shop?scope=${e.target.value}`);
  document.getElementById('shopCsv').onclick = () => download(`ampmap-shopping-list.csv`, shoppingCsv(inHome('devices', homeId), scope, home.name), 'text/csv');
}

async function renderPrint(homeId, kind, id, q) {
  const home = byId('homes', homeId);
  if (kind === 'setup') return renderSetupPrint(homeId);
  if (kind === 'shop') {
    const scope = shopScope(homeId, q.get('scope'));
    const sl = shoppingList(inHome('devices', homeId), scope);
    const body = `
    <div class="print-controls no-print">
      <label>What to count<select id="shopScopeP">${opt(SHOP_SCOPES, scope)}</select></label>
      <button class="btn primary" id="doPrint">Print / Save as PDF</button>
    </div>
    <div class="sheet shop">
      <h2>Shopping list · ${esc(homeLabel(home))}</h2>
      <div class="dir-foot" style="text-align:left">${scope === 'replace' ? 'Items marked "Needs replacing"' : 'Everything in this home'} · ${new Date().toLocaleDateString()} · AmpMap</div>
      ${sl.count ? shopSections(sl).map(([title, list]) => `<h3>${esc(title)}</h3><table class="shop-table"><tbody>${list.map((i) => `<tr><td class="box"><span></span></td><td class="q">${i.qty}</td><td>${esc(lineText(i).replace(/^\d+ /, ''))}</td></tr>`).join('')}</tbody></table>`).join('') : '<p>Nothing to list.</p>'}
    </div>`;
    app.innerHTML = shell(homeId, 'rooms', body, { title: 'Print shopping list', back: `#/h/${homeId}/shop?scope=${scope}` });
    bindShell();
    document.getElementById('shopScopeP').onchange = (e) => go(`#/h/${homeId}/print/shop?scope=${e.target.value}`);
    document.getElementById('doPrint').onclick = () => window.print();
    return;
  }
  if (kind === 'directory') {
    const panel = byId('panels', id) || inHome('panels', homeId)[0];
    if (!panel) return renderNotFound();
    const size = q.get('size') || 'half';
    const breakers = inHome('breakers', homeId).filter((b) => b.panelId === panel.id);
    const one = layoutOf(panel) === 'one';
    const fuses = panel.fuses || [];
    const anyWire = breakers.some((b) => wireTag(b.wire));
    const showWire = anyWire && q.get('wire') !== '0';
    const showQr = q.get('qr') !== '0';
    const qs2 = (o) => { const p = new URLSearchParams({ size, ...(showWire ? {} : { wire: '0' }), ...(showQr ? {} : { qr: '0' }), ...o }); for (const [k, v] of [...p]) if (v === '' || (k !== 'size' && v === '1')) p.delete(k); return p.toString(); };
    const body = `
    <div class="print-controls no-print">
      <label>Size<select id="dirSize">${opt([{ value: 'half', label: 'Half page (fits most panel doors)' }, { value: 'full', label: 'Full page 8.5 x 11' }], size)}</select></label>
      ${anyWire ? `<label>Wire<select id="dirWire">${opt([{ value: '1', label: 'Show wire (like 12/2)' }, { value: '0', label: 'Hide wire' }], showWire ? '1' : '0')}</select></label>` : ''}
      <label>QR code<select id="dirQr">${opt([{ value: '1', label: 'Show QR (scan to open this panel)' }, { value: '0', label: 'No QR' }], showQr ? '1' : '0')}</select></label>
      ${showQr ? `<p class="tiny muted qr-hint">${home.shareToken ? 'Sharing is on: anyone who scans sees the read-only panel schedule. After changes, tap Update in <a href="#/h/' + homeId + '/more">More › Share</a>.' : 'The QR opens this panel in AmpMap for you. So a customer or the next electrician can see it too, turn on <a href="#/h/' + homeId + '/more">More › Share a read-only copy</a>.'}</p>` : ''}
      <button class="btn primary" id="doPrint">Print / Save as PDF</button>
    </div>
    <div class="sheet directory ${size}">
      <div class="dir-top">
        <div class="dir-head"><div class="dir-title">PANEL SCHEDULE</div><b>${esc(panel.name)}</b> · ${esc(homeLabel(home))}${home.address ? `<br><span class="dir-addr">${esc(home.address)}</span>` : ''}<br><span class="dir-meta">${panel.mainAmps ? `Main ${esc(mainAmpsText(panel))}A` : ''}${panel.type === 'rv' && panel.shorePower ? ` · ${esc(shoreText(panel))} shore` : ''}${sourceText(panel) ? ` · ${esc(sourceText(panel))}` : ''}${panel.location ? ` · ${esc(panel.location)}` : ''} · ${breakers.length} circuits</span></div>
        ${showQr ? '<div class="dir-qr"><div id="dirQrBox"></div><span>Scan for the full map</span></div>' : ''}
      </div>
      <table class="dir-table ${one ? 'one' : ''}"><thead><tr><th>#</th><th>A</th><th>Circuit</th>${one ? '' : '<th>#</th><th>A</th><th>Circuit</th>'}</tr></thead><tbody>${dirRowsHtml(panel, breakers, { wire: showWire })}</tbody></table>
      ${fuses.length ? `<div class="dir-head" style="margin-top:8px"><b>12V DC fuses</b></div><table class="dir-table one"><thead><tr><th>#</th><th>A</th><th>Powers</th></tr></thead><tbody>${fuses.map((f) => `<tr><td class="n">${esc(f.num)}</td><td class="a">${esc(f.amps === 'other' ? f.ampsOther : f.amps)}A</td><td class="l">${esc(f.powers)}${f.notes ? ` <span class="rm">(${esc(f.notes)})</span>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="dir-foot">Updated ${new Date().toLocaleDateString()} · AmpMap</div>
    </div>`;
    app.innerHTML = shell(homeId, 'more', body, { title: 'Panel schedule', back: `#/h/${homeId}/panel/${panel.id}` });
    if (showQr) qrSvg(deepLink(`/p/${panel.id}`)).then((svg) => { const el = document.getElementById('dirQrBox'); if (el) el.innerHTML = svg; });
    bindShell();
    document.getElementById('dirSize').onchange = (e) => go(`#/h/${homeId}/print/directory/${panel.id}?${qs2({ size: e.target.value })}`);
    if (document.getElementById('dirWire')) document.getElementById('dirWire').onchange = (e) => go(`#/h/${homeId}/print/directory/${panel.id}?${qs2({ wire: e.target.value })}`);
    document.getElementById('dirQr').onchange = (e) => go(`#/h/${homeId}/print/directory/${panel.id}?${qs2({ qr: e.target.value })}`);
    document.getElementById('doPrint').onclick = () => window.print();
    return;
  }
  if (kind === 'qr') {
    const tpl = STICKERS[q.get('tpl')] ? q.get('tpl') : '5160';
    const what = q.get('what') || 'all';
    const only = q.get('only');
    let items = [];
    const panels = inHome('panels', homeId), breakers = sortBreakers(inHome('breakers', homeId)), devices = inHome('devices', homeId);
    const add = (type, it) => {
      if (type === 'panel') items.push({ path: `/p/${it.id}`, title: it.name, sub: `${homeLabel(home)}${it.mainAmps ? ' · ' + mainAmpsText(it) + 'A main' : ''}` });
      if (type === 'breaker') items.push({ path: `/b/${it.id}`, title: `Breaker ${slotText(it)} · ${ampsText(it)}${wireTag(it.wire) ? ' · ' + wireTag(it.wire) : ''}`, sub: it.label || '' });
      if (type === 'device') {
        const b = byId('breakers', it.breakerId);
        items.push({ path: `/d/${it.id}`, title: `${it.room || ''} ${it.name ? '- ' + it.name : ''}`.trim(), sub: b ? `Breaker ${slotText(b)} · ${ampsText(b)}` : 'Breaker: ?' });
      }
    };
    if (only) {
      const [t, oid] = only.split(':');
      const col = { panel: 'panels', breaker: 'breakers', device: 'devices' }[t];
      const it = col && byId(col, oid);
      if (it) add(t, it);
    } else {
      if (what === 'all' || what === 'panels') panels.forEach((p) => add('panel', p));
      if (what === 'all' || what === 'breakers') breakers.forEach((b) => add('breaker', b));
      if (what === 'all' || what === 'devices') [...devices].sort((a, b) => (a.room || '').localeCompare(b.room || '')).forEach((d) => add('device', d));
    }
    const copies = Math.max(1, Math.min(STICKERS[tpl].per, parseInt(q.get('copies'), 10) || 1));
    if (only && copies > 1) items = Array.from({ length: copies }, () => items[0]).filter(Boolean);
    const svgs = await Promise.all(items.map((it) => qrSvg(deepLink(it.path))));
    const qs = (k, v) => { const p = new URLSearchParams(q); p.set(k, v); return `#/h/${homeId}/print/qr?${p}`; };
    const pages = [];
    for (let i = 0; i < items.length; i += STICKERS[tpl].per) pages.push(items.slice(i, i + STICKERS[tpl].per).map((it, j) => `<div class="sticker"><div class="sq">${svgs[i + j]}</div><div class="st-text"><b>${esc(it.title)}</b><span>${esc(it.sub)}</span></div></div>`).join(''));
    const body = `
    <div class="print-controls no-print">
      <label>Sticker paper<select id="tpl">${opt(Object.entries(STICKERS).map(([v, s]) => ({ value: v, label: s.label })), tpl)}</select></label>
      ${only ? `<label>Copies<select id="copies">${opt(['1', '2', '3', '4', '6', '8', '12'], String(copies))}</select></label><a class="btn small ghost" href="#/h/${homeId}/print/qr">Show all items instead</a>`
        : `<label>What to print<select id="what">${opt([{ value: 'all', label: 'Everything' }, { value: 'devices', label: 'Outlets, lights & devices' }, { value: 'breakers', label: 'Breakers' }, { value: 'panels', label: 'Panels' }], what)}</select></label>`}
      <p class="tiny muted">${items.length} sticker${items.length === 1 ? '' : 's'}. In the print dialog set Scale to 100% (Actual size) and Margins to None. Print one sheet on plain paper first and hold it up to the sticker sheet to check alignment.</p>
      <button class="btn primary" id="doPrint">Print / Save as PDF</button>
    </div>
    ${pages.map((p) => `<div class="sticker-sheet ${STICKERS[tpl].cls}">${p}</div>`).join('') || '<div class="card empty no-print"><p>Nothing to print yet.</p></div>'}`;
    app.innerHTML = shell(homeId, 'more', body, { title: 'QR stickers', back: `#/h/${homeId}/more` });
    bindShell();
    document.getElementById('tpl').onchange = (e) => go(qs('tpl', e.target.value));
    if (document.getElementById('what')) document.getElementById('what').onchange = (e) => go(qs('what', e.target.value));
    if (document.getElementById('copies')) document.getElementById('copies').onchange = (e) => go(qs('copies', e.target.value));
    document.getElementById('doPrint').onclick = () => window.print();
    return;
  }
  return renderNotFound();
}

// ---------------------------------------------------------------- edit forms
function roomSelect(homeId, current) {
  const home = byId('homes', homeId) || {};
  const rvHome = home.type === 'rv' || inHome('panels', homeId).some((p) => p.type === 'rv');
  const existing = [...new Set([...inHome('devices', homeId).map((d) => d.room), ...inHome('breakers', homeId).flatMap((b) => b.rooms || [])].filter(Boolean))];
  const presets = (rvHome ? RV_ROOMS : HOME_ROOMS).filter((r) => !existing.includes(r));
  const all = [...existing.sort(), ...presets];
  const cur = current || '';
  const known = !cur || all.includes(cur);
  const sel = cur || (all[0] || '__new');
  return `<label>Room / area<select name="room">${all.map((r) => `<option ${r === sel ? 'selected' : ''}>${esc(r)}</option>`).join('')}${!known ? `<option selected>${esc(cur)}</option>` : ''}<option value="__new" ${sel === '__new' ? 'selected' : ''}>+ New room...</option></select></label>
  <label hidden>New room name<input name="roomNew" placeholder="e.g. Sunroom"></label>`;
}

function renderEdit(col, id, q) {
  const isNew = id === 'new';
  const homeId = q.get('home') || currentHomeId();
  const existing = isNew ? null : byId(col, id);
  if (!isNew && !existing) return renderNotFound();
  const rooms = [...new Set([...D().devices.map((d) => d.room), ...D().breakers.flatMap((b) => b.rooms || [])].filter(Boolean))].sort();
  const roomList = `<datalist id="roomList">${rooms.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>`;
  let fields = '', title = '', back = homeId ? `#/h/${homeId}/panel` : '#/';
  let photo = false;

  if (col === 'homes') {
    const h = existing || { name: '', type: q.get('type') || 'house', address: '', notes: '', customerId: q.get('customer') || '' };
    title = isNew ? (h.customerId ? 'Add a property' : 'Add a home') : 'Edit home';
    back = isNew ? (h.customerId ? `#/customers/${h.customerId}` : '#/') : `#/h/${id}/more`;
    const customers = D().customers;
    fields = `
      <label>Name<input name="name" required value="${esc(h.name)}" placeholder="e.g. My house, Rental on 5th, Camper"></label>
      <label>Type<select name="type">${opt(HOME_TYPES, h.type || 'house')}</select></label>
      ${isPro() || h.customerId ? `<label>Customer<select name="customerId"><option value="">None (my own)</option>${customers.map((c) => `<option value="${esc(c.id)}" ${c.id === h.customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
      <label>Address (optional)<input name="address" value="${esc(h.address)}"></label>
      ${isNew ? `<fieldset class="pick-cards start-pick"><legend>How do you want to start?</legend>
        <label class="pick-card"><input type="radio" name="start" value="panel" checked><span class="sp-ic" aria-hidden="true">⚡</span><span><b>Panel only</b><span class="muted tiny block">Fastest. Just the breakers: what each one feeds, amps and wire. Print the schedule for the panel door.</span></span></label>
        <label class="pick-card"><input type="radio" name="start" value="full"><span class="sp-ic" aria-hidden="true">🏠</span><span><b>Panel + rooms</b><span class="muted tiny block">Also map outlets and lights room by room. You can add rooms any time later.</span></span></label>
      </fieldset>` : ''}
      <label>Notes<textarea name="notes" rows="3">${esc(h.notes)}</textarea></label>`;
  } else if (col === 'panels') {
    const home = byId('homes', homeId) || {};
    const firstType = home.type === 'rv' ? 'rv' : inHome('panels', homeId).length ? 'sub' : 'main';
    const com = home.type === 'commercial';
    const nPanels = inHome('panels', homeId).length;
    const p = existing || (com
      ? { name: nPanels ? `LP-${nPanels}` : 'MDP', type: firstType, layout: 'auto', mainAmps: nPanels ? '225' : '800', service: nPanels ? '3ph208' : '3ph480', spaces: '42', location: '', notes: '', ...(q.get('fedFrom') ? { fedFrom: q.get('fedFrom') } : {}) }
      : { name: firstType === 'rv' ? 'RV distribution center' : firstType === 'sub' ? 'Sub-panel' : 'Main panel', type: firstType, layout: 'auto', mainAmps: firstType === 'rv' ? '30' : '200', shorePower: '30', spaces: firstType === 'rv' ? '6' : '20', location: '', notes: '' });
    const ampList = (pp) => { const l = mainAmpChoices(home, pp); const cur = pp.mainAmps; return cur && cur !== 'other' && !l.includes(cur) ? [...l.filter((x) => x !== 'other'), cur].sort((a, b) => a - b).concat('other') : l; };
    const otherPanels = inHome('panels', homeId).filter((x) => x.id !== (existing && existing.id));
    const feedBrks = (pid) => sortBreakers(inHome('breakers', homeId).filter((b) => b.panelId === pid && b.kind !== 'spare'));
    const showSvc = isCommercial(home, p);
    const svcHtml = `<div class="svc-field"><span class="field-name">Service type</span>${chipsHtml('service', SERVICE_TYPES.map((s) => ({ value: s.value, label: s.label })), serviceOf(p).value, { label: 'Service type', cls: 'stack' })}<p class="tiny muted svc-hint">${esc(serviceOf(p).hint)}</p></div>`;
    title = isNew ? 'Add a panel' : 'Edit panel';
    back = isNew ? `#/h/${homeId}/panel` : `#/h/${homeId}/panel/${id}`;
    photo = !isNew;
    const rv = p.type === 'rv';
    fields = `
      <label>Panel name<input name="name" required value="${esc(p.name)}"></label>
      <label>Panel type<select name="type">${opt(PANEL_TYPES, p.type)}</select></label>
      <label class="rv-only" ${rv ? '' : 'hidden'}>Shore power<select name="shorePower" data-other="shorePowerOther">${opt(SHORE_POWER_OPTIONS, p.shorePower || '30')}</select></label>
      <label class="other-field" ${rv && p.shorePower === 'other' ? '' : 'hidden'}>Shore power amps (other)<input name="shorePowerOther" type="number" inputmode="numeric" value="${esc(p.shorePowerOther || '')}"></label>
      <div class="two">
        <label>Main breaker amps<select name="mainAmps" data-other="mainAmpsOther">${opt(rv ? RV_MAIN_AMP_OPTIONS : ampList(p), p.mainAmps)}</select></label>
        <label>Breaker spaces<select name="spaces" data-other="spacesOther">${opt(SPACE_OPTIONS, p.spaces)}</select></label>
      </div>
      <label class="other-field" ${p.mainAmps === 'other' ? '' : 'hidden'}>Main amps (other)<input name="mainAmpsOther" type="number" inputmode="numeric" value="${esc(p.mainAmpsOther || '')}"></label>
      <label class="other-field" ${p.spaces === 'other' ? '' : 'hidden'}>Number of spaces<input name="spacesOther" type="number" inputmode="numeric" min="1" max="84" value="${esc(p.spacesOther || '')}"></label>
      ${showSvc && !rv ? svcHtml : ''}
      <fieldset class="pick-cards num-pick" id="numbering"><legend>How is your panel numbered?</legend>
        ${[
          { v: 'space', t: '1 number per breaker', d: 'Left side 1, 3, 5… right side 2, 4, 6… (most panels)', pic: '<i>1</i><i>3</i><i>5</i>' },
          { v: 'half', t: '2 numbers per row (tandem-ready)', d: 'The sticker says 1/3, 5/7 on the left and 2/4, 6/8 on the right', pic: '<i>1/3</i><i>5/7</i><i>9/11</i>' },
        ].map((o) => `<label class="pick-card"><input type="radio" name="numbering" value="${o.v}" ${numberingOf(p) === o.v ? 'checked' : ''}><span class="pc-pic num-pic ${o.v}" aria-hidden="true">${o.pic}</span><span class="pc-text"><b>${o.t}</b><small>${o.d}</small></span></label>`).join('')}
      </fieldset>
      <p class="tiny muted num-help">Look at the number strip next to the breakers. With 2 numbers per row, set Breaker spaces to the highest number on the sticker (like 32 or 40). Breakers keep their numbers if you switch: a double-pole at 5 then covers 5–11.</p>
      <label>Where is it?<input name="location" value="${esc(p.location)}" placeholder="${rv ? 'e.g. Under the bed' : 'e.g. Garage, north wall'}"></label>
      <label>Notes<textarea name="notes" rows="3">${esc(p.notes)}</textarea></label>
      ${rv ? '<p class="tiny muted">12V DC fuses are added on the panel screen after saving.</p>' : ''}
      <details class="more-details" id="more" ${q.get('more') || location.hash.endsWith('#more') ? 'open' : ''}><summary><b>More details</b><span class="muted tiny">${rv ? 'layout' : 'Generator, surge protector, grounding, what feeds it…'}</span></summary>
        <div class="home-only" ${rv ? 'hidden' : ''}>
        ${showSvc ? '' : svcHtml}
        ${otherPanels.length ? `<label>Fed from<select name="fedFrom"><option value="">Not fed from another panel (it's the main)</option>${otherPanels.map((x) => `<option value="${esc(x.id)}" ${x.id === p.fedFrom ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label class="fed-brk" ${p.fedFrom ? '' : 'hidden'}>Which breaker feeds it<select name="fedBreaker"><option value="">Not sure</option>${(p.fedFrom ? feedBrks(p.fedFrom) : []).map((b) => `<option value="${esc(b.id)}" ${b.id === p.fedBreaker ? 'selected' : ''}>${esc(slotLabel(b, byId('panels', p.fedFrom)))} · ${esc(ampsText(b))} · ${esc(b.label || '')}</option>`).join('')}</select></label>
        <div class="fed-wire" ${p.fedFrom ? '' : 'hidden'}><span class="field-name">Feeder wire</span>${chipsHtml('feeder', FEEDER_SIZES, p.feeder || '')}<label class="other-field" ${p.feeder === 'other' ? '' : 'hidden'}>Feeder (type it)<input name="feederOther" value="${esc(p.feederOther || '')}" placeholder="e.g. 2 sets 350 kcmil AL"></label></div>` : ''}
        <span class="field-name" id="genHook">Generator hookup</span>${chipsHtml('genHookup', GEN_HOOKUPS.map((g) => ({ value: g.value, label: g.short === 'None' ? 'None' : g.short })), p.genHookup || '', { cls: 'stack' })}
        <div class="gen-more" ${hasGenerator(p) ? '' : 'hidden'}>
          <span class="field-name">Generator size</span>${chipsHtml('genSize', GEN_SIZES, p.genSize || '')}
          <label class="other-field" ${p.genSize === 'other' ? '' : 'hidden'}>Size (type it)<input name="genSizeOther" value="${esc(p.genSizeOther || '')}" placeholder="e.g. 48 kW"></label>
          <span class="field-name">Where you plug it in (inlet)</span>${chipsHtml('genInlet', GEN_INLETS, p.genInlet || '')}
        </div>
        <span class="field-name">Whole-home surge protector</span>${chipsHtml('spd', YES_NO, p.spd || '')}
        <span class="field-name">Ground rod</span>${chipsHtml('groundRod', GROUND_RODS, p.groundRod || '')}
        <span class="field-name">Water pipe bonded to ground</span>${chipsHtml('waterBond', YES_NO, p.waterBond || '')}
        <label>Grounding notes<input name="groundNotes" value="${esc(p.groundNotes || '')}" placeholder="optional"></label>
        <label>Power comes from<select name="powerSource">${opt(POWER_SOURCE_OPTIONS, p.powerSource || '')}</select></label>
        <label class="src-main" ${!rv && ['pole','pedestal','house_meter'].includes(p.powerSource) ? '' : 'hidden'}>Main breaker at the pole / meter (amps)<select name="sourceAmps" data-other="sourceAmpsOther">${opt(MAIN_AMP_OPTIONS, p.sourceAmps || '200')}</select></label>
        <label class="other-field" ${!rv && ['pole','pedestal','house_meter'].includes(p.powerSource) && p.sourceAmps === 'other' ? '' : 'hidden'}>Pole / meter main amps (type it)<input name="sourceAmpsOther" type="number" inputmode="numeric" value="${esc(p.sourceAmpsOther || '')}"></label>
        </div>
        <label>Layout<select name="layout">${opt(LAYOUT_OPTIONS, p.layout || 'auto')}</select></label>
      </details>`;
  } else if (col === 'breakers') {
    const panels = inHome('panels', homeId);
    const qType = ['single', 'double', 'triple', 'tandem', 'quad'].includes(q.get('btype')) ? q.get('btype') : '';
    const b = existing || { panelId: q.get('panel') || (panels[0] && panels[0].id), slot: q.get('slot') || '', poles: '1', amps: '20', label: '', rooms: [], kind: 'standard', notes: '', loads: [], ...(qType === 'tandem' || qType === 'quad' ? { size: 'half', btype: qType, half: q.get('half') === 'B' ? 'B' : 'A' } : qType === 'triple' ? { btype: 'triple', poles: '3', amps: '30' } : {}) };
    const bt = breakerType(b);
    const bPanel = byId('panels', b.panelId);
    const bHome = byId('homes', homeId) || {};
    const ampChoices = isCommercial(bHome, bPanel) ? COMMERCIAL_AMPS : AMP_OPTIONS;
    // adding into one empty half, or editing a half that already has its partner: no partner fields
    const lonelyHalf = (isNew && !!q.get('half')) || (!isNew && !!b.groupId);
    const mateAmps = AMP_OPTIONS.filter((a) => a !== 'other');
    title = isNew ? 'Add a breaker' : `Edit breaker ${slotText(b)}`;
    back = isNew ? `#/h/${homeId}/panel/${b.panelId || ''}` : `#/h/${homeId}/breaker/${id}`;
    fields = `
      ${panels.length > 1 ? `<label>Panel<select name="panelId">${opt(panels.map((p) => ({ value: p.id, label: p.name })), b.panelId)}</select></label>` : `<input type="hidden" name="panelId" value="${esc(b.panelId)}">`}
      <fieldset class="pick-cards type-pick"><legend>Breaker type</legend>
        ${BTYPE_PICKS.map((o) => `<label class="pick-card ${o.v === 'triple' ? 'tri-only' : ''}" ${o.v === 'triple' && !isThreePhase(bPanel) ? 'hidden' : ''}><input type="radio" name="btype" value="${o.v}" ${bt === o.v ? 'checked' : ''}><span class="pc-pic br-pic ${o.v}" aria-hidden="true">${o.pic}</span><span class="pc-text"><b>${o.t}</b><small>${o.d}</small></span></label>`).join('')}
      </fieldset>
      <label class="half-pick" hidden>Which half of the space<select name="half">${opt([{ value: 'A', label: 'Top half' }, { value: 'B', label: 'Bottom half' }], b.half === 'B' ? 'B' : 'A')}</select></label>
      <div class="two">
        <label><span class="slot-name">Space / slot #</span><input name="slot" required type="number" inputmode="numeric" min="1" max="84" value="${esc(b.slot)}"></label>
        <label>Amps<select name="amps" data-other="ampsOther">${opt(ampChoices.includes(b.amps) ? ampChoices : [b.amps, ...ampChoices], b.amps)}</select></label>
      </div>
      <label class="other-field" ${b.amps === 'other' ? '' : 'hidden'}>Amps (other)<input name="ampsOther" type="number" inputmode="numeric" value="${esc(b.ampsOther || '')}"></label>
      ${(() => { const pn = byId('panels', b.panelId); return pn && pn.type === 'rv' && (pn.shorePower === '50' || pn.shorePower === 'pole') ? `<label>Leg (${pn.shorePower === 'pole' ? '240V service' : '50A service'})<select name="leg">${opt(LEG_OPTIONS, b.leg || '')}</select></label>` : ''; })()}
      <div class="covers" aria-live="polite"><span class="covers-text"></span><span class="covers-clash"></span></div>
      <p class="tiny muted slot-hint"></p>
      <label>Label<input name="label" value="${esc(b.label)}" placeholder="e.g. Kitchen counter outlets"></label>
      <label>Room(s) it serves<input name="rooms" list="roomList" value="${esc((b.rooms || []).join(', '))}" placeholder="Separate with commas"></label>
      <div class="mate-fields" ${lonelyHalf ? 'data-lonely="1"' : ''} hidden>
        <p class="tiny muted mate-hint"></p>
        ${[1, 2].map((k) => `<div class="mate" data-k="${k}"><div class="mate-title"></div><div class="two"><label>Label<input name="m${k}label" placeholder="e.g. Bedroom 2"></label><label>Amps<select name="m${k}amps">${opt(mateAmps, k === 2 ? '15' : '20')}</select></label></div></div>`).join('')}
      </div>
      <span class="field-name">Protection</span>${chipsHtml('kind', BREAKER_KINDS.filter((k) => k.value !== 'gfpe' || isCommercial(bHome, bPanel) || b.kind === 'gfpe').map((k) => ({ value: k.value, label: k.label.replace(' breaker', '') })), b.kind || 'standard', { label: 'Protection' })}
      <details class="more-details" ${q.get('focus') === 'wire' || q.get('more') ? 'open' : ''}><summary><b>More details</b><span class="muted tiny">Wire, ${isThreePhase(bPanel) ? 'phase, ' : ''}notes</span></summary>
        <div class="phase-field" ${isThreePhase(bPanel) ? '' : 'hidden'}><span class="field-name">Phase</span><p class="tiny muted phase-auto"></p>
          <label>Change it (only if the panel is wired differently)<select name="phase"><option value="">Automatic (from the space)</option>${['A', 'B', 'C', 'AB', 'BC', 'AC', 'ABC'].map((x) => `<option value="${x}" ${String(b.phase || '') === x ? 'selected' : ''}>${x.split('').join(' + ')}</option>`).join('')}</select></label></div>
        ${wireFieldsHtml(b.wire, { legend: 'Wire on this circuit', hint: 'What feeds this breaker. Outlets on it use this wire unless you set a different one on the outlet.' })}
        <label>Notes<textarea name="notes" rows="3">${esc(b.notes)}</textarea></label>
      </details>`;
  } else if (col === 'devices') {
    const brks = sortBreakers(inHome('breakers', homeId));
    const qt = DEVICE_TYPES.some((t) => t.value === q.get('type')) ? q.get('type') : '';
    const d = existing || { type: qt || 'outlet', name: '', room: q.get('room') || '', location: '', breakerId: q.get('breaker') || '', gfci: 'unknown', afci: 'unknown', status: 'working', notes: '', readings: [] };
    title = isNew ? 'Add something' : `Edit ${d.name || 'item'}`;
    back = isNew ? (d.breakerId ? `#/h/${homeId}/breaker/${d.breakerId}` : `#/h/${homeId}/rooms`) : `#/h/${homeId}/device/${id}`;
    const typeChip = (t) => `<label class="tchip"><input type="radio" name="type" value="${t.value}" ${d.type === t.value ? 'checked' : ''}><span><i aria-hidden="true">${t.icon}</i>${esc(t.label)}</span></label>`;
    const common = DEVICE_TYPES.filter((t) => t.group === 'common');
    const moreOpen = !common.some((t) => t.value === d.type);
    fields = `
      <fieldset class="type-chips"><legend>What is it?</legend>
        <div class="tchips">${common.map(typeChip).join('')}</div>
        <details class="more-types" ${moreOpen ? 'open' : ''}><summary>More types <span class="muted tiny">smoke/CO, EV charger, AC, water heater, well pump, solar…</span></summary>
          ${DEVICE_GROUPS.filter((g) => g.value !== 'common').map((g) => `<p class="tchip-group">${esc(g.label)}</p><div class="tchips">${DEVICE_TYPES.filter((t) => t.group === g.value).map(typeChip).join('')}</div>`).join('')}
        </details>
      </fieldset>
      <div class="style-field" ${stylesFor(d.type) ? '' : 'hidden'}><span class="field-name">Kind <span class="muted">(optional)</span></span><div class="style-chips">${chipsHtml('style', (stylesFor(d.type) || []).filter((x) => x.value), d.style || '')}</div></div>
      <p class="tiny muted type-hint">${esc(defaultsHint(d.type, d.style))}</p>
      <label>Name (optional)<input name="name" value="${esc(d.name)}" placeholder="e.g. Outlet by bed, Vanity light"></label>
      ${roomSelect(homeId, d.room)}
      <label>Breaker<select name="breakerId"><option value="">Not mapped yet</option>${brks.map((b) => `<option value="${b.id}" ${b.id === d.breakerId ? 'selected' : ''}>${esc(brks.some((o) => o.panelId !== b.panelId) ? ((byId('panels', b.panelId) || {}).name || '') + ' ' : '')}#${esc(slotText(b))} · ${esc(ampsText(b))} · ${esc(b.label || '')}</option>`).join('')}</select></label>
      <details class="more-details" ${q.get('focus') === 'wire' || q.get('more') ? 'open' : ''}><summary><b>More details</b><span class="muted tiny">Where in the room, how many, GFCI/AFCI, wire, status, notes</span></summary>
      <label>Location in the room<input name="location" value="${esc(d.location)}" placeholder="e.g. North wall by bed"></label>
      <label>Quantity<input name="qty" type="number" inputmode="numeric" min="1" step="1" value="${esc(String(qtyOf(d)))}"></label>
      <p class="tiny muted field-hint">One entry can stand for several, like "7 outlets, master bedroom".</p>
      <label>Box<select name="box">${opt(BOX_OPTIONS, d.box || '')}</select></label>
      <label>Needs replacing<select name="replace">${opt(REPLACE_OPTIONS, d.replace || '')}</select></label>
      <label>GFCI protection<select name="gfci">${opt(GFCI_OPTIONS, d.gfci)}</select></label>
      <label>AFCI protection<select name="afci">${opt(AFCI_OPTIONS, d.afci)}</select></label>
      ${(() => {
        const own = cleanWire(d.wire);
        const bw = cleanWire((byId('breakers', d.breakerId) || {}).wire);
        const top = `<input type="hidden" name="wmode" value="${own ? 'own' : 'same'}">
        <p class="wire-inherit" id="wireInherit"></p>
        <label class="check-line" id="wireAllWrap" hidden><input type="checkbox" name="wall" value="1" checked> <span>Use for the whole breaker <span class="muted" id="wireAllB"></span></span></label>`;
        return wireFieldsHtml(own || bw, { legend: 'Wire to this ' + (d.type === 'outlet' || !d.type ? 'outlet' : 'item'), top });
      })()}
      <label>Status<select name="status">${opt(STATUS_OPTIONS, d.status)}</select></label>
      <label>Notes<textarea name="notes" rows="4" placeholder="Anything useful: wiring, what it controls, fixes...">${esc(d.notes)}</textarea></label>
      </details>`;
  } else if (col === 'customers') {
    const c = existing || { name: '', phone: '', email: '', notes: '' };
    title = isNew ? 'New customer' : 'Edit customer';
    back = isNew ? '#/customers' : `#/customers/${id}`;
    fields = `
      <label>Name<input name="name" required value="${esc(c.name)}" autocomplete="off"></label>
      <label>Phone<input name="phone" type="tel" inputmode="tel" value="${esc(c.phone)}"></label>
      <label>Email<input name="email" type="email" inputmode="email" value="${esc(c.email)}"></label>
      <label>Notes<textarea name="notes" rows="4" placeholder="Gate code, pets, preferred contact...">${esc(c.notes)}</textarea></label>`;
  } else return renderNotFound();

  const body = `
  <form id="editForm" class="card form">${fields}${roomList}
    <div class="row-actions"><button class="btn primary" type="submit">Save</button><a class="btn ghost" href="${back}">Cancel</a></div>
  </form>
  ${photo ? `<div class="card"><h3>Panel photo (optional)</h3><div id="photoBox" class="muted">${existing.photoId ? 'Loading...' : 'No photo.'}</div><label class="btn small file-btn">${existing.photoId ? 'Replace photo' : 'Add photo'}<input type="file" accept="image/*" id="photoIn" hidden></label>${existing.photoId ? '<button class="btn small ghost" id="photoDel">Remove photo</button>' : ''}</div>` : ''}
  ${!isNew ? `<button class="btn danger full" id="delBtn">Delete ${col === 'customers' ? 'customer (their properties stay, unlinked)' : col === 'homes' ? 'home and everything in it' : col === 'panels' ? 'panel and its breakers' : col === 'breakers' ? 'breaker' : 'item'}</button>` : ''}`;
  app.innerHTML = shell(homeId, '', body, { title, back });
  bindShell();
  const f = document.getElementById('editForm');
  bindChipClear(f);
  f.querySelectorAll('select[data-other]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const lab = f.querySelector(`[name=${sel.dataset.other}]`).closest('label');
      lab.hidden = sel.value !== 'other' || !!sel.closest('label[hidden]');
    });
  });
  if (col === 'panels') {
    const t = f.elements.type;
    const syncSrc = () => {
      const show = t.value !== 'rv' && ['pole', 'pedestal', 'house_meter'].includes(f.elements.powerSource.value);
      f.querySelector('.src-main').hidden = !show;
      f.elements.sourceAmpsOther.closest('label').hidden = !show || f.elements.sourceAmps.value !== 'other';
    };
    f.elements.powerSource.addEventListener('change', syncSrc);
    t.addEventListener('change', () => {
      const rv = t.value === 'rv';
      f.querySelectorAll('.rv-only').forEach((el) => (el.hidden = !rv));
      f.querySelectorAll('.home-only').forEach((el) => (el.hidden = rv));
      syncSrc();
      f.elements.shorePowerOther.closest('label').hidden = !rv || f.elements.shorePower.value !== 'other';
      syncAmps();
      if (rv && f.elements.spaces.value === '20' && isNew) f.elements.spaces.value = '6';
    });
    // commercial sizes (up to 4000A) once it's a commercial building, three-phase or over 400A
    const home = byId('homes', homeId) || {};
    const svcVal = () => (f.elements.service ? f.elements.service.value : '');
    const syncAmps = () => {
      const rv = t.value === 'rv';
      const cur = f.elements.mainAmps.value;
      const list = rv ? RV_MAIN_AMP_OPTIONS : mainAmpChoices(home, { service: svcVal(), mainAmps: cur, mainAmpsOther: f.elements.mainAmpsOther.value });
      f.elements.mainAmps.innerHTML = opt(list, list.includes(cur) ? cur : rv ? '30' : '200');
    };
    f.querySelectorAll('input[name=service]').forEach((r) => r.addEventListener('change', () => {
      syncAmps();
      const h = f.querySelector('.svc-hint');
      if (h) h.textContent = serviceOf({ service: svcVal() }).hint;
    }));
    const showIf = (sel, on) => { const el = f.querySelector(sel); if (el) el.hidden = !on; };
    const radios = (name, fn) => f.querySelectorAll(`input[name=${name}]`).forEach((r) => r.addEventListener('change', fn));
    radios('genHookup', () => showIf('.gen-more', !['', 'none'].includes(f.elements.genHookup.value)));
    radios('genSize', () => (f.elements.genSizeOther.closest('label').hidden = f.elements.genSize.value !== 'other'));
    radios('feeder', () => (f.elements.feederOther.closest('label').hidden = f.elements.feeder.value !== 'other'));
    if (f.elements.fedFrom) f.elements.fedFrom.addEventListener('change', () => {
      const pid = f.elements.fedFrom.value;
      showIf('.fed-brk', !!pid);
      showIf('.fed-wire', !!pid);
      const fp = byId('panels', pid);
      f.elements.fedBreaker.innerHTML = '<option value="">Not sure</option>' + sortBreakers(inHome('breakers', homeId).filter((b) => b.panelId === pid && b.kind !== 'spare')).map((b) => `<option value="${esc(b.id)}">${esc(slotLabel(b, fp))} · ${esc(ampsText(b))} · ${esc(b.label || '')}</option>`).join('');
    });
  }
  if (col === 'breakers') {
    const typeOf = () => (f.querySelector('input[name="btype"]:checked') || {}).value || 'single';
    const box = f.querySelector('.mate-fields');
    const sync = () => {
      const t = typeOf();
      const pn = byId('panels', f.elements.panelId.value);
      const P = pn || 'two';
      const halfNum = numberingOf(pn) === 'half';
      const isGroup = t === 'tandem' || t === 'quad';
      const lonely = !!box.dataset.lonely && isGroup;
      f.querySelector('.half-pick').hidden = !(lonely && !halfNum);
      box.hidden = !isGroup || lonely;
      f.querySelectorAll('.pick-card input[name="btype"]').forEach((r) => r.closest('.pick-card').classList.toggle('on', r.checked));
      // what it covers + overlap check, live
      const typed = f.elements.slot.value;
      const bp = breakerPlan({ t, slot: typed || '1', pn, isNew, q, base: existing || {}, half: f.elements.half.value });
      const cov = f.querySelector('.covers');
      const lab = (p) => slotLabel(p, P);
      let txt = '';
      if (typed) {
        txt = bp.makeGroup || !isGroup ? coversText(t, typed, P) : `${lab(bp.pos)} · 1 circuit (one switch of this ${t === 'quad' ? 'quad' : 'tandem'})`;
        const snapped = String(bp.pos.slot) !== String(parseInt(typed, 10));
        if (snapped) txt += ` · starts at ${bp.pos.slot}, the top of that row`;
      }
      cov.querySelector('.covers-text').textContent = txt;
      const clash = typed ? findClash(bp.all, othersOnPanel(f.elements.panelId.value, existing, !(bp.isGroup && !bp.makeGroup)), P) : null;
      cov.querySelector('.covers-clash').textContent = clash ? `⚠️ ${clashText(clash, P)}` : '';
      cov.classList.toggle('bad', !!clash);
      cov.hidden = !txt;
      {
        const three = isThreePhase(pn);
        f.querySelectorAll('.tri-only').forEach((el) => (el.hidden = !three));
        const pf = f.querySelector('.phase-field');
        if (pf) {
          pf.hidden = !three;
          const auto = three && typed ? breakerPhases({ ...bp.pos, phase: '' }, pn) : [];
          pf.querySelector('.phase-auto').textContent = auto.length ? `Automatic: ${auto.join(' + ')} (from where it sits in the panel)` : 'Set from the space number automatically.';
        }
      }
      f.querySelector('.slot-name').textContent = halfNum ? (t === 'single' || t === 'double' || bp.makeGroup ? 'Top number on the sticker' : 'Number on the sticker') : 'Space / slot #';
      f.querySelector('.slot-hint').textContent = halfNum
        ? 'This panel is numbered 2 per row (1/3, 5/7 on the left; 2/4, 6/8 on the right). Type the top number of the row; AmpMap fills in the rest.'
        : layoutOf(pn) === 'one'
          ? 'This panel is stacked in one column: a double-pole breaker in space 1 also covers space 2.'
          : 'Numbered like most US panels: odd on the left, even on the right. A double-pole in space 1 also covers 3. Sticker says 1/3, 5/7? Edit the panel and pick "2 numbers per row".';
      const mainLabel = f.elements.label.closest('label');
      if (!mainLabel.dataset.text) mainLabel.dataset.text = mainLabel.firstChild.textContent;
      mainLabel.firstChild.textContent = mainLabel.dataset.text;
      if (box.hidden) return;
      const plan = bp.plan.length ? bp.plan : groupPlan(t, typed || '1', P);
      const role = (p) => (t === 'tandem' ? p.role.replace('half', 'switch') : p.role);
      box.querySelector('.mate-hint').textContent = t === 'tandem' ? 'One breaker with 2 switches. Each switch is its own circuit with its own name:' : 'Each part is its own circuit with its own name:';
      box.querySelectorAll('.mate').forEach((el) => {
        const p = plan[Number(el.dataset.k)];
        el.hidden = !p;
        if (p) el.querySelector('.mate-title').textContent = `${role(p)} · ${lab(p)}`;
      });
      mainLabel.firstChild.textContent = `Label (${role(plan[0]).toLowerCase()} · ${lab(plan[0])})`;
    };
    f.querySelectorAll('input[name="btype"]').forEach((r) => r.addEventListener('change', () => {
      // new double-pole: start at 30A (dryer / water heater size) unless amps were picked
      if (isNew && !f.elements.amps.dataset.touched) f.elements.amps.value = typeOf() === 'double' ? '30' : '20';
      sync();
    }));
    f.elements.amps.addEventListener('change', () => (f.elements.amps.dataset.touched = '1'));
    f.elements.slot.addEventListener('input', sync);
    f.elements.half.addEventListener('change', sync);
    if (f.elements.panelId.tagName === 'SELECT') f.elements.panelId.addEventListener('change', sync);
    sync();
  }
  if (col === 'breakers') {
    const ampsNow = () => breakerAmps({ amps: f.elements.amps.value, ampsOther: f.elements.ampsOther ? f.elements.ampsOther.value : '' });
    const upd = bindWireFields(f, ampsNow);
    f.elements.amps.addEventListener('change', upd);
    if (f.elements.ampsOther) f.elements.ampsOther.addEventListener('input', upd);
    
  }
  if (col === 'devices') {
    const brkNow = () => byId('breakers', f.elements.breakerId.value);
    const upd = bindWireFields(f, () => breakerAmps(brkNow()));
    const inh = document.getElementById('wireInherit');
    const allWrap = document.getElementById('wireAllWrap');
    const W_NAMES = ['size', 'sizeOther', 'type', 'typeOther', 'cond', 'condOther', 'color', 'note'];
    const formWire = () => wireFromForm(Object.fromEntries(new FormData(f).entries()));
    const same = (a, b) => JSON.stringify(cleanWire(a)) === JSON.stringify(cleanWire(b));
    const fill = (w) => {
      w = cleanWire(w) || {};
      for (const k of W_NAMES) if (f.elements['w' + k]) f.elements['w' + k].value = w[k] || '';
      f.querySelectorAll('select[data-other^=w]').forEach((s) => { f.querySelector(`[name=${s.dataset.other}]`).closest('label').hidden = s.value !== 'other'; });
    };
    // The picker shows the breaker's wire until you change it; a change = this outlet's own wire.
    const status = () => {
      const b = brkNow();
      const bw = b && cleanWire(b.wire);
      const fw = formWire();
      const own = !!fw && !same(fw, bw);
      f.elements.wmode.value = own ? 'own' : 'same';
      allWrap.hidden = !(b && !bw && fw);
      document.getElementById('wireAllB').textContent = b ? `#${slotText(b)}` : '';
      if (!b) inh.innerHTML = fw ? '<b>Set on this one.</b> Pick its breaker above to compare.' : 'Optional. Pick the size if you know it.';
      else if (!fw) inh.innerHTML = `Optional. Breaker #${esc(slotText(b))} has no wire yet. Pick it here and it can fill in the whole breaker.`;
      else if (!own) inh.innerHTML = `<span class="pill gray">Same as breaker #${esc(slotText(b))}</span> <span class="muted tiny">Change it if this one is different.</span>`;
      else inh.innerHTML = bw ? `<span class="pill wire">Different from breaker #${esc(slotText(b))}</span> <button type="button" class="linkish" id="wireReset">Use breaker's wire (${esc(wireTag(bw) || wireShort(bw))})</button>` : `<span class="pill wire">Set here</span>`;
      const rs = document.getElementById('wireReset');
      if (rs) rs.onclick = () => { fill(brkNow().wire); status(); upd(); };
    };
    let lastB = f.elements.breakerId.value;
    f.elements.breakerId.addEventListener('change', () => {
      const prev = byId('breakers', lastB);
      lastB = f.elements.breakerId.value;
      // still showing the old breaker's wire (not changed by hand): follow the new breaker
      if (!formWire() || (prev && same(formWire(), prev.wire))) fill((brkNow() || {}).wire);
      status(); upd();
    });
    f.querySelectorAll('[name^=w]').forEach((el) => { if (el.name !== 'wmode' && el.name !== 'wall') { el.addEventListener('change', status); el.addEventListener('input', status); } });
    status();
  }
  if (col === 'devices') {
    const rs = f.elements.room;
    const tog = () => (f.elements.roomNew.closest('label').hidden = rs.value !== '__new');
    rs.addEventListener('change', () => { tog(); if (rs.value === '__new') f.elements.roomNew.focus(); });
    tog();
    const typeNow = () => (f.querySelector('input[name=type]:checked') || {}).value || 'other';
    const styleNow = () => (f.querySelector('input[name=style]:checked') || {}).value || '';
    const hint = () => (f.querySelector('.type-hint').textContent = defaultsHint(typeNow(), styleNow()));
    const bindStyle = () => f.querySelectorAll('input[name=style]').forEach((r) => r.addEventListener('change', hint));
    f.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', () => {
      const list = stylesFor(typeNow());
      const sf = f.querySelector('.style-field');
      sf.hidden = !list;
      sf.querySelector('.style-chips').innerHTML = chipsHtml('style', (list || []).filter((x) => x.value), '');
      bindChipClear(sf);
      bindStyle();
      hint();
    }));
    bindStyle();
  }
  if (q.get('focus') === 'wire') setTimeout(() => { const wb = document.getElementById('wireBox'); if (wb) window.scrollTo({ top: wb.getBoundingClientRect().top + window.scrollY - 90 }); }, 30);
  if (photo && existing.photoId)
    store.getPhoto(existing.photoId).then((src) => {
      const el = document.getElementById('photoBox');
      if (el) el.innerHTML = src ? `<img class="photo" src="${src}" alt="Panel photo">` : 'Photo not available offline yet.';
    });
  if (photo) bindPhoto(col, existing);

  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());
    const base = existing ? { ...existing } : { id: col.slice(0, 1) + '_' + uid(), createdAt: Date.now() };
    let next;
    if (col === 'homes') next = { ...base, name: v.name.trim(), type: v.type, customerId: v.customerId != null ? v.customerId : base.customerId || '', address: v.address.trim(), notes: v.notes };
    if (col === 'homes' && isNew && v.start) next.start = v.start;
    if (col === 'panels') next = { ...base, homeId, name: v.name.trim(), type: v.type, layout: v.layout, mainAmps: v.mainAmps, mainAmpsOther: v.mainAmpsOther || '', spaces: v.spaces, spacesOther: v.spacesOther || '', shorePower: v.type === 'rv' ? v.shorePower : '', shorePowerOther: v.shorePowerOther || '', powerSource: v.type === 'rv' ? '' : (v.powerSource || ''), sourceAmps: v.type === 'rv' ? '' : (v.sourceAmps || ''), sourceAmpsOther: v.sourceAmpsOther || '', location: v.location.trim(), notes: v.notes, numbering: v.numbering === 'half' ? 'half' : 'space', fuses: base.fuses || [] };
    if (col === 'panels' && v.type !== 'rv') {
      // pro / more details: only stored when picked (old panels stay as they were)
      const svc = v.service || '';
      setOpt(next, 'service', svc === DEFAULT_SVC && !base.service ? '' : svc);
      const from = v.fedFrom || '';
      if (from && wouldLoop(inHome('panels', homeId), next.id, from)) return toast("That panel is fed from this one. Pick a different one.");
      setOpt(next, 'fedFrom', from);
      setOpt(next, 'fedBreaker', from ? v.fedBreaker || '' : '');
      setOpt(next, 'feeder', from ? v.feeder || '' : '');
      setOpt(next, 'feederOther', from && v.feeder === 'other' ? (v.feederOther || '').trim() : '');
      if (from && !next.powerSource) next.powerSource = 'subfeed';
      setOpt(next, 'genHookup', v.genHookup || '');
      const gen = v.genHookup && v.genHookup !== 'none';
      setOpt(next, 'genSize', gen ? v.genSize || '' : '');
      setOpt(next, 'genSizeOther', gen && v.genSize === 'other' ? (v.genSizeOther || '').trim() : '');
      setOpt(next, 'genInlet', gen ? v.genInlet || '' : '');
      setOpt(next, 'spd', v.spd || '');
      setOpt(next, 'groundRod', v.groundRod || '');
      setOpt(next, 'waterBond', v.waterBond || '');
      setOpt(next, 'groundNotes', (v.groundNotes || '').trim());
    }
    if (col === 'breakers') {
      const panelId = v.panelId;
      const slot = String(parseInt(v.slot, 10));
      const pn = byId('panels', panelId) || 'two';
      const t = v.btype || 'single';
      const { isGroup, makeGroup, plan, pos } = breakerPlan({ t, slot, pn: byId('panels', panelId), isNew, q, base, half: v.half });
      const groupId = makeGroup ? 'g_' + uid() : isGroup ? base.groupId || '' : '';
      const mates = plan.slice(1).map((p, i) => ({
        id: 'b_' + uid(), createdAt: Date.now(), homeId, panelId, slot: String(p.slot), size: 'half', half: p.half, poles: p.poles, btype: t, groupId,
        amps: v[`m${i + 1}amps`] || '15', ampsOther: '', label: (v[`m${i + 1}label`] || '').trim(), leg: '', rooms: [], kind: 'standard', notes: '', loads: [],
      }));
      const others = inHome('breakers', homeId).filter((o) => o.id !== base.id && o.panelId === panelId && !(groupId && o.groupId === groupId));
      const clash = findClash([{ ...pos }, ...mates], others, pn);
      if (clash) {
        const msg = clashText(clash, pn);
        const cov = f.querySelector('.covers');
        if (cov) { cov.hidden = false; cov.classList.add('bad'); cov.querySelector('.covers-clash').textContent = `⚠️ ${msg}`; cov.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        return toast('That spot is taken - see the note above');
      }
      next = { ...base, homeId, panelId, slot: pos.slot, poles: pos.poles, size: pos.size, half: pos.half, btype: t, groupId, amps: v.amps, ampsOther: v.ampsOther || '', label: v.label.trim(), leg: v.leg || base.leg || '', rooms: v.rooms.split(',').map((s) => s.trim()).filter(Boolean), kind: v.kind, notes: v.notes, loads: base.loads || [] };
      setOpt(next, 'phase', isThreePhase(byId('panels', panelId)) && /^[ABC]{1,3}$/.test(v.phase || '') ? v.phase : '');
      { const w = wireFromForm(v); if (w) next.wire = w; else delete next.wire; }
      for (const m of mates) await store.put('breakers', m);
    }
    if (col === 'devices') next = { ...base, homeId, type: v.type, name: v.name.trim(), room: (v.room === '__new' ? v.roomNew : v.room).trim(), location: v.location.trim(), breakerId: v.breakerId, gfci: v.gfci, afci: v.afci, status: v.status, notes: v.notes, readings: base.readings || [], style: stylesFor(v.type) ? v.style || '' : '', qty: Math.max(1, Math.floor(Number(v.qty)) || 1), box: v.box || '', replace: v.replace || '' };
    if (col === 'devices') {
      const w = wireFromForm(v);
      const b = byId('breakers', v.breakerId);
      const bw = b && cleanWire(b.wire);
      if (w && b && !bw && v.wall) { await store.put('breakers', { ...b, wire: w }); delete next.wire; }
      else if (w && JSON.stringify(w) !== JSON.stringify(bw || null)) next.wire = w;
      else delete next.wire;
    }
    if (col === 'customers') next = { ...base, name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim(), notes: v.notes, visits: base.visits || [], openCount: base.openCount || 0, lastOpenedAt: Date.now() };
    await store.put(col, next);
    toast('Saved');
    if (col === 'customers') return go(`#/customers/${next.id}`);
    if (col === 'homes') { setHome(next.id); if (isNew) return go(`#/edit/panels/new?home=${next.id}`); return go(`#/h/${next.id}/more`); }
    if (col === 'panels' && isNew && (q.get('quick') || (byId('homes', homeId) || {}).start === 'panel') && next.type !== 'rv') return go(`#/h/${homeId}/quick?panel=${next.id}`);
    if (col === 'panels') return go(`#/h/${homeId}/panel/${next.id}`);
    if (col === 'breakers') return go(`#/h/${homeId}/breaker/${next.id}`);
    if (col === 'devices') return go(`#/h/${homeId}/device/${next.id}`);
  };
  const del = document.getElementById('delBtn');
  if (del)
    del.onclick = async () => {
      if (!confirm('Delete? This cannot be undone.')) return;
      if (col === 'customers') {
        for (const h of D().homes.filter((h) => h.customerId === id)) await store.put('homes', { ...h, customerId: '' });
        await store.remove('customers', id);
        return go('#/customers');
      }
      if (col === 'homes') {
        if (existing.shareToken) await store.deleteShare(existing.shareToken, inHome('panels', id).map((p) => p.id)).catch(() => {});
        for (const c of ['devices', 'breakers', 'panels']) for (const it of inHome(c, id)) { if (it.photoId) await store.removePhoto(it.photoId); await store.remove(c, it.id); }
        if (existing.floorplan && existing.floorplan.photoId) await store.removePhoto(existing.floorplan.photoId).catch(() => {});
        await store.remove('homes', id);
        localStorage.removeItem(HOME_KEY);
        return go('#/');
      }
      if (col === 'panels') {
        for (const b of inHome('breakers', homeId).filter((b) => b.panelId === id)) await store.remove('breakers', b.id);
        if (existing.photoId) await store.removePhoto(existing.photoId);
      }
      if (col === 'breakers') for (const d of inHome('devices', homeId).filter((d) => d.breakerId === id)) await store.put('devices', { ...d, breakerId: '' });
      if (col === 'devices' && existing.photoId) await store.removePhoto(existing.photoId);
      await store.remove(col, id);
      go(`#/h/${homeId}/panel`);
    };
}

start();
