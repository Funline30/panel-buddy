// AmpMap plans: what is free, what Pro adds, and the small rules the app and the server share.
// Pure functions only (no DOM, no network) so they run in tests and in the Vercel functions.
//
//  Homeowner (free)  - everything AmpMap does today stays free, forever. No ads.
//  Pro               - $1.99 a month or $14.99 a year. Adds extras on top (PRO_FEATURES).
//  Company           - free for 1-2 techs. 3+ techs: 30 days free, then $5 a month for each tech
//                      after the first 2 (3 techs = $5, 4 = $10). Stripe quantity = techs - 2.
//                      Includes everything in Pro for the account that pays.
//  VIP               - family and friends get Pro free: add their email to config/vip.js.

export const FREE_TECHS = 2;
export const TRIAL_DAYS = 30;

export const PLANS = {
  pro_monthly: { key: 'pro_monthly', plan: 'pro', lookupKey: 'ampmap_pro_monthly', amount: 199, interval: 'month', label: 'Pro monthly', price: '$1.99', per: '/month' },
  pro_yearly: { key: 'pro_yearly', plan: 'pro', lookupKey: 'ampmap_pro_yearly', amount: 1499, interval: 'year', label: 'Pro yearly', price: '$14.99', per: '/year', note: 'Save 37%' },
  company: { key: 'company', plan: 'company', lookupKey: 'ampmap_company_seat_monthly', amount: 500, interval: 'month', label: 'Company', price: '$5', per: '/tech/month after 2', perSeat: true, trialDays: TRIAL_DAYS },
};

// Pro is additive: nothing here was free before. Each id is what can() checks.
export const PRO_FEATURES = [
  { id: 'printName', icon: '🖨️', title: 'Your name on printouts', text: 'Your name or company and phone on printed panel schedules and shopping lists, in place of "AmpMap".' },
  { id: 'accent', icon: '🎨', title: 'Accent colors', text: 'Pick the app color: blue, green, purple, red or teal.' },
  { id: 'badge', icon: '⭐', title: 'Pro badge', text: 'A Pro badge in the app. You keep AmpMap free and ad-free for everyone.' },
  { id: 'support', icon: '✉️', title: 'Priority support', text: 'Email us and you go to the front of the line.' },
];

export const FREE_FEATURES = [
  'Unlimited homes, panels, breakers, outlets and lights',
  'Floor plan, rooms, load checks, device search',
  'QR stickers, printing, sharing and edit codes',
  'Backups and spreadsheets',
  'No ads, ever',
];

export const ACCENTS = [
  { value: 'amber', label: 'Amber (standard)', brand: '', ink: '' },
  { value: 'blue', label: 'Blue', brand: '#2563eb', ink: '#ffffff' },
  { value: 'green', label: 'Green', brand: '#16a34a', ink: '#ffffff' },
  { value: 'purple', label: 'Purple', brand: '#7c3aed', ink: '#ffffff' },
  { value: 'red', label: 'Red', brand: '#dc2626', ink: '#ffffff' },
  { value: 'teal', label: 'Teal', brand: '#0d9488', ink: '#ffffff' },
];
export const accentOf = (v) => ACCENTS.find((a) => a.value === v) || ACCENTS[0];

export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

export function isVip(email, list) {
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) return false;
  return (list || []).some((x) => normalizeEmail(x) === e);
}

// Stripe subscription statuses that unlock Pro. past_due keeps Pro while Stripe retries the card.
export const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];

