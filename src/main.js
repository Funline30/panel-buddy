import './styles.css';
import QRCode from 'qrcode';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { createLocalStore } from './store/local.js';
import {
  AMP_OPTIONS, POLE_OPTIONS, BREAKER_KINDS, DEVICE_TYPES, GFCI_OPTIONS, AFCI_OPTIONS, STATUS_OPTIONS,
  PANEL_TYPES, SPACE_OPTIONS, MAIN_AMP_OPTIONS, labelOf, deviceIcon,
} from './lib/options.js';
import { LOAD_PRESETS, PRESET_NOTE } from './lib/presets.js';
import { loadSummary, levelText, fmtAmps } from './lib/load.js';
import { search, breakerSlots } from './lib/search.js';
import { uid, esc, slotText, ampsText, sortBreakers, download } from './lib/util.js';
import { breakersCsv, devicesCsv } from './lib/csv.js';
import { compressPhoto } from './lib/photo.js';

const app = document.getElementById('app');
const MODE_KEY = 'panelbuddy:mode';
const HOME_KEY = 'panelbuddy:home';
let store;
let pendingRoute = null;

// ---------------------------------------------------------------- startup
async function start() {
  const wantDemo = localStorage.getItem(MODE_KEY) === 'demo' || /[?&]demo=1/.test(location.search);
  if (isFirebaseConfigured() && !wantDemo) {
    app.innerHTML = `<div class="center-msg">Loading Panel Buddy...</div>`;
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
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ---------------------------------------------------------------- helpers
const D = () => store.data || { homes: [], panels: [], breakers: [], devices: [] };
const byId = (col, id) => D()[col].find((x) => x.id === id);
const inHome = (col, homeId) => D()[col].filter((x) => x.homeId === homeId);
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
    ['panel', '▦', 'Panel', `#/h/${homeId}/panel`],
    ['rooms', '⌂', 'Rooms', `#/h/${homeId}/rooms`],
    ['search', '⌕', 'Search', `#/h/${homeId}/search`],
    ['load', '⚡', 'Load', `#/h/${homeId}/load`],
    ['more', '☰', 'More', `#/h/${homeId}/more`],
  ];
  return `
  ${store.mode === 'demo' ? `<div class="demo-banner">Demo mode: saved on this device only${isFirebaseConfigured() ? ' · <a href="#/login">Sign in to sync</a>' : ''}</div>` : ''}
  <header class="topbar">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="Back">‹</a>` : `<span class="logo" aria-hidden="true">⚡</span>`}
    <div class="topbar-title">
      ${title ? `<h1>${esc(title)}</h1>` : `<label class="sr-only" for="homePick">Home</label>
      <select id="homePick" class="home-pick">${homes.map((h) => `<option value="${esc(h.id)}" ${h.id === homeId ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}<option value="__new">+ Add a home...</option></select>`}
    </div>
  </header>
  <main id="main" class="main">${body}</main>
  <nav class="bottomnav" aria-label="Sections">
    ${nav.map(([k, ic, l, h]) => `<a href="${h}" class="${active === k ? 'active' : ''}" ${active === k ? 'aria-current="page"' : ''}><span aria-hidden="true">${ic}</span>${l}</a>`).join('')}
  </nav>`;
  void home;
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

  if (store.mode === 'cloud' && !store.user) {
    if (parts[0] === 'h') pendingRoute = location.hash;
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
  if (parts[0] === 'edit') return renderEdit(parts[1], parts[2], q);

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
    if (view === 'search') return renderSearch(homeId, q.get('q') || '');
    if (view === 'load') return renderLoad(homeId);
    if (view === 'more') return renderMore(homeId);
    if (view === 'print') return renderPrint(homeId, parts[3], parts[4], q);
  } catch (e) {
    console.error(e);
  }
  return renderNotFound();
}

function renderNotFound() {
  const homeId = currentHomeId();
  app.innerHTML = shell(homeId, '', `<div class="card empty"><h2>Not found</h2><p>That item isn't in this account. It may have been deleted, or it belongs to someone else's Panel Buddy.</p><a class="btn" href="#/">Go to my panel</a></div>`, { title: 'Not found', back: '#/' });
  bindShell();
}

