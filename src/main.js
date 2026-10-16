import './styles.css';
import QRCode from 'qrcode';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { createLocalStore } from './store/local.js';
import {
  AMP_OPTIONS, POLE_OPTIONS, BREAKER_KINDS, DEVICE_TYPES, GFCI_OPTIONS, AFCI_OPTIONS, STATUS_OPTIONS,
  PANEL_TYPES, SPACE_OPTIONS, MAIN_AMP_OPTIONS, RV_MAIN_AMP_OPTIONS, SHORE_POWER_OPTIONS, LEG_OPTIONS, POWER_SOURCE_OPTIONS,
  FUSE_AMP_OPTIONS, FUSE_USES, HOME_TYPES, LAYOUT_OPTIONS, NUMBERING_OPTIONS, BTYPE_OPTIONS, HOME_ROOMS, RV_ROOMS, labelOf, deviceIcon,
  BOX_OPTIONS, REPLACE_OPTIONS, stylesFor, styleOf, qtyOf,
} from './lib/options.js';
import { shoppingList, shoppingCsv, lineText } from './lib/shopping.js';
import { layoutOf, panelSpaces, slotsFor, slotLabel, numberingOf, overlaps, occupancy, halfRows, positionLabel, positionSlot, groupPlan, directoryRows, breakerType, sizeOf, keysFor } from './lib/panel.js';
import { seedPro } from './lib/seed.js';
import { LOAD_PRESETS, PRESET_NOTE } from './lib/presets.js';
import { loadSummary, levelText, fmtAmps, shoreSummary, deviceWatts, voltsFor, isOn } from './lib/load.js';
import { loadRef, parseRef, loadAt, toggleLoad, setAllOn, moveLoad, setPortable, portablesOf, loadWatts, PORTABLE_SUGGESTIONS } from './lib/onoff.js';
import { THEME_OPTIONS, getThemePref, setThemePref, applyTheme } from './lib/theme.js';
import { parseBreakerQuery } from './lib/search.js';
import { CATALOG, CATEGORIES, CATALOG_NOTE, catById, categoryOf, wattsRange, ampsRange, surgeText, circuitTag } from './lib/catalog.js';
import { searchHome, searchCatalog, lookupUrl, projectedPct, wattsFromAmps } from './lib/devicesearch.js';
import { uid, esc, ampsText, sortBreakers, download } from './lib/util.js';
import { breakersCsv, devicesCsv, fusesCsv } from './lib/csv.js';
import { compressPhoto } from './lib/photo.js';

const app = document.getElementById('app');
const MODE_KEY = 'panelbuddy:mode';
const HOME_KEY = 'panelbuddy:home';
let store;
let pendingRoute = null;