// The plan record the server sends back (and the webhook stores in billing/{uid}).
export function planFromSubscription(sub) {
  if (!sub || typeof sub !== 'object') return { plan: 'free' };
  const item = (sub.items && sub.items.data && sub.items.data[0]) || {};
  const price = item.price || {};
  const meta = sub.metadata || {};
  const lookup = price.lookup_key || '';
  const plan = meta.plan === 'company' || /company/.test(lookup) ? 'company' : 'pro';
  const live = ACTIVE_STATUSES.includes(sub.status);
  return {
    plan: live ? plan : 'free',
    status: sub.status || '',
    interval: (price.recurring && price.recurring.interval) || '',
    // seats = techs covered (Stripe quantity + the 2 free ones); billable = what Stripe charges for.
    seats: plan === 'company' ? techsFromQuantity(item.quantity || sub.quantity) : 0,
    billable: plan === 'company' ? Number(item.quantity || sub.quantity || 0) : 0,
    customerId: typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || '',
    subscriptionId: sub.id || '',
    periodEnd: Number(item.current_period_end || sub.current_period_end || 0) || 0,
    trialEnd: Number(sub.trial_end || 0) || 0,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  };
}

export const isPaidPlan = (st) => !!(st && (st.plan === 'pro' || st.plan === 'company' || st.plan === 'vip'));

// Feature check. Free features are never asked about here; only PRO_FEATURES ids.
export function can(feature, st) {
  if (!PRO_FEATURES.some((f) => f.id === feature)) return true;
  return isPaidPlan(st);
}

export function planLabel(st) {
  if (!st || !isPaidPlan(st)) return 'Free';
  if (st.plan === 'vip') return 'Pro (VIP, free)';
  if (st.plan === 'company') return `Company · ${st.seats || ''} techs`.replace(' ·  techs', '');
  return st.interval === 'year' ? 'Pro · yearly' : 'Pro · monthly';
}

// Company seats: 1-2 techs are free (no checkout). 3+ techs pay $5 a month for each tech after
// the first 2, so the Stripe quantity is techs - 2 (never below 1 once there are 3 or more).
export function billableTechs(techs) {
  const n = Math.floor(Number(techs) || 0);
  return n > FREE_TECHS ? Math.max(1, n - FREE_TECHS) : 0;
}

// The other way round: a company subscription's Stripe quantity -> how many techs it covers.
export function techsFromQuantity(quantity) {
  const q = Math.floor(Number(quantity) || 0);
  return q > 0 ? q + FREE_TECHS : 0;
}

export function companyQuote(techs) {
  const n = Math.max(1, Math.floor(Number(techs) || 1));
  if (n <= FREE_TECHS) return { techs: n, free: true, monthly: 0, billable: 0, text: `Free for ${n} tech${n === 1 ? '' : 's'}` };
  const billable = billableTechs(n);
  const monthly = billable * 5;
  return { techs: n, free: false, monthly, billable, text: `${TRIAL_DAYS} days free, then $${monthly}/month (first ${FREE_TECHS} free, ${billable} × $5)` };
}

// Validate a tech count for a paid company plan (checkout or a seat change).
function companyTechs(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < FREE_TECHS + 1) return { error: `Companies with ${FREE_TECHS} techs or fewer are free. Pick 3 or more techs.` };
  if (n > 500) return { error: 'For more than 500 techs, email us.' };
  return { techs: n, quantity: billableTechs(n) };
}

// POST /api/billing/seats body: how many techs the company now has.
export function seatsRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  return companyTechs(b.techs);
}

// Can this request start checkout? (server side validation of the body)
export function checkoutRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const p = PLANS[b.plan];
  if (!p) return { error: 'Unknown plan' };
  if (p.perSeat) {
    const c = companyTechs(b.techs);
    return c.error ? c : { plan: p, ...c };
  }
  return { plan: p, quantity: 1 };
}

// Android Play app (Trusted Web Activity) opens the site with an android-app:// referrer.
export function isTwaLaunch(referrer, search) {
  return /^android-app:\/\//.test(String(referrer || '')) || /[?&](twa|app)=(1|android)\b/.test(String(search || ''));
}

// Apple and Google require their own in-app purchase inside store apps, so the web checkout
// is only offered on the plain website.
export function checkoutAllowed({ native = false, twa = false } = {}) {
  return !native && !twa;
}

// Footer text on printouts: Pro users can put their own name there.
export function printFooterName(settings, st) {
  const n = String((settings && settings.printName) || '').trim().slice(0, 80);
  return n && can('printName', st) ? n : 'AmpMap';
}