// ---------------------------------------------------------------- login
function renderLogin() {
  const cloud = store.mode === 'cloud';
  app.innerHTML = `
  <div class="auth">
    <div class="auth-logo" aria-hidden="true">⚡</div>
    <h1>Panel Buddy</h1>
    <p class="muted">Map your breaker panel, every outlet and light, QR stickers and load checks. Free, no ads.</p>
    ${isFirebaseConfigured() ? `
    <form id="authForm" class="card form">
      <label>Email<input type="email" name="email" autocomplete="email" required inputmode="email"></label>
      <label>Password<input type="password" name="pw" autocomplete="current-password" required minlength="6"></label>
      <label>I want to
        <select name="action"><option value="in">Sign in</option><option value="up">Create a free account</option><option value="reset">Reset my password</option></select>
      </label>
      <button class="btn primary" type="submit">Continue</button>
      <p class="err" id="authErr" role="alert"></p>
    </form>` : `<div class="card"><p>Accounts aren't switched on yet for this copy of Panel Buddy. You can use the demo below; it saves on this device.</p></div>`}
    <button class="btn ghost" id="demoBtn">${cloud ? 'Try the demo without an account' : 'Back to the demo'}</button>
    <p class="tiny muted">Your data is private to your account. No ads, no trackers.</p>
  </div>`;
  const f = document.getElementById('authForm');
  if (f) {
    const actionSel = f.elements.action;
    actionSel.onchange = () => {
      f.elements.pw.required = actionSel.value !== 'reset';
      f.elements.pw.autocomplete = actionSel.value === 'up' ? 'new-password' : 'current-password';
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
        else if (actionSel.value === 'up') await store.signUp(email, pw);
        else {
          await store.resetPassword(email);
          err.textContent = 'Check your email for a reset link.';
        }
      } catch (ex) {
        err.textContent = friendlyAuthError(ex);
      }
    };
  }
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
  app.innerHTML = `<div class="auth"><div class="auth-logo" aria-hidden="true">⚡</div><h1>Welcome to Panel Buddy</h1>
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
  const spaces = Math.max(parseInt(panel.spaces, 10) || 20, ...breakers.flatMap((b) => breakerSlots(b)));
  const rows = Math.ceil(spaces / 2);
  const covered = new Set();
  const cells = [];
  for (const b of sortBreakers(breakers)) {
    const slots = breakerSlots(b);
    if (!slots.length) continue;
    slots.forEach((s) => covered.add(s));
    const s0 = slots[0];
    const col = s0 % 2 === 1 ? 1 : 2;
    const row = Math.ceil(s0 / 2);
    const sum = loadSummary(b);
    const nDev = devices.filter((d) => d.breakerId === b.id).length;
    const dead = devices.some((d) => d.breakerId === b.id && (d.status === 'dead' || d.status === 'repair'));
    cells.push(`<a class="brk ${b.kind === 'spare' ? 'spare' : ''} lvl-${sum.level}" href="#/h/${homeId}/breaker/${b.id}" style="grid-column:${col};grid-row:${row} / span ${slots.length}">
      <span class="brk-slot">${esc(slotText(b))}</span>
      <span class="brk-handle ${col === 2 ? 'right' : ''}">${esc(ampsText(b))}</span>
      <span class="brk-label">${esc(b.label || 'Unlabeled')}</span>
      <span class="brk-meta">${[nDev ? `${nDev} item${nDev > 1 ? 's' : ''}` : '', sum.level !== 'none' ? `${Math.round(sum.pct)}%` : '', dead ? '<b class="bad">needs fix</b>' : '', b.kind && b.kind !== 'standard' && b.kind !== 'spare' ? esc(b.kind.toUpperCase()) : ''].filter(Boolean).join(' · ')}</span>
    </a>`);
  }
  for (let s = 1; s <= spaces; s++) {
    if (covered.has(s)) continue;
    const col = s % 2 === 1 ? 1 : 2;
    const row = Math.ceil(s / 2);
    cells.push(`<a class="brk empty-slot" href="#/edit/breakers/new?home=${homeId}&panel=${panel.id}&slot=${s}" style="grid-column:${col};grid-row:${row}" aria-label="Add breaker in space ${s}"><span class="brk-slot">${s}</span><span class="brk-label">+ Add</span></a>`);
  }
  const over = breakers.filter((b) => loadSummary(b).level === 'over').length;
  const warn = breakers.filter((b) => loadSummary(b).level === 'warn').length;
  const body = `
  <section class="panel-head">
    <div>
      ${panels.length > 1 ? `<label class="sr-only" for="panelPick">Panel</label><select id="panelPick" class="panel-pick">${panels.map((p) => `<option value="${p.id}" ${p.id === panel.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : `<h2>${esc(panel.name)}</h2>`}
      <p class="muted">${esc(labelOf(PANEL_TYPES, panel.type))}${panel.mainAmps ? ` · ${esc(panel.mainAmps === 'other' ? panel.mainAmpsOther : panel.mainAmps)}A main` : ''} · ${breakers.length} breakers${panel.location ? ` · ${esc(panel.location)}` : ''}</p>
    </div>
    <div class="head-actions">
      <a class="btn small" href="#/edit/panels/${panel.id}?home=${homeId}">Edit</a>
    </div>
  </section>
  ${over || warn ? `<a class="alert ${over ? 'over' : 'warn'}" href="#/h/${homeId}/load">${over ? `${over} circuit${over > 1 ? 's' : ''} over 100%` : ''}${over && warn ? ' · ' : ''}${warn ? `${warn} at 80%+` : ''} - see Load check</a>` : ''}
  <div class="panel-box">
    <div class="panel-main">MAIN ${esc(panel.mainAmps === 'other' ? panel.mainAmpsOther || '' : panel.mainAmps || '')}${panel.mainAmps ? 'A' : ''}</div>
    <div class="panel-grid" style="grid-template-rows:repeat(${rows}, minmax(64px, auto))">${cells.join('')}</div>
  </div>
  <div class="row-actions">
    <a class="btn" href="#/edit/breakers/new?home=${homeId}&panel=${panel.id}">+ Breaker</a>
    <a class="btn" href="#/edit/panels/new?home=${homeId}">+ Panel</a>
    <a class="btn" href="#/h/${homeId}/print/directory/${panel.id}">Print label</a>
  </div>
  <div class="legend"><span class="dot lvl-ok"></span>under 80% <span class="dot lvl-warn"></span>80%+ <span class="dot lvl-over"></span>over 100% <span class="dot lvl-none"></span>no loads listed</div>
  <div id="panelExtra"></div>`;
  app.innerHTML = shell(homeId, 'panel', body);
  bindShell();
  const pp = document.getElementById('panelPick');
  if (pp) pp.onchange = () => go(`#/h/${homeId}/panel/${pp.value}`);
  renderPanelExtra(homeId, panel);
}

async function renderPanelExtra(homeId, panel) {
  const el = document.getElementById('panelExtra');
  if (!el) return;
  const svg = await qrSvg(deepLink(`/h/${homeId}/panel/${panel.id}`));
  const photo = panel.photoId ? await store.getPhoto(panel.photoId) : null;
  if (!document.getElementById('panelExtra')) return;
  el.innerHTML = `
    ${photo ? `<div class="card"><h3>Panel photo</h3><img class="photo" src="${photo}" alt="Photo of ${esc(panel.name)}"></div>` : ''}
    ${panel.notes ? `<div class="card"><h3>Notes</h3><p class="pre">${esc(panel.notes)}</p></div>` : ''}
    <div class="card qr-card"><div class="qr">${svg}</div><div><h3>Panel QR code</h3><p class="muted">Stick it on the panel door. Scanning it opens this panel.</p><a class="btn small" href="#/h/${homeId}/print/qr?only=panel:${panel.id}">Print sticker</a></div></div>`;
}

// ---------------------------------------------------------------- breaker view
function renderBreaker(homeId, id) {
  const b = byId('breakers', id);
  if (!b || b.homeId !== homeId) return renderNotFound();
  const panel = byId('panels', b.panelId);
  const devices = inHome('devices', homeId).filter((d) => d.breakerId === b.id);
  const s = loadSummary(b);
  const body = `
  <section class="detail-head">
    <div class="big-slot">${esc(slotText(b))}</div>
    <div>
      <h2>${esc(b.label || 'Unlabeled breaker')}</h2>
      <p class="muted">${esc(ampsText(b))} · ${esc(labelOf(POLE_OPTIONS, b.poles))}${b.kind && b.kind !== 'standard' ? ` · ${esc(labelOf(BREAKER_KINDS, b.kind))}` : ''}${panel ? ` · ${esc(panel.name)}` : ''}</p>
      ${(b.rooms || []).length ? `<div class="chips">${b.rooms.map((r) => `<a class="chip" href="#/h/${homeId}/rooms?room=${encodeURIComponent(r)}">${esc(r)}</a>`).join('')}</div>` : ''}
    </div>
  </section>
  <div class="row-actions"><a class="btn" href="#/edit/breakers/${b.id}?home=${homeId}">Edit breaker</a><a class="btn" href="#/edit/devices/new?home=${homeId}&breaker=${b.id}">+ Outlet / light</a></div>
  ${b.notes ? `<div class="card"><h3>Notes</h3><p class="pre">${esc(b.notes)}</p></div>` : ''}

  <div class="card">
    <h3>What it feeds (${devices.length})</h3>
    ${devices.length ? `<ul class="list">${devices.map((d) => deviceRow(homeId, d)).join('')}</ul>` : `<p class="muted">Nothing mapped to this breaker yet.</p>`}
  </div>

  <div class="card" id="loads">
    <h3>Load check</h3>
    ${s.rating ? `
      <div class="load-num"><b>${fmtAmps(s.amps)}A</b> of ${s.rating}A <span class="muted">(${Math.round(s.watts)}W ÷ ${s.volts}V)</span></div>
      ${loadBar(s)}
      <p class="lvl-text ${s.level}">${esc(levelText(s.level))}. 80% of ${s.rating}A = ${fmtAmps(s.limit80)}A.</p>` : `<p class="muted">Set the breaker's amps to see the load check.</p>`}
    <ul class="list loads">${(b.loads || []).map((l, i) => `<li class="load-row"><span>${esc(l.name)}${Number(l.qty) > 1 ? ` ×${esc(l.qty)}` : ''}</span><span class="muted">${Math.round((Number(l.watts) || 0) * (Number(l.qty) || 1))}W</span><button class="icon-btn small" data-del-load="${i}" aria-label="Remove ${esc(l.name)}">✕</button></li>`).join('')}</ul>
    <form id="loadForm" class="form inline-form">
      <label>Add something plugged in
        <select name="preset"><option value="">Choose...</option>${LOAD_PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)} (~${p.watts}W)</option>`).join('')}<option value="custom">Custom...</option></select>
      </label>
      <div class="two">
        <label>Name<input name="name" placeholder="e.g. Space heater"></label>
        <label>Watts<input name="watts" type="number" inputmode="numeric" min="0" step="1" placeholder="1500"></label>
      </div>
      <label>How many<select name="qty">${opt(['1', '2', '3', '4', '5', '6', '8', '10'], '1')}</select></label>
      <button class="btn primary" type="submit">Add to this circuit</button>
      <p class="tiny muted">${esc(PRESET_NOTE)}</p>
    </form>
  </div>
  <div class="card qr-card"><div class="qr" id="qrBox"></div><div><h3>Breaker QR</h3><p class="muted">Scan to open this breaker.</p><a class="btn small" href="#/h/${homeId}/print/qr?only=breaker:${b.id}">Print sticker</a></div></div>`;
  app.innerHTML = shell(homeId, 'panel', body, { title: `Breaker ${slotText(b)}`, back: `#/h/${homeId}/panel/${b.panelId}` });
  bindShell();
  qrSvg(deepLink(`/h/${homeId}/breaker/${b.id}`)).then((svg) => {
    const el = document.getElementById('qrBox');
    if (el) el.innerHTML = svg;
  });
  const f = document.getElementById('loadForm');
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
  f.onsubmit = async (e) => {
    e.preventDefault();
    const name = f.elements.name.value.trim();
    const watts = Number(f.elements.watts.value);
    if (!name || !(watts > 0)) return toast('Add a name and watts');
    await store.put('breakers', { ...b, loads: [...(b.loads || []), { name, watts, qty: Number(f.elements.qty.value) || 1 }] });
    toast('Added');
  };
  app.querySelectorAll('[data-del-load]').forEach((btn) => {
    btn.onclick = async () => {
      const i = Number(btn.dataset.delLoad);
      const loads = [...(b.loads || [])];
      loads.splice(i, 1);
      await store.put('breakers', { ...b, loads });
    };
  });
}

function deviceRow(homeId, d, showBreaker = false) {
  const b = showBreaker ? byId('breakers', d.breakerId) : null;
  const bad = d.status === 'dead' || d.status === 'repair';
  return `<li><a class="row" href="#/h/${homeId}/device/${d.id}">
    <span class="row-icon" aria-hidden="true">${deviceIcon(d.type)}</span>
    <span class="row-main"><b>${esc(d.name || labelOf(DEVICE_TYPES, d.type))}</b><span class="muted">${esc([d.room, d.location].filter(Boolean).join(' · '))}</span></span>
    <span class="row-side">${showBreaker ? (b ? `<span class="pill">#${esc(slotText(b))}</span>` : '<span class="pill gray">?</span>') : ''}${bad ? `<span class="pill red">${esc(labelOf(STATUS_OPTIONS, d.status).split(' ')[0])}</span>` : ''}${d.gfci && !['no', 'unknown'].includes(d.gfci) ? '<span class="pill blue">GFCI</span>' : ''}</span>
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
  <div class="card">
    <dl class="facts">
      <dt>Type</dt><dd>${esc(labelOf(DEVICE_TYPES, d.type))}</dd>
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
  qrSvg(deepLink(`/h/${homeId}/device/${d.id}`)).then((svg) => {
    const el = document.getElementById('qrBox');
    if (el) el.innerHTML = svg;
  });
  if (d.photoId)
    store.getPhoto(d.photoId).then((src) => {
      const el = document.getElementById('photoBox');
      if (el) el.innerHTML = src ? `<img class="photo" src="${src}" alt="Photo of ${esc(d.name)}">` : 'Photo not available offline yet.';
    });
  bindPhoto('devices', d);
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
  <div class="section-head"><h2>${roomFilter ? esc(roomFilter) : 'Rooms'}</h2><a class="btn small primary" href="#/edit/devices/new?home=${homeId}${roomFilter ? `&room=${encodeURIComponent(roomFilter)}` : ''}">+ Add</a></div>
  ${roomFilter ? `<p><a href="#/h/${homeId}/rooms">‹ All rooms</a></p>` : `<label class="sr-only" for="roomJump">Jump to room</label><select id="roomJump" class="full"><option value="">Jump to a room...</option>${names.map((n) => `<option>${esc(n)}</option>`).join('')}</select>`}
  ${shown.length ? shown.map((r) => {
    const list = groups.get(r);
    const brks = [...new Set(list.map((d) => d.breakerId).filter(Boolean))].map((id) => byId('breakers', id)).filter(Boolean);
    return `<div class="card room-card"><div class="room-head"><h3>${esc(r)}</h3><span class="muted tiny">${brks.length ? 'Breaker' + (brks.length > 1 ? 's ' : ' ') + brks.map((b) => '#' + slotText(b)).join(', ') : ''}</span></div><ul class="list">${list.map((d) => deviceRow(homeId, d, true)).join('')}</ul></div>`;
  }).join('') : `<div class="card empty"><p>No outlets, lights or switches yet. Add one and pick its breaker.</p></div>`}`;
  app.innerHTML = shell(homeId, 'rooms', body);
  bindShell();
  const rj = document.getElementById('roomJump');
  if (rj) rj.onchange = () => rj.value && go(`#/h/${homeId}/rooms?room=${encodeURIComponent(rj.value)}`);
}

// ---------------------------------------------------------------- search
function renderSearch(homeId, query) {
  const body = `
  <form id="searchForm" class="search-box" role="search">
    <label class="sr-only" for="sq">Search</label>
    <input id="sq" type="search" value="${esc(query)}" placeholder="breaker 7, bathroom fan, gfci..." autocomplete="off" enterkeyhint="search">
  </form>
  <div class="chips examples">${['breaker 11', 'bathroom fan', 'dining', 'gfci', 'dead', '3D printer'].map((x) => `<button class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
  <div id="results"></div>`;
  app.innerHTML = shell(homeId, 'search', body);
  bindShell();
  const input = document.getElementById('sq');
  const run = () => {
    const qv = input.value;
    history.replaceState(null, '', `#/h/${homeId}/search${qv ? '?q=' + encodeURIComponent(qv) : ''}`);
    const data = { breakers: inHome('breakers', homeId), devices: inHome('devices', homeId), panels: inHome('panels', homeId) };
    const res = search(qv, data);
    const el = document.getElementById('results');
    if (!qv.trim()) return (el.innerHTML = `<p class="muted center">Try "what's on breaker 7" or "which breaker is the bathroom fan".</p>`);
    if (!res.length) return (el.innerHTML = `<p class="muted center">Nothing matches "${esc(qv)}".</p>`);
    el.innerHTML = `<ul class="list card">${res.map((r) => r.kind === 'breaker'
      ? `<li><a class="row" href="#/h/${homeId}/breaker/${r.item.id}"><span class="big-slot sm">${esc(slotText(r.item))}</span><span class="row-main"><b>${esc(r.item.label || 'Breaker')}</b><span class="muted">Breaker · ${esc(ampsText(r.item))} · ${esc((r.item.rooms || []).join(', '))}</span></span></a></li>`
      : deviceRow(homeId, r.item, true)).join('')}</ul>`;
  };
  input.oninput = run;
  document.getElementById('searchForm').onsubmit = (e) => { e.preventDefault(); input.blur(); };
  app.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => { input.value = b.dataset.ex; run(); }));
  run();
  if (!query) setTimeout(() => input.focus(), 50);
}