// Printed / shared directory rows. Each circuit number (or tandem half) gets its own entry.
function dirRowsHtml(panel, breakers) {
  const one = layoutOf(panel) === 'one';
  const half = numberingOf(panel) === 'half';
  const amps = (b) => esc(ampsText(b));
  const rm = (b) => ((b.rooms || []).length && !(b.label || '').toLowerCase().includes(String(b.rooms[0]).toLowerCase()) ? ` <span class="rm">(${esc(b.rooms.join(', '))})</span>` : '');
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
const sumOf = (b) => loadSummary(b, D().devices);
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
    ['rooms', '⌂', 'Rooms', `#/h/${homeId}/rooms`],
    ['search', '⌕', 'Search', `#/h/${homeId}/search`],
    ['load', '⚡', 'Load', `#/h/${homeId}/load`],
    ['more', '⚙︎', 'Settings', `#/h/${homeId}/more`],
  ];
  return `
  ${store.mode === 'demo' ? `<div class="demo-banner">Demo mode: saved on this device only${isFirebaseConfigured() ? ' · <a href="#/login">Sign in to sync</a>' : ''}</div>` : ''}
  <header class="topbar">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="Back">‹</a>` : `<img class="logo" src="./brand/house-108.png" alt="" aria-hidden="true" width="34" height="34">`}
    <div class="topbar-title">
      ${title ? `<h1>${esc(title)}</h1>` : `<label class="sr-only" for="homePick">Home</label>
      <select id="homePick" class="home-pick">${homeOptions(homes, homeId)}<option value="__new">+ Add a home...</option></select>`}
    </div>
    <a class="scan-btn" href="#/scan" aria-label="Scan a QR sticker"><span aria-hidden="true">⌗</span>Scan</a>
  </header>
  <main id="main" class="main">${body}</main>
  <nav class="bottomnav ${isPro() ? 'six' : ''}" aria-label="Sections">
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

  if (parts[0] === 'share' && parts[1]) return renderShare(parts[1]);
  if (['p', 'd', 'b'].includes(parts[0]) && parts[1]) return resolveShort(parts[0], parts[1]);
  if (parts[0] === 'scan') return renderScan();
  if (store.mode === 'cloud' && !store.user) {
    if (parts[0] === 'h' || parts[0] === 'customers') pendingRoute = location.hash;
    return renderLogin();
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
    if (view === 'breaker') return renderBreaker(homeId, id);
    if (view === 'device') return renderDevice(homeId, id);
    if (view === 'rooms') return renderRooms(homeId, q.get('room'));
    if (view === 'search' && id === 'dev') return renderCatalogItem(homeId, parts[4], q);
    if (view === 'search' && id === 'add') return renderAddPicker(homeId, parts[4], q);
    if (view === 'search') return renderSearch(homeId, q.get('q') || '', q.get('cat') || '');
    if (view === 'load') return renderLoad(homeId);
    if (view === 'move') return renderMove(homeId, q);
    if (view === 'portable') return renderPortables(homeId);
    if (view === 'more') return renderMore(homeId);
    if (view === 'shop') return renderShop(homeId, q.get('scope'));
    if (view === 'print') return renderPrint(homeId, parts[3], parts[4], q);
  } catch (e) {
    console.error(e);
  }
  return renderNotFound();
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
  const breakers = inHome('breakers', homeId).filter((b) => b.panelId === panel.id);
  const devices = inHome('devices', homeId);
  const layout = layoutOf(panel);
  const one = layout === 'one';
  const halfNum = numberingOf(panel) === 'half';
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
    const meta = [nDev ? `${nDev} item${nDev > 1 ? 's' : ''}` : '', sum.level !== 'none' ? `${Math.round(sum.pct)}%` : '', b.leg ? `L${esc(b.leg)}` : '', dead ? '<b class="bad">needs fix</b>' : '', b.kind && b.kind !== 'standard' && b.kind !== 'spare' ? esc(b.kind.toUpperCase()) : ''].filter(Boolean).join(' · ');
    const tag = isHalf ? (bt === 'quad' ? 'QUAD' : 'TANDEM') : '';
    cells.push(`<a class="brk ${isHalf ? 'half ' + (keys.length > 1 ? 'half-mid' : b.half === 'B' ? 'half-b' : 'half-a') : ''} ${b.kind === 'spare' ? 'spare' : ''} lvl-${sum.level}" href="#/h/${homeId}/breaker/${b.id}" style="grid-column:${col};grid-row:${start + 1} / span ${keys.length}">
      <span class="brk-slot">${esc(slotText(b))}</span>
      <span class="brk-handle">${esc(ampsText(b))}</span>
      <span class="brk-label">${esc(b.label || 'Unlabeled')}</span>
      ${isHalf && keys.length === 1 ? '' : `<span class="brk-meta">${tag ? `<b class="tagc">${tag}</b>${meta ? ' · ' : ''}` : ''}${meta}</span>`}
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
  const body = `
  ${searchBarHtml(homeId)}
  <section class="panel-head">
    <div>
      ${panels.length > 1 ? `<label class="sr-only" for="panelPick">Panel</label><select id="panelPick" class="panel-pick">${panels.map((p) => `<option value="${p.id}" ${p.id === panel.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : `<h2>${esc(panel.name)}</h2>`}
      <p class="muted">${esc(labelOf(PANEL_TYPES, panel.type))}${panel.mainAmps ? ` · ${esc(mainAmpsText(panel))}A main` : ''}${panel.type === 'rv' && panel.shorePower ? ` · ${esc(shoreText(panel))} shore power` : ''}${sourceText(panel) ? ` · Power from: ${esc(sourceText(panel))}` : ''} · ${breakers.length} breakers${panel.location ? ` · ${esc(panel.location)}` : ''}</p>
    </div>
    <div class="head-actions">
      <a class="btn small" href="#/edit/panels/${panel.id}?home=${homeId}">Edit</a>
    </div>
  </section>
  ${(() => { const h = byId('homes', homeId); const c = h && h.customerId && byId('customers', h.customerId); return c ? `<a class="breaker-link" href="#/customers/${c.id}"><span class="big-icon sm" aria-hidden="true">👤</span><span><b>${esc(c.name)}</b><span class="muted">${c.lastServiced ? 'Last serviced ' + esc(c.lastServiced) : 'No visits logged'} · ${(c.visits || []).length} service note${(c.visits || []).length === 1 ? '' : 's'}</span></span><span aria-hidden="true">›</span></a>` : ''; })()}
  ${over || warn ? `<a class="alert ${over ? 'over' : 'warn'}" href="#/h/${homeId}/load">${over ? `${over} circuit${over > 1 ? 's' : ''} over 100%` : ''}${over && warn ? ' · ' : ''}${warn ? `${warn} at 80%+` : ''} - see Load check</a>` : ''}
  <div class="panel-box">
    <div class="panel-main">${panel.type === 'rv' ? '120V AC · ' : ''}MAIN ${esc(mainAmpsText(panel))}${panel.mainAmps ? 'A' : ''}</div>
    <div class="panel-grid halfrows ${one ? 'one' : ''}" style="grid-template-rows:repeat(${rows}, minmax(30px, auto))">${cells.join('')}</div>
  </div>
  <div class="row-actions">
    <a class="btn" href="#/edit/breakers/new?home=${homeId}&panel=${panel.id}">+ Breaker</a>
    <a class="btn" href="#/edit/panels/new?home=${homeId}">+ Panel</a>
    <a class="btn" href="#/h/${homeId}/print/directory/${panel.id}">Print label</a>
  </div>
  <div class="legend"><span class="dot lvl-ok"></span>under 80% <span class="dot lvl-warn"></span>80%+ <span class="dot lvl-over"></span>over 100% <span class="dot lvl-none"></span>no loads listed</div>
  ${breakers.some((b) => sizeOf(b) === 'half') ? '<p class="tiny muted legend-note">Short rows are tandem / quad halves: 2 half-size breakers in 1 space, each with its own number.</p>' : ''}
  ${shoreCard(panel, breakers, homeId)}
  ${panel.type === 'rv' || (panel.fuses || []).length ? fuseCard(panel) : ''}
  <div id="panelExtra"></div>`;
  app.innerHTML = shell(homeId, 'panel', body);
  bindShell();
  bindSearchBar(homeId);
  const pp = document.getElementById('panelPick');
  if (pp) pp.onchange = () => go(`#/h/${homeId}/panel/${pp.value}`);
  bindFuses(panel);
  renderPanelExtra(homeId, panel);
}

const mainAmpsText = (p) => (p.mainAmps === 'other' ? p.mainAmpsOther || '' : p.mainAmps || '');
const shoreText = (p) => (p.shorePower === 'other' ? `${p.shorePowerOther || '?'}A` : p.shorePower === 'pole' ? `Power pole ${mainAmpsText(p)}A` : labelOf(SHORE_POWER_OPTIONS, p.shorePower).split(' (')[0]);
const sourceAmpsText = (p) => (['pole', 'pedestal', 'house_meter'].includes(p.powerSource) ? (p.sourceAmps === 'other' ? p.sourceAmpsOther : p.sourceAmps) : '');
const sourceText = (p) => (p.type !== 'rv' && p.powerSource ? labelOf(POWER_SOURCE_OPTIONS, p.powerSource).split(' (')[0] + (sourceAmpsText(p) ? ` (${sourceAmpsText(p)}A main)` : '') : '');

function shoreCard(panel, breakers, homeId, link = false) {
  if (panel.type !== 'rv') return '';
  const sum = shoreSummary(panel, breakers, D().devices);
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
    <div class="card qr-card"><div class="qr">${svg}</div><div><h3>Panel QR code</h3><p class="muted">Stick it on the panel door. Scanning it opens this panel.</p><a class="btn small" href="#/h/${homeId}/print/qr?only=panel:${panel.id}">Print sticker</a></div></div>`;
}

// ---------------------------------------------------------------- breaker view
// ---------------------------------------------------------------- "what's plugged in" helpers
// One load: [on/off switch] name · watts · Move · Remove. ref = loadRef(kind, id, index).
function loadRow(l, ref, homeId, { sub = false } = {}) {
  const w = (Number(l.watts) || 0) * (Number(l.qty) || 1);
  const on = isOn(l);
  const nm = esc(l.name);
  return `<li class="item-row ${on ? '' : 'is-off'}">
    <button type="button" class="onoff ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-toggle="${esc(ref)}" aria-label="${nm} is ${on ? 'on' : 'off'}. Tap to turn ${on ? 'off' : 'on'}"><span class="knob"></span></button>
    <span class="item-main">${sub ? `<span>${nm}` : `<b>${nm}`}${Number(l.qty) > 1 ? ` <span class="muted">×${esc(l.qty)}</span>` : ''}${l.portable ? ' <span class="tag-portable">portable</span>' : ''}${sub ? '</span>' : '</b>'}${!on || l.note ? `<span class="muted tiny">${on ? '' : 'Off'}${!on && l.note ? ' · ' : ''}${l.note ? esc(l.note) : ''}</span>` : ''}</span>
    <span class="item-w">${wattsText(w)}</span>
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
    const t = e.target.closest('[data-toggle],[data-del-ref],[data-all-on]');
    if (!t || !store) return;
    e.preventDefault();
    if (t.dataset.toggle) {
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

function addItemForm(id, { targets = null, button = 'Add' } = {}) {
  return `<form id="${id}" class="form add-item">
    ${targets ? `<label>Plugged into<select name="target">${targets}</select></label>` : ''}
    <label>What is it?
      <select name="preset"><option value="">Choose a common item...</option>${LOAD_PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)} (~${p.watts}W)</option>`).join('')}<option value="custom">Something else (type it)</option></select>
    </label>
    <div class="two">
      <label>Name<input name="name" placeholder="e.g. Space heater" autocomplete="off" list="${id}-catalog"></label>
      <label>Watts<input name="watts" type="number" inputmode="numeric" min="0" step="1" placeholder="1500"></label>
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
    <div class="two">
      <label>How many<select name="qty">${opt(['1', '2', '3', '4', '5', '6', '8', '10'], '1')}</select></label>
      <label>Note <span class="muted">(optional)</span><input name="note" placeholder="e.g. on a power strip" autocomplete="off"></label>
    </div>
    <label class="check-line"><input type="checkbox" name="portable"> Moves around (portable)</label>
    <button class="btn primary full" type="submit">${esc(button)}</button>
    <p class="tiny muted">${esc(PRESET_NOTE)}</p>
  </form>`;
}

function bindAddItemForm(f, onAdd) {
  if (!f) return;
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
    await onAdd(item, f.elements.target ? f.elements.target.value : '');
    toast('Added');
  };
}

// "Max if all on: 92% (13.8A)" - only when something is switched off.
function maxLine(s, cls = 'max-line') {
  if (!s.offCount || !s.allWatts) return '';
  return `<span class="${cls}">Max if all on: ${s.rating ? `<b class="pct-inline ${s.allLevel}">${Math.round(s.allPct)}%</b> · ` : ''}${fmtAmps(s.allAmps)}A</span>`;
}

function loadHeadline(s) {
  if (!s.rating) return `<p class="muted">Set the breaker's amps to see the load check.</p>`;
  const some = s.loadCount > 0;
  return `${some ? `<div class="using-now">Using now${s.offCount ? ` <span class="muted">· ${s.loadCount - s.offCount} of ${s.loadCount} on</span>` : ''}</div>` : ''}
    <div class="load-num"><b>${fmtAmps(s.amps)}A</b> <span>of ${s.rating}A</span><span class="pct ${s.level}">${s.level === 'none' ? '' : Math.round(s.pct) + '%'}</span></div>
    ${loadBar(s)}
    <p class="lvl-text ${s.level}">${some && !s.watts ? 'Everything here is off right now' : esc(levelText(s.level))}</p>
    ${some ? `<p class="max-all">Max if all on: <b class="pct-inline ${s.allLevel}">${Math.round(s.allPct)}%</b> · ${fmtAmps(s.allAmps)}A</p>` : ''}
    <p class="tiny muted">${wattsText(s.watts)} on ÷ ${s.volts}V. 80% of ${s.rating}A = ${fmtAmps(s.limit80)}A.</p>`;
}

const breakerTypeText = (b) => {
  const t = breakerType(b);
  if (sizeOf(b) === 'half') {
    if (t === 'quad') return String(b.poles) === '2' ? 'Quad breaker: middle 2-pole (240V)' : `Quad breaker: ${b.half === 'B' ? 'bottom' : 'top'} single (120V)`;
    return `Tandem breaker: ${b.half === 'B' ? 'bottom' : 'top'} half (120V)`;
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
      <p class="muted">${esc(ampsText(b))} · ${esc(breakerTypeText(b))}${b.leg ? ` · Leg ${esc(b.leg)}` : ''}${b.kind && b.kind !== 'standard' ? ` · ${esc(labelOf(BREAKER_KINDS, b.kind))}` : ''}${panel ? ` · ${esc(panel.name)}` : ''}</p>
      ${(b.rooms || []).length ? `<div class="chips">${b.rooms.map((r) => `<a class="chip" href="#/h/${homeId}/rooms?room=${encodeURIComponent(r)}">${esc(r)}</a>`).join('')}</div>` : ''}
    </div>
  </section>
  ${b.notes ? `<p class="note-text pre">${esc(b.notes)}</p>` : ''}
  ${groupMatesHtml(homeId, b)}

  <div class="card">
    <div class="card-head"><h3>Outlets &amp; lights <span class="count">${devices.length}</span></h3><a class="btn small" href="#/edit/devices/new?home=${homeId}&breaker=${b.id}">+ Add</a></div>
    ${devices.length ? `<ul class="list">${devices.map((d) => deviceRow(homeId, d)).join('')}</ul>` : `<p class="muted">Nothing mapped to this breaker yet. Add each outlet and light it feeds, then tap one to list what's plugged in.</p>`}
  </div>

  <div class="card" id="loads">
    <h3>Load check</h3>
    ${loadHeadline(s)}
    ${s.loadCount > 1 ? `<div class="all-onoff"><button type="button" class="btn small" data-all-on="${esc(b.id)}|on">All on</button><button type="button" class="btn small" data-all-on="${esc(b.id)}|off">All off</button></div>` : ''}
    ${s.allWatts ? `<div class="breakdown">
      ${own.length ? `<div class="bd-group"><div class="bd-head"><span>On this circuit</span><span>${wattsText(s.ownWatts)}${s.ownWatts !== s.ownAllWatts ? ` <span class="muted">of ${wattsText(s.ownAllWatts)}</span>` : ''}</span></div><ul class="list items">${own.map((l, i) => loadRow(l, loadRef('b', b.id, i), homeId)).join('')}</ul></div>` : ''}
      ${s.parts.map(({ device: d, watts, allWatts }) => `<div class="bd-group"><a class="bd-head link" href="#/h/${homeId}/device/${d.id}"><span>${deviceIcon(d.type)} ${esc(d.name || labelOf(DEVICE_TYPES, d.type))}${d.room ? ` <span class="muted">· ${esc(d.room)}</span>` : ''}</span><span>${wattsText(watts)}${watts !== allWatts ? ` <span class="muted">of ${wattsText(allWatts)}</span>` : ''} ›</span></a><ul class="list items sub">${(d.loads || []).map((l, i) => loadRow(l, loadRef('d', d.id, i), homeId, { sub: true })).join('')}</ul></div>`).join('')}
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
    <span class="row-main"><b>${esc(d.name || labelOf(DEVICE_TYPES, d.type))}</b><span class="muted">${esc([styleOf(d) ? styleOf(d).label : '', d.room, d.location].filter(Boolean).join(' · ') || (d.loads || []).map((l) => l.name).join(', '))}</span></span>
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
    </div>
  </section>
  ${b ? `<a class="breaker-link" href="#/h/${homeId}/breaker/${b.id}"><span class="big-slot sm">${esc(slotText(b))}</span><span><b>Breaker ${esc(slotText(b))} · ${esc(ampsText(b))}</b><span class="muted">${esc(b.label || '')}${panel ? ` · ${esc(panel.name)}` : ''}</span></span><span aria-hidden="true">›</span></a>` : `<div class="alert warn">Breaker not mapped yet. <a href="#/edit/devices/${d.id}?home=${homeId}">Pick one</a></div>`}
  ${(() => {
    const items = d.loads || [];
    const w = deviceWatts(d, { onlyOn: true });
    const wAll = deviceWatts(d);
    const cs = b ? sumOf(b) : null;
    const plugTitle = d.type === 'outlet' || !d.type ? 'Plugged in here' : 'What it powers / draws';
    return `<div class="card" id="plugged">
      <div class="card-head"><h3>${plugTitle}</h3>${wAll ? `<span class="pill ${w ? 'amber' : 'gray'}">${w ? `${wattsText(w)} · ${fmtAmps(w / voltsFor(b && b.poles))}A on` : 'All off'}</span>` : ''}</div>
      ${items.length ? `<ul class="list items">${items.map((l, i) => loadRow(l, loadRef('d', d.id, i), homeId)).join('')}</ul>` : `<p class="muted">Nothing listed yet. Add what's plugged in and it counts toward ${b ? `breaker ${esc(slotText(b))}'s` : 'the breaker'} load check.</p>`}
      <details class="add-wrap" ${items.length ? '' : 'open'}><summary class="btn full">+ Add something plugged in</summary>
        ${addItemForm('itemForm', { button: 'Add to this ' + (d.type === 'outlet' ? 'outlet' : 'item') })}
      </details>
      ${cs && cs.rating ? `<a class="circuit-mini" href="#/h/${homeId}/breaker/${b.id}#loads"><span class="row-main"><b>Whole circuit: ${fmtAmps(cs.amps)}A of ${cs.rating}A</b><span class="muted">${w ? `This ${d.type === 'outlet' ? 'outlet' : 'item'} is ${wattsText(w)} of ${wattsText(cs.watts)} in use` : `${wattsText(cs.watts)} in use on breaker ${esc(slotText(b))}`}</span>${maxLine(cs, 'muted tiny block')}</span><span class="pct ${cs.level}">${cs.level === 'none' ? '' : Math.round(cs.pct) + '%'}</span>${cs.level !== 'none' ? loadBar(cs, true) : ''}</a>` : ''}
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
    return `<li><a class="row" href="${href}"><span class="row-icon" aria-hidden="true">🔌</span><span class="row-main"><b>${esc(l.name)}${Number(l.qty) > 1 ? ` <span class="muted">×${esc(l.qty)}</span>` : ''}</b><span class="muted wrap">${esc(where)} · ${esc(brk)}</span></span><span class="row-side">${isOn(l) ? '' : '<span class="pill gray">off</span>'}${w ? `<span class="pill ${isOn(l) ? 'amber' : 'gray'}">${wattsText(w)}</span>` : ''}${r.breaker ? `<span class="pill">#${esc(slotText(r.breaker))}</span>` : '<span class="pill gray">?</span>'}</span><span class="chev" aria-hidden="true">›</span></a></li>`;
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
    if (!watts) return `<span class="pill gray">${s.level === 'none' ? '0' : Math.round(s.pct)}% now</span>`;
    // "now" = loads that are on; the new item is assumed on.
    const after = projectedPct(s, watts);
    const lvl = after > 100 ? 'red' : after >= 80 ? 'amber' : 'green';
    return `<span class="pill ${lvl}" title="Breaker load now and after adding it">${Math.round(s.pct)}% → ${Math.round(after)}%</span>`;
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
  const counts = plugIn || isOn(l); // plugging in = on; moving keeps its on/off state
  const curB = breakerOfRef(from);
  const breakers = sortBreakers(inHome('breakers', homeId).filter((b) => b.kind !== 'spare'));
  const devices = inHome('devices', homeId).filter((d) => !d.type || ['outlet', 'appliance', 'other'].includes(d.type) || (d.loads || []).length);
  const proj = (b) => {
    if (!b) return '<span class="pill gray">no breaker</span>';
    const s = sumOf(b);
    if (!s.rating) return '';
    const same = curB && curB.id === b.id;
    const after = counts && !same ? projectedPct(s, w) : s.pct;
    const lvl = after > 100 ? 'red' : after >= 80 ? 'amber' : 'green';
    return `<span class="pill ${lvl}">${Math.round(s.pct)}% → ${Math.round(after)}%${after > 100 ? ' ⚠️' : ''}</span>`;
  };
  const overNote = (b) => {
    if (!b || !counts || (curB && curB.id === b.id)) return '';
    const s = sumOf(b);
    const after = s.rating ? projectedPct(s, w) : 0;
    return after > 100 ? `<span class="over-note">${esc(l.name)} here → ${Math.round(after)}% ⚠️ try another outlet</span>` : '';
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
    <div><h2>${plugIn ? 'Plug in' : 'Move'} ${esc(l.name)}</h2><p class="muted">${wattsText(w)}${counts ? '' : ' · off'} · now: ${esc(whereText(from))}</p></div>
  </section>
  ${!plugIn ? `<div class="card move-opts">
    <label class="check-line"><input type="checkbox" id="portableChk" ${l.portable ? 'checked' : ''}> Moves around (portable)</label>
    ${l.portable ? `<button type="button" class="btn small" id="unplugBtn">Unplug (put away)</button>` : ''}
  </div>` : ''}
  <p class="tiny muted">${counts ? `Pick where it's plugged in now. The % shows that breaker now → with ${esc(l.name)} on.` : `It's switched off, so it won't add to the new breaker until you turn it on.`}</p>
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
      const after = s && s.rating && counts ? projectedPct(s, w) : null;
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
    const on = isOn(l);
    const status = !where ? 'Put away · not counted' : `${whereText(ref)}${s && s.rating ? ` · ${Math.round(s.pct)}% now` : ''}`;
    return `<li class="item-row portable-row ${where && on ? '' : 'is-off'}">
      ${where ? `<button type="button" class="onoff ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-toggle="${esc(ref)}" aria-label="${esc(l.name)} is ${on ? 'on' : 'off'}. Tap to turn ${on ? 'off' : 'on'}"><span class="knob"></span></button>` : '<span class="onoff-gap" aria-hidden="true">🧳</span>'}
      <span class="item-main"><b>${esc(l.name)} <span class="tag-portable">portable</span></b><span class="muted tiny">${esc(status)}${s && s.level === 'over' && on ? ' ⚠️' : ''}</span></span>
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
  <p class="tiny muted">Only devices switched on count toward "now". Amps = watts ÷ 120V (÷ 240V for double-pole). Loads that run 3+ hours should stay under 80% of the breaker. Tap a circuit to add what's plugged in.</p>
  <ul class="list load-list">${rows.map(({ b, s }) => `<li><a class="load-item" href="#/h/${homeId}/breaker/${b.id}#loads">
    <div class="load-top"><span class="big-slot sm">${esc(slotText(b))}</span><span class="row-main"><b>${esc(b.label || 'Breaker')}</b><span class="muted">${s.level === 'none' ? 'No loads listed yet' : `${fmtAmps(s.amps)}A of ${s.rating}A · ${Math.round(s.watts)}W${s.offCount ? ' now' : ''}`}</span>${maxLine(s, 'muted tiny block')}</span><span class="pct ${s.level}">${s.level === 'none' ? '-' : Math.round(s.pct) + '%'}</span></div>
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
    if (!confirm('Turn off this link? Anyone who has it will lose access.')) return;
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
    home: { name: home.name, type: home.type || '', address: home.address || '' },
    panels: inHome('panels', homeId).map((p) => ({
      id: p.id, name: p.name, type: p.type, numbering: p.numbering || 'space', layout: p.layout || 'auto', mainAmps: p.mainAmps || '', mainAmpsOther: p.mainAmpsOther || '',
      spaces: p.spaces || '', spacesOther: p.spacesOther || '', shorePower: p.shorePower || '', shorePowerOther: p.shorePowerOther || '', powerSource: p.powerSource || '', sourceAmps: p.sourceAmps || '', sourceAmpsOther: p.sourceAmpsOther || '', location: p.location || '',
      fuses: (p.fuses || []).map((f) => ({ num: f.num, amps: f.amps, ampsOther: f.ampsOther || '', powers: f.powers, notes: f.notes || '' })),
      breakers: inHome('breakers', homeId).filter((b) => b.panelId === p.id).map((b) => ({ slot: b.slot, poles: b.poles, size: b.size || 'full', half: b.half || '', btype: b.btype || '', amps: b.amps, ampsOther: b.ampsOther || '', label: b.label || '', rooms: b.rooms || [], kind: b.kind || '' })),
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
      <table class="dir-table ${one ? 'one' : ''}"><thead><tr><th>#</th><th>A</th><th>Circuit</th>${one ? '' : '<th>#</th><th>A</th><th>Circuit</th>'}</tr></thead><tbody>${dirRowsHtml(p, p.breakers)}</tbody></table>
      ${p.fuses.length ? `<div class="dir-head" style="margin-top:8px"><b>12V DC fuses</b></div><table class="dir-table one"><thead><tr><th>#</th><th>A</th><th>Powers</th></tr></thead><tbody>${p.fuses.map((f) => `<tr><td class="n">${esc(f.num)}</td><td class="a">${esc(f.amps === 'other' ? f.ampsOther : f.amps)}A</td><td class="l">${esc(f.powers)}${f.notes ? ` <span class="rm">(${esc(f.notes)})</span>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
    </div>`;
  });
  app.innerHTML = `
  <header class="topbar"><img class="logo" src="./brand/house-108.png" alt="" aria-hidden="true" width="34" height="34"><div class="topbar-title"><h1>${esc(doc.home.name)}</h1></div></header>
  <main class="main share-main">
    <p class="muted no-print">Read-only panel directory shared from AmpMap${doc.updatedAt ? ' · updated ' + new Date(doc.updatedAt).toLocaleDateString() : ''}.</p>
    <div class="row-actions no-print"><button class="btn" id="doPrint">Print / Save as PDF</button><a class="btn ghost" href="#/">Get AmpMap (free)</a></div>
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
    const body = `
    <div class="print-controls no-print">
      <label>Size<select id="dirSize">${opt([{ value: 'half', label: 'Half page (fits most panel doors)' }, { value: 'full', label: 'Full page 8.5 x 11' }], size)}</select></label>
      <button class="btn primary" id="doPrint">Print / Save as PDF</button>
    </div>
    <div class="sheet directory ${size}">
      <div class="dir-head"><b>${esc(panel.name)}</b> · ${esc(homeLabel(home))}${panel.mainAmps ? ` · Main ${esc(mainAmpsText(panel))}A` : ''}${panel.type === 'rv' && panel.shorePower ? ` · ${esc(shoreText(panel))} shore` : ''}${sourceText(panel) ? ` · ${esc(sourceText(panel))}` : ''}</div>
      <table class="dir-table ${one ? 'one' : ''}"><thead><tr><th>#</th><th>A</th><th>Circuit</th>${one ? '' : '<th>#</th><th>A</th><th>Circuit</th>'}</tr></thead><tbody>${dirRowsHtml(panel, breakers)}</tbody></table>
      ${fuses.length ? `<div class="dir-head" style="margin-top:8px"><b>12V DC fuses</b></div><table class="dir-table one"><thead><tr><th>#</th><th>A</th><th>Powers</th></tr></thead><tbody>${fuses.map((f) => `<tr><td class="n">${esc(f.num)}</td><td class="a">${esc(f.amps === 'other' ? f.ampsOther : f.amps)}A</td><td class="l">${esc(f.powers)}${f.notes ? ` <span class="rm">(${esc(f.notes)})</span>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="dir-foot">Updated ${new Date().toLocaleDateString()} · AmpMap</div>
    </div>`;
    app.innerHTML = shell(homeId, 'more', body, { title: 'Panel label', back: `#/h/${homeId}/panel/${panel.id}` });
    bindShell();
    document.getElementById('dirSize').onchange = (e) => go(`#/h/${homeId}/print/directory/${panel.id}?size=${e.target.value}`);
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
      if (type === 'breaker') items.push({ path: `/b/${it.id}`, title: `Breaker ${slotText(it)} · ${ampsText(it)}`, sub: it.label || '' });
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
      <label>Notes<textarea name="notes" rows="3">${esc(h.notes)}</textarea></label>`;
  } else if (col === 'panels') {
    const home = byId('homes', homeId) || {};
    const firstType = home.type === 'rv' ? 'rv' : inHome('panels', homeId).length ? 'sub' : 'main';
    const p = existing || { name: firstType === 'rv' ? 'RV distribution center' : firstType === 'sub' ? 'Sub-panel' : 'Main panel', type: firstType, layout: 'auto', mainAmps: firstType === 'rv' ? '30' : '200', shorePower: '30', spaces: firstType === 'rv' ? '6' : '20', location: '', notes: '' };
    title = isNew ? 'Add a panel' : 'Edit panel';
    back = isNew ? `#/h/${homeId}/panel` : `#/h/${homeId}/panel/${id}`;
    photo = !isNew;
    const rv = p.type === 'rv';
    fields = `
      <label>Panel name<input name="name" required value="${esc(p.name)}"></label>
      <label>Panel type<select name="type">${opt(PANEL_TYPES, p.type)}</select></label>
      <label class="rv-only" ${rv ? '' : 'hidden'}>Shore power<select name="shorePower" data-other="shorePowerOther">${opt(SHORE_POWER_OPTIONS, p.shorePower || '30')}</select></label>
      <label class="home-only" ${rv ? 'hidden' : ''}>Power comes from<select name="powerSource">${opt(POWER_SOURCE_OPTIONS, p.powerSource || '')}</select></label>
      <label class="src-main" ${!rv && ['pole','pedestal','house_meter'].includes(p.powerSource) ? '' : 'hidden'}>Main breaker at the pole / meter (amps)<select name="sourceAmps" data-other="sourceAmpsOther">${opt(MAIN_AMP_OPTIONS, p.sourceAmps || '200')}</select></label>
      <label class="other-field" ${!rv && ['pole','pedestal','house_meter'].includes(p.powerSource) && p.sourceAmps === 'other' ? '' : 'hidden'}>Pole / meter main amps (type it)<input name="sourceAmpsOther" type="number" inputmode="numeric" value="${esc(p.sourceAmpsOther || '')}"></label>
      <label class="other-field" ${rv && p.shorePower === 'other' ? '' : 'hidden'}>Shore power amps (other)<input name="shorePowerOther" type="number" inputmode="numeric" value="${esc(p.shorePowerOther || '')}"></label>
      <div class="two">
        <label>Main breaker amps<select name="mainAmps" data-other="mainAmpsOther">${opt(rv ? RV_MAIN_AMP_OPTIONS : MAIN_AMP_OPTIONS, p.mainAmps)}</select></label>
        <label>Breaker spaces<select name="spaces" data-other="spacesOther">${opt(SPACE_OPTIONS, p.spaces)}</select></label>
      </div>
      <label class="other-field" ${p.mainAmps === 'other' ? '' : 'hidden'}>Main amps (other)<input name="mainAmpsOther" type="number" inputmode="numeric" value="${esc(p.mainAmpsOther || '')}"></label>
      <label class="other-field" ${p.spaces === 'other' ? '' : 'hidden'}>Number of spaces<input name="spacesOther" type="number" inputmode="numeric" min="1" max="84" value="${esc(p.spacesOther || '')}"></label>
      <label>Layout<select name="layout">${opt(LAYOUT_OPTIONS, p.layout || 'auto')}</select></label>
      <label>Circuit numbers<select name="numbering">${opt(NUMBERING_OPTIONS, numberingOf(p))}</select></label>
      <p class="tiny muted">Look at the number strip by the breakers. If the first space on the left is numbered 1 and 3 (common on panels made for tandem breakers), pick "2 numbers per space" and set Breaker spaces to the highest number, like 32.</p>
      <label>Where is it?<input name="location" value="${esc(p.location)}" placeholder="${rv ? 'e.g. Under the bed' : 'e.g. Garage, north wall'}"></label>
      <label>Notes<textarea name="notes" rows="3">${esc(p.notes)}</textarea></label>
      ${rv ? '<p class="tiny muted">12V DC fuses are added on the panel screen after saving.</p>' : ''}`;
  } else if (col === 'breakers') {
    const panels = inHome('panels', homeId);
    const qType = ['single', 'double', 'tandem', 'quad'].includes(q.get('btype')) ? q.get('btype') : '';
    const b = existing || { panelId: q.get('panel') || (panels[0] && panels[0].id), slot: q.get('slot') || '', poles: '1', amps: '20', label: '', rooms: [], kind: 'standard', notes: '', loads: [], ...(qType === 'tandem' || qType === 'quad' ? { size: 'half', btype: qType, half: q.get('half') === 'B' ? 'B' : 'A' } : {}) };
    const bt = breakerType(b);
    // adding into one empty half, or editing a half that already has its partner: no partner fields
    const lonelyHalf = (isNew && !!q.get('half')) || (!isNew && !!b.groupId);
    const mateAmps = AMP_OPTIONS.filter((a) => a !== 'other');
    title = isNew ? 'Add a breaker' : `Edit breaker ${slotText(b)}`;
    back = isNew ? `#/h/${homeId}/panel/${b.panelId || ''}` : `#/h/${homeId}/breaker/${id}`;
    fields = `
      ${panels.length > 1 ? `<label>Panel<select name="panelId">${opt(panels.map((p) => ({ value: p.id, label: p.name })), b.panelId)}</select></label>` : `<input type="hidden" name="panelId" value="${esc(b.panelId)}">`}
      <label>Breaker type<select name="btype">${opt(BTYPE_OPTIONS, bt)}</select></label>
      <label class="half-pick" hidden>Which half of the space<select name="half">${opt([{ value: 'A', label: 'Top half' }, { value: 'B', label: 'Bottom half' }], b.half === 'B' ? 'B' : 'A')}</select></label>
      <div class="two">
        <label>Space / slot #<input name="slot" required type="number" inputmode="numeric" min="1" max="84" value="${esc(b.slot)}"></label>
        <label>Amps<select name="amps" data-other="ampsOther">${opt(AMP_OPTIONS, b.amps)}</select></label>
      </div>
      <label class="other-field" ${b.amps === 'other' ? '' : 'hidden'}>Amps (other)<input name="ampsOther" type="number" inputmode="numeric" value="${esc(b.ampsOther || '')}"></label>
      ${(() => { const pn = byId('panels', b.panelId); return pn && pn.type === 'rv' && (pn.shorePower === '50' || pn.shorePower === 'pole') ? `<label>Leg (${pn.shorePower === 'pole' ? '240V service' : '50A service'})<select name="leg">${opt(LEG_OPTIONS, b.leg || '')}</select></label>` : ''; })()}
      <p class="tiny muted slot-hint">${(() => { const pn = byId('panels', b.panelId); if (numberingOf(pn) === 'half') return 'This panel has 2 numbers per space (1 and 3 share the first space on the left). A tandem gets both numbers; a full-size breaker uses the first.'; return layoutOf(pn) === 'one' ? 'This panel is stacked in one column: a double-pole breaker in space 1 also covers space 2.' : 'Spaces are numbered like most US panels: odd on the left, even on the right. A double-pole breaker in space 1 also covers space 3.'; })()}</p>
      <label>Label<input name="label" value="${esc(b.label)}" placeholder="e.g. Kitchen counter outlets"></label>
      <label>Room(s) it serves<input name="rooms" list="roomList" value="${esc((b.rooms || []).join(', '))}" placeholder="Separate with commas"></label>
      <div class="mate-fields" ${lonelyHalf ? 'data-lonely="1"' : ''} hidden>
        <p class="tiny muted mate-hint"></p>
        ${[1, 2].map((k) => `<div class="mate" data-k="${k}"><div class="mate-title"></div><div class="two"><label>Label<input name="m${k}label" placeholder="e.g. Bedroom 2"></label><label>Amps<select name="m${k}amps">${opt(mateAmps, k === 2 ? '15' : '20')}</select></label></div></div>`).join('')}
      </div>
      <label>Protection<select name="kind">${opt(BREAKER_KINDS, b.kind)}</select></label>
      <label>Notes<textarea name="notes" rows="3">${esc(b.notes)}</textarea></label>`;
  } else if (col === 'devices') {
    const brks = sortBreakers(inHome('breakers', homeId));
    const d = existing || { type: 'outlet', name: '', room: q.get('room') || '', location: '', breakerId: q.get('breaker') || '', gfci: 'unknown', afci: 'unknown', status: 'working', notes: '', readings: [] };
    title = isNew ? 'Add outlet / light / device' : `Edit ${d.name || 'item'}`;
    back = isNew ? (d.breakerId ? `#/h/${homeId}/breaker/${d.breakerId}` : `#/h/${homeId}/rooms`) : `#/h/${homeId}/device/${id}`;
    fields = `
      <label>Type<select name="type">${opt(DEVICE_TYPES.map((t) => ({ value: t.value, label: t.icon + ' ' + t.label })), d.type)}</select></label>
      <label>Name (optional)<input name="name" value="${esc(d.name)}" placeholder="e.g. Outlet by bed, Vanity light"></label>
      ${roomSelect(homeId, d.room)}
      <label>Location in the room<input name="location" value="${esc(d.location)}" placeholder="e.g. North wall by bed"></label>
      <label class="style-field" ${stylesFor(d.type) ? '' : 'hidden'}>Style <span class="muted">(what's there, or what you're putting in)</span><select name="style">${opt(stylesFor(d.type) || [], d.style || '')}</select></label>
      <label>Quantity<input name="qty" type="number" inputmode="numeric" min="1" step="1" value="${esc(String(qtyOf(d)))}"></label>
      <p class="tiny muted field-hint">One entry can stand for several, like "7 outlets, master bedroom".</p>
      <label>Box<select name="box">${opt(BOX_OPTIONS, d.box || '')}</select></label>
      <label>Needs replacing<select name="replace">${opt(REPLACE_OPTIONS, d.replace || '')}</select></label>
      <label>Breaker<select name="breakerId"><option value="">Not mapped yet</option>${brks.map((b) => `<option value="${b.id}" ${b.id === d.breakerId ? 'selected' : ''}>#${esc(slotText(b))} · ${esc(ampsText(b))} · ${esc(b.label || '')}</option>`).join('')}</select></label>
      <label>GFCI protection<select name="gfci">${opt(GFCI_OPTIONS, d.gfci)}</select></label>
      <label>AFCI protection<select name="afci">${opt(AFCI_OPTIONS, d.afci)}</select></label>
      <label>Status<select name="status">${opt(STATUS_OPTIONS, d.status)}</select></label>
      <label>Notes<textarea name="notes" rows="4" placeholder="Anything useful: wiring, what it controls, fixes...">${esc(d.notes)}</textarea></label>`;
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
      const cur = f.elements.mainAmps.value;
      const list = rv ? RV_MAIN_AMP_OPTIONS : MAIN_AMP_OPTIONS;
      f.elements.mainAmps.innerHTML = opt(list, list.includes(cur) ? cur : rv ? '30' : '200');
      if (rv && f.elements.spaces.value === '20' && isNew) f.elements.spaces.value = '6';
    });
  }
  if (col === 'breakers') {
    const sel = f.elements.btype;
    const box = f.querySelector('.mate-fields');
    const sync = () => {
      const t = sel.value;
      const pn = byId('panels', f.elements.panelId.value);
      const isGroup = t === 'tandem' || t === 'quad';
      const lonely = !!box.dataset.lonely && isGroup;
      f.querySelector('.half-pick').hidden = !(lonely && numberingOf(pn) !== 'half');
      box.hidden = !isGroup || lonely;
      const mainLabel = f.elements.label.closest('label');
      if (!mainLabel.dataset.text) mainLabel.dataset.text = mainLabel.firstChild.textContent;
      mainLabel.firstChild.textContent = mainLabel.dataset.text;
      if (box.hidden) return;
      const plan = groupPlan(t, f.elements.slot.value || '1', pn || 'two');
      const lab = (p) => slotLabel(p, pn || 'two');
      box.querySelector('.mate-hint').textContent = `The label above is the ${plan[0].role.toLowerCase()} (${lab(plan[0])}). ${t === 'tandem' ? 'Each half is its own circuit with its own name:' : 'Each part is its own circuit with its own name:'}`;
      box.querySelectorAll('.mate').forEach((el) => {
        const p = plan[Number(el.dataset.k)];
        el.hidden = !p;
        if (p) el.querySelector('.mate-title').textContent = `${p.role} · ${lab(p)}`;
      });
      mainLabel.firstChild.textContent = `Label (${plan[0].role.toLowerCase()} · ${lab(plan[0])})`;
    };
    sel.addEventListener('change', sync);
    f.elements.slot.addEventListener('input', sync);
    if (f.elements.panelId.tagName === 'SELECT') f.elements.panelId.addEventListener('change', sync);
    sync();
  }
  if (col === 'devices') {
    const rs = f.elements.room;
    const tog = () => (f.elements.roomNew.closest('label').hidden = rs.value !== '__new');
    rs.addEventListener('change', () => { tog(); if (rs.value === '__new') f.elements.roomNew.focus(); });
    tog();
    const ts = f.elements.type;
    ts.addEventListener('change', () => {
      const list = stylesFor(ts.value);
      const sf = f.querySelector('.style-field');
      sf.hidden = !list;
      f.elements.style.innerHTML = opt(list || [], '');
    });
  }
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
    if (col === 'panels') next = { ...base, homeId, name: v.name.trim(), type: v.type, layout: v.layout, mainAmps: v.mainAmps, mainAmpsOther: v.mainAmpsOther || '', spaces: v.spaces, spacesOther: v.spacesOther || '', shorePower: v.type === 'rv' ? v.shorePower : '', shorePowerOther: v.shorePowerOther || '', powerSource: v.type === 'rv' ? '' : (v.powerSource || ''), sourceAmps: v.type === 'rv' ? '' : (v.sourceAmps || ''), sourceAmpsOther: v.sourceAmpsOther || '', location: v.location.trim(), notes: v.notes, numbering: v.numbering === 'half' ? 'half' : 'space', fuses: base.fuses || [] };
    if (col === 'breakers') {
      const panelId = v.panelId;
      const slot = String(parseInt(v.slot, 10));
      const pn = byId('panels', panelId) || 'two';
      const t = v.btype || 'single';
      const isGroup = t === 'tandem' || t === 'quad';
      const makeGroup = isGroup && !(isNew ? q.get('half') : base.groupId);
      const plan = makeGroup ? groupPlan(t, slot, pn) : [];
      let pos;
      if (makeGroup) pos = { slot: String(plan[0].slot), size: 'half', half: plan[0].half, poles: plan[0].poles };
      else if (isGroup) pos = { slot, size: 'half', half: numberingOf(pn) === 'half' ? base.half || 'A' : v.half || base.half || 'A', poles: base.size === 'half' && base.btype === t ? base.poles || '1' : '1' };
      else pos = { slot, size: 'full', half: '', poles: t === 'double' ? '2' : '1' };
      const groupId = makeGroup ? 'g_' + uid() : isGroup ? base.groupId || '' : '';
      const mates = plan.slice(1).map((p, i) => ({
        id: 'b_' + uid(), createdAt: Date.now(), homeId, panelId, slot: String(p.slot), size: 'half', half: p.half, poles: p.poles, btype: t, groupId,
        amps: v[`m${i + 1}amps`] || '15', ampsOther: '', label: (v[`m${i + 1}label`] || '').trim(), leg: '', rooms: [], kind: 'standard', notes: '', loads: [],
      }));
      const others = inHome('breakers', homeId).filter((o) => o.id !== base.id && o.panelId === panelId && !(groupId && o.groupId === groupId));
      const clash = [{ ...pos }, ...mates].map((m) => others.find((o) => overlaps(o, m, pn))).find(Boolean);
      if (clash && !confirm(`That overlaps breaker ${slotText(clash)} (${clash.label || 'unlabeled'}). Save anyway?`)) return;
      next = { ...base, homeId, panelId, slot: pos.slot, poles: pos.poles, size: pos.size, half: pos.half, btype: t, groupId, amps: v.amps, ampsOther: v.ampsOther || '', label: v.label.trim(), leg: v.leg || base.leg || '', rooms: v.rooms.split(',').map((s) => s.trim()).filter(Boolean), kind: v.kind, notes: v.notes, loads: base.loads || [] };
      for (const m of mates) await store.put('breakers', m);
    }
    if (col === 'devices') next = { ...base, homeId, type: v.type, name: v.name.trim(), room: (v.room === '__new' ? v.roomNew : v.room).trim(), location: v.location.trim(), breakerId: v.breakerId, gfci: v.gfci, afci: v.afci, status: v.status, notes: v.notes, readings: base.readings || [], style: stylesFor(v.type) ? v.style || '' : '', qty: Math.max(1, Math.floor(Number(v.qty)) || 1), box: v.box || '', replace: v.replace || '' };
    if (col === 'customers') next = { ...base, name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim(), notes: v.notes, visits: base.visits || [], openCount: base.openCount || 0, lastOpenedAt: Date.now() };
    await store.put(col, next);
    toast('Saved');
    if (col === 'customers') return go(`#/customers/${next.id}`);
    if (col === 'homes') { setHome(next.id); if (isNew) return go(`#/edit/panels/new?home=${next.id}`); return go(`#/h/${next.id}/more`); }
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
