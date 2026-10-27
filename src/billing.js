// Browser side of Breakerly plans: ask our server what plan this account has, start Stripe
// Checkout, open the customer portal. Works without any of it set up: the plan is "free",
// checkout shows "coming soon", and nothing else in the app changes.
import { isNativeApp } from './native.js';
import { isTwaLaunch, checkoutAllowed, isPaidPlan } from './lib/plans.js';

const CACHE_KEY = 'ampmap:plan';
const TWA_KEY = 'ampmap:twa';
let state = readCache();
let enabled = false;
let lifetimeOn = false;
let checked = false;
const listeners = new Set();

function readCache() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return v && v.plan ? v : { plan: 'free' };
  } catch {
    return { plan: 'free' };
  }
}

// Android Play app (TWA): remember for this tab only, so the same phone's Chrome still sees checkout.
export function inStoreApp() {
  try {
    if (isTwaLaunch(document.referrer, location.search)) sessionStorage.setItem(TWA_KEY, '1');
    return isNativeApp() || sessionStorage.getItem(TWA_KEY) === '1';
  } catch {
    return isNativeApp();
  }
}
export const canBuyHere = () => checkoutAllowed({ native: isNativeApp(), twa: inStoreApp() });

export const plan = () => state;
export const isPaid = () => isPaidPlan(state);
export const checkoutEnabled = () => enabled;
export const lifetimeEnabled = () => enabled && lifetimeOn;
export const planChecked = () => checked;
export function onPlan(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Demo mode and the iPhone app's local files have no /api: fetch fails -> free / coming soon.
const apiBase = () => (isNativeApp() ? 'https://panel-buddy.vercel.app' : '');

async function call(store, path, method = 'GET', body) {
  const token = store && store.idToken ? await store.idToken().catch(() => '') : '';
  const res = await fetch(apiBase() + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw Object.assign(new Error('not set up'), { comingSoon: true });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || 'Something went wrong'), { comingSoon: data.error === 'coming_soon', data });
  return data;
}

const DEMO_KEY = 'ampmap:demoPro';
const snapshot = () => JSON.stringify({ state, enabled, checked });

// Demo mode only (no account, nothing is bought): let people preview what Pro looks like.
export function setDemoPlan(on) {
  try {
    if (on) sessionStorage.setItem(DEMO_KEY, '1');
    else sessionStorage.removeItem(DEMO_KEY);
  } catch { /* ignore */ }
}

export async function refreshPlan(store) {
  const before = snapshot();
  if (!store || store.mode !== 'cloud' || !store.user) {
    let demo = false;
    try { demo = store && store.mode === 'demo' && sessionStorage.getItem(DEMO_KEY) === '1'; } catch { /* ignore */ }
    state = demo ? { plan: 'pro', interval: 'month', status: 'active', demo: true } : { plan: 'free' };
    enabled = false;
    checked = true;
  } else {
    try {
      const data = await call(store, '/api/billing/status');
      enabled = !!data.enabled;
      lifetimeOn = !!data.lifetime;
      if (data.signedIn !== false) {
        state = { plan: data.plan || 'free', status: data.status || '', interval: data.interval || '', seats: data.seats || 0, periodEnd: data.periodEnd || 0, trialEnd: data.trialEnd || 0, cancelAtPeriodEnd: !!data.cancelAtPeriodEnd, comp: !!data.comp };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
      }
    } catch {
      enabled = false; // offline or not deployed: keep the last known plan
    }
    checked = true;
  }
  if (snapshot() !== before) listeners.forEach((cb) => cb(state));
  return state;
}

export async function startCheckout(store, planKey, techs) {
  if (!canBuyHere()) throw new Error('Upgrades are not available in the app.');
  const data = await call(store, '/api/billing/checkout', 'POST', { plan: planKey, techs });
  if (data.url) location.href = data.url;
  return data;
}

// Company plan: change how many techs it covers (Stripe charges for techs - 2).
export async function changeTechs(store, techs) {
  const data = await call(store, '/api/billing/seats', 'POST', { techs });
  await refreshPlan(store);
  return data;
}

export async function openPortal(store) {
  const data = await call(store, '/api/billing/portal', 'POST', {});
  if (data.url) location.href = data.url;
  return data;
}

export function clearPlanCache() {
  state = { plan: 'free' };
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

// ---- AI panel scan (Pro). GET = is it on + scans left; POST = read one photo.
export async function scanStatus(store) {
  if (!store || store.mode !== 'cloud' || !store.user) return { enabled: false, signedIn: false };
  try {
    return await call(store, '/api/scan-panel');
  } catch {
    return { enabled: false, signedIn: true };
  }
}

export async function aiScanPhoto(store, dataUrl) {
  const m = /^data:(image\/[a-z]+);base64,/.exec(String(dataUrl || ''));
  const mimeType = m ? m[1] : 'image/jpeg';
  return call(store, '/api/scan-panel', 'POST', { image: String(dataUrl || '').replace(/^data:[^,]*,/, ''), mimeType });
}