// ---------------------------------------------------------------- load check
function renderLoad(homeId) {
  const breakers = inHome('breakers', homeId).filter((b) => b.kind !== 'spare');
  const rows = breakers.map((b) => ({ b, s: loadSummary(b) })).sort((x, y) => y.s.pct - x.s.pct || (parseInt(x.b.slot, 10) - parseInt(y.b.slot, 10)));
  const over = rows.filter((r) => r.s.level === 'over').length;
  const warn = rows.filter((r) => r.s.level === 'warn').length;
  const body = `
  <div class="section-head"><h2>Load check</h2></div>
  <div class="card summary">
    <div><b class="${over ? 'bad' : ''}">${over}</b><span>over 100%</span></div>
    <div><b class="${warn ? 'warnc' : ''}">${warn}</b><span>at 80%+</span></div>
    <div><b>${rows.filter((r) => r.s.level === 'ok').length}</b><span>OK</span></div>
  </div>
  <p class="tiny muted">Amps = watts ÷ 120V (÷ 240V for double-pole). Loads that run 3+ hours should stay under 80% of the breaker. Tap a circuit to add what's plugged in.</p>
  <ul class="list load-list">${rows.map(({ b, s }) => `<li><a class="load-item" href="#/h/${homeId}/breaker/${b.id}#loads">
    <div class="load-top"><span class="big-slot sm">${esc(slotText(b))}</span><span class="row-main"><b>${esc(b.label || 'Breaker')}</b><span class="muted">${s.level === 'none' ? 'No loads listed yet' : `${fmtAmps(s.amps)}A of ${s.rating}A · ${Math.round(s.watts)}W`}</span></span><span class="pct ${s.level}">${s.level === 'none' ? '-' : Math.round(s.pct) + '%'}</span></div>
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
  <div class="section-head"><h2>More</h2></div>
  <div class="card">
    <h3>Print</h3>
    <div class="stack">
      ${panels.map((p) => `<a class="btn" href="#/h/${homeId}/print/directory/${p.id}">Panel door label: ${esc(p.name)}</a>`).join('')}
      <a class="btn" href="#/h/${homeId}/print/qr">QR sticker sheet</a>
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
  <div class="card">
    <h3>Backup &amp; export</h3>
    <div class="stack">
      <button class="btn" id="expJson">Download backup (JSON, everything)</button>
      <button class="btn" id="expBrk">Breakers spreadsheet (CSV)</button>
      <button class="btn" id="expDev">Outlets &amp; lights spreadsheet (CSV)</button>
      <label class="btn file-btn">Restore from backup (JSON)<input type="file" accept="application/json,.json" id="impJson" hidden></label>
      ${store.mode === 'cloud' && localStorage.getItem('panelbuddy:data:v1') ? '<button class="btn" id="impLocal">Copy demo data from this device into my account</button>' : ''}
    </div>
    <p class="tiny muted">For a PDF: open a print page and choose "Save as PDF" (Windows) or Share > Print > pinch out (iPhone).</p>
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
  <p class="tiny muted center">Panel Buddy · free, no ads, no trackers. Not a substitute for a licensed electrician; turn the breaker off and verify with a tester before touching wiring.</p>`;
  app.innerHTML = shell(homeId, 'more', body);
  bindShell();
  const $ = (id) => document.getElementById(id);
  $('expJson').onclick = async () => {
    const data = JSON.parse(JSON.stringify(D()));
    const photos = {};
    for (const c of ['panels', 'devices']) for (const it of data[c]) if (it.photoId) photos[it.photoId] = await store.getPhoto(it.photoId);
    download(`panel-buddy-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'panel-buddy', version: 1, exportedAt: new Date().toISOString(), ...data, photos }, null, 2));
  };
  $('expBrk').onclick = () => download('panel-buddy-breakers.csv', breakersCsv(D()), 'text/csv');
  $('expDev').onclick = () => download('panel-buddy-outlets-lights.csv', devicesCsv(D()), 'text/csv');
  $('impJson').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.homes)) throw new Error('Not a Panel Buddy backup');
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
  const photos = parsed.photos || {};
  for (const [id, dataUrl] of Object.entries(photos)) if (dataUrl) await store.putPhoto(id, dataUrl);
}

// ---------------------------------------------------------------- print
const STICKERS = {
  '5160': { label: 'Address labels 1" x 2-5/8" (30 per sheet, e.g. Avery 5160)', cls: 'st-5160', per: 30 },
  '22806': { label: '2" square stickers (12 per sheet, e.g. Avery 22806)', cls: 'st-22806', per: 12 },
  plain: { label: 'Plain paper, cut out (20 per page)', cls: 'st-plain', per: 20 },
};

async function renderPrint(homeId, kind, id, q) {
  const home = byId('homes', homeId);
  if (kind === 'directory') {
    const panel = byId('panels', id) || inHome('panels', homeId)[0];
    if (!panel) return renderNotFound();
    const size = q.get('size') || 'half';
    const breakers = inHome('breakers', homeId).filter((b) => b.panelId === panel.id);
    const spaces = Math.max(parseInt(panel.spaces, 10) || 20, ...breakers.flatMap((b) => breakerSlots(b)));
    const bySlot = new Map();
    for (const b of breakers) breakerSlots(b).forEach((s, i) => bySlot.set(s, { b, cont: i > 0 }));
    const rowsHtml = [];
    for (let r = 0; r < Math.ceil(spaces / 2); r++) {
      const L = r * 2 + 1, R = r * 2 + 2;
      const cell = (s) => {
        const e = bySlot.get(s);
        if (!e) return `<td class="n">${s}</td><td class="a"></td><td class="l"></td>`;
        if (e.cont) return `<td class="n">${s}</td><td class="a">″</td><td class="l cont">(${esc(slotText(e.b))}) ${esc(e.b.label || '')}</td>`;
        return `<td class="n">${s}</td><td class="a">${esc(ampsText(e.b))}</td><td class="l">${esc(e.b.label || '')}${(e.b.rooms || []).length && !(e.b.label || '').toLowerCase().includes(String(e.b.rooms[0]).toLowerCase()) ? ` <span class="rm">(${esc(e.b.rooms.join(', '))})</span>` : ''}</td>`;
      };
      rowsHtml.push(`<tr>${cell(L)}${cell(R)}</tr>`);
    }
    const body = `
    <div class="print-controls no-print">
      <label>Size<select id="dirSize">${opt([{ value: 'half', label: 'Half page (fits most panel doors)' }, { value: 'full', label: 'Full page 8.5 x 11' }], size)}</select></label>
      <button class="btn primary" id="doPrint">Print / Save as PDF</button>
    </div>
    <div class="sheet directory ${size}">
      <div class="dir-head"><b>${esc(panel.name)}</b> · ${esc(home.name)}${panel.mainAmps ? ` · Main ${esc(panel.mainAmps === 'other' ? panel.mainAmpsOther || '' : panel.mainAmps)}A` : ''}</div>
      <table class="dir-table"><thead><tr><th>#</th><th>A</th><th>Circuit</th><th>#</th><th>A</th><th>Circuit</th></tr></thead><tbody>${rowsHtml.join('')}</tbody></table>
      <div class="dir-foot">Updated ${new Date().toLocaleDateString()} · Panel Buddy</div>
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
      if (type === 'panel') items.push({ path: `/h/${homeId}/panel/${it.id}`, title: it.name, sub: `${home.name}${it.mainAmps ? ' · ' + it.mainAmps + 'A main' : ''}` });
      if (type === 'breaker') items.push({ path: `/h/${homeId}/breaker/${it.id}`, title: `Breaker ${slotText(it)} · ${ampsText(it)}`, sub: it.label || '' });
      if (type === 'device') {
        const b = byId('breakers', it.breakerId);
        items.push({ path: `/h/${homeId}/device/${it.id}`, title: `${it.room || ''} ${it.name ? '- ' + it.name : ''}`.trim(), sub: b ? `Breaker ${slotText(b)} · ${ampsText(b)}` : 'Breaker: ?' });
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
    const h = existing || { name: '', address: '', notes: '' };
    title = isNew ? 'Add a home' : 'Edit home';
    back = isNew ? '#/' : `#/h/${id}/more`;
    fields = `
      <label>Home name<input name="name" required value="${esc(h.name)}" placeholder="e.g. My house, Rental on 5th"></label>
      <label>Address (optional)<input name="address" value="${esc(h.address)}"></label>
      <label>Notes<textarea name="notes" rows="3">${esc(h.notes)}</textarea></label>`;
  } else if (col === 'panels') {
    const p = existing || { name: inHome('panels', homeId).length ? 'Sub-panel' : 'Main panel', type: inHome('panels', homeId).length ? 'sub' : 'main', mainAmps: '200', spaces: '20', location: '', notes: '' };
    title = isNew ? 'Add a panel' : 'Edit panel';
    back = isNew ? `#/h/${homeId}/panel` : `#/h/${homeId}/panel/${id}`;
    photo = !isNew;
    fields = `
      <label>Panel name<input name="name" required value="${esc(p.name)}"></label>
      <label>Type<select name="type">${opt(PANEL_TYPES, p.type)}</select></label>
      <div class="two">
        <label>Main breaker amps<select name="mainAmps" data-other="mainAmpsOther">${opt(MAIN_AMP_OPTIONS, p.mainAmps)}</select></label>
        <label>Breaker spaces<select name="spaces">${opt(SPACE_OPTIONS, p.spaces)}</select></label>
      </div>
      <label class="other-field" ${p.mainAmps === 'other' ? '' : 'hidden'}>Main amps (other)<input name="mainAmpsOther" type="number" inputmode="numeric" value="${esc(p.mainAmpsOther || '')}"></label>
      <label>Where is it?<input name="location" value="${esc(p.location)}" placeholder="e.g. Garage, north wall"></label>
      <label>Notes<textarea name="notes" rows="3">${esc(p.notes)}</textarea></label>`;
  } else if (col === 'breakers') {
    const panels = inHome('panels', homeId);
    const b = existing || { panelId: q.get('panel') || (panels[0] && panels[0].id), slot: q.get('slot') || '', poles: '1', amps: '20', label: '', rooms: [], kind: 'standard', notes: '', loads: [] };
    title = isNew ? 'Add a breaker' : `Edit breaker ${slotText(b)}`;
    back = isNew ? `#/h/${homeId}/panel/${b.panelId || ''}` : `#/h/${homeId}/breaker/${id}`;
    fields = `
      ${panels.length > 1 ? `<label>Panel<select name="panelId">${opt(panels.map((p) => ({ value: p.id, label: p.name })), b.panelId)}</select></label>` : `<input type="hidden" name="panelId" value="${esc(b.panelId)}">`}
      <div class="two">
        <label>Space / slot #<input name="slot" required type="number" inputmode="numeric" min="1" max="84" value="${esc(b.slot)}"></label>
        <label>Amps<select name="amps" data-other="ampsOther">${opt(AMP_OPTIONS, b.amps)}</select></label>
      </div>
      <label class="other-field" ${b.amps === 'other' ? '' : 'hidden'}>Amps (other)<input name="ampsOther" type="number" inputmode="numeric" value="${esc(b.ampsOther || '')}"></label>
      <label>Poles<select name="poles">${opt(POLE_OPTIONS, b.poles)}</select></label>
      <p class="tiny muted">Spaces are numbered like most US panels: odd on the left, even on the right. A double-pole breaker in space 1 also covers space 3.</p>
      <label>Label<input name="label" value="${esc(b.label)}" placeholder="e.g. Kitchen counter outlets"></label>
      <label>Room(s) it serves<input name="rooms" list="roomList" value="${esc((b.rooms || []).join(', '))}" placeholder="Separate with commas"></label>
      <label>Breaker type<select name="kind">${opt(BREAKER_KINDS, b.kind)}</select></label>
      <label>Notes<textarea name="notes" rows="3">${esc(b.notes)}</textarea></label>`;
  } else if (col === 'devices') {
    const brks = sortBreakers(inHome('breakers', homeId));
    const d = existing || { type: 'outlet', name: '', room: q.get('room') || '', location: '', breakerId: q.get('breaker') || '', gfci: 'unknown', afci: 'unknown', status: 'working', notes: '', readings: [] };
    title = isNew ? 'Add outlet / light / device' : `Edit ${d.name || 'item'}`;
    back = isNew ? (d.breakerId ? `#/h/${homeId}/breaker/${d.breakerId}` : `#/h/${homeId}/rooms`) : `#/h/${homeId}/device/${id}`;
    fields = `
      <label>Type<select name="type">${opt(DEVICE_TYPES.map((t) => ({ value: t.value, label: t.icon + ' ' + t.label })), d.type)}</select></label>
      <label>Name (optional)<input name="name" value="${esc(d.name)}" placeholder="e.g. Outlet by bed, Vanity light"></label>
      <label>Room<input name="room" list="roomList" required value="${esc(d.room)}" placeholder="e.g. Master bedroom"></label>
      <label>Location in the room<input name="location" value="${esc(d.location)}" placeholder="e.g. North wall by bed"></label>
      <label>Breaker<select name="breakerId"><option value="">Not mapped yet</option>${brks.map((b) => `<option value="${b.id}" ${b.id === d.breakerId ? 'selected' : ''}>#${esc(slotText(b))} · ${esc(ampsText(b))} · ${esc(b.label || '')}</option>`).join('')}</select></label>
      <label>GFCI protection<select name="gfci">${opt(GFCI_OPTIONS, d.gfci)}</select></label>
      <label>AFCI protection<select name="afci">${opt(AFCI_OPTIONS, d.afci)}</select></label>
      <label>Status<select name="status">${opt(STATUS_OPTIONS, d.status)}</select></label>
      <label>Notes<textarea name="notes" rows="4" placeholder="Anything useful: wiring, what it controls, fixes...">${esc(d.notes)}</textarea></label>`;
  } else return renderNotFound();

  const body = `
  <form id="editForm" class="card form">${fields}${roomList}
    <div class="row-actions"><button class="btn primary" type="submit">Save</button><a class="btn ghost" href="${back}">Cancel</a></div>
  </form>
  ${photo ? `<div class="card"><h3>Panel photo (optional)</h3><div id="photoBox" class="muted">${existing.photoId ? 'Loading...' : 'No photo.'}</div><label class="btn small file-btn">${existing.photoId ? 'Replace photo' : 'Add photo'}<input type="file" accept="image/*" id="photoIn" hidden></label>${existing.photoId ? '<button class="btn small ghost" id="photoDel">Remove photo</button>' : ''}</div>` : ''}
  ${!isNew ? `<button class="btn danger full" id="delBtn">Delete ${col === 'homes' ? 'home and everything in it' : col === 'panels' ? 'panel and its breakers' : col === 'breakers' ? 'breaker' : 'item'}</button>` : ''}`;
  app.innerHTML = shell(homeId, '', body, { title, back });
  bindShell();
  const f = document.getElementById('editForm');
  f.querySelectorAll('select[data-other]').forEach((sel) => {
    sel.onchange = () => {
      const lab = f.querySelector(`[name=${sel.dataset.other}]`).closest('label');
      lab.hidden = sel.value !== 'other';
    };
  });
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
    if (col === 'homes') next = { ...base, name: v.name.trim(), address: v.address.trim(), notes: v.notes };
    if (col === 'panels') next = { ...base, homeId, name: v.name.trim(), type: v.type, mainAmps: v.mainAmps, mainAmpsOther: v.mainAmpsOther || '', spaces: v.spaces, location: v.location.trim(), notes: v.notes };
    if (col === 'breakers') {
      const panelId = v.panelId;
      const slot = String(parseInt(v.slot, 10));
      const poles = v.poles;
      const mine = breakerSlots({ slot, poles });
      const clash = inHome('breakers', homeId).find((o) => o.id !== base.id && o.panelId === panelId && breakerSlots(o).some((s) => mine.includes(s)));
      if (clash && !confirm(`Space ${slot} overlaps breaker ${slotText(clash)} (${clash.label || 'unlabeled'}). Save anyway?`)) return;
      next = { ...base, homeId, panelId, slot, poles, amps: v.amps, ampsOther: v.ampsOther || '', label: v.label.trim(), rooms: v.rooms.split(',').map((s) => s.trim()).filter(Boolean), kind: v.kind, notes: v.notes, loads: base.loads || [] };
    }
    if (col === 'devices') next = { ...base, homeId, type: v.type, name: v.name.trim(), room: v.room.trim(), location: v.location.trim(), breakerId: v.breakerId, gfci: v.gfci, afci: v.afci, status: v.status, notes: v.notes, readings: base.readings || [] };
    await store.put(col, next);
    toast('Saved');
    if (col === 'homes') { setHome(next.id); if (isNew) return go(`#/edit/panels/new?home=${next.id}`); return go(`#/h/${next.id}/more`); }
    if (col === 'panels') return go(`#/h/${homeId}/panel/${next.id}`);
    if (col === 'breakers') return go(`#/h/${homeId}/breaker/${next.id}`);
    if (col === 'devices') return go(`#/h/${homeId}/device/${next.id}`);
  };
  const del = document.getElementById('delBtn');
  if (del)
    del.onclick = async () => {
      if (!confirm('Delete? This cannot be undone.')) return;
      if (col === 'homes') {
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
