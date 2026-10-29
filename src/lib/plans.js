// Breakerly plans: what is free, what Pro adds, and the small rules the app and the server share.
// Pure functions only (no DOM, no network) so they run in tests and in the Vercel functions.
//
//  Homeowner (free)  - everything Breakerly does today stays free, forever. No ads.
//  Pro               - $1.99 a month or $14.99 a year. Adds extras on top (PRO_FEATURES).
//                      No lifetime / one-time option (Caleb, Oct 29 2026: yearly instead, recurring income).
//                      Anyone who bought the old $19.99 Lifetime before then keeps Pro (planFromLifetimePayment).
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
// AI panel scan allowance: Pro (and Company, VIP, Lifetime) get a monthly allowance; free
// accounts get a few trial scans in total so they can see it work.
export const SCAN_LIMITS = { pro: 20, freeTrial: 3 };

export const PRO_FEATURES = [
  { id: 'aiScan', icon: '📸', title: 'AI panel scan', text: `Snap one photo of the panel directory and AI fills in breaker numbers, labels and amps for you to check. ${SCAN_LIMITS.pro} scans a month (free accounts get ${SCAN_LIMITS.freeTrial} to try).` },
  { id: 'pdfSchedule', icon: '📄', title: 'Branded PDF panel schedules', text: 'Download a clean PDF panel schedule with your name or company and phone on it. (Printing from the browser stays free.)' },
  { id: 'printName', icon: '🖨️', title: 'Your name on printouts', text: 'Your name or company and phone on printed panel schedules and shopping lists, in place of "Breakerly".' },
  { id: 'accent', icon: '🎨', title: 'Accent colors', text: 'Pick the app color: blue, green, purple, red or teal.' },
  { id: 'badge', icon: '⭐', title: 'Pro badge', text: 'A Pro badge in the app. You keep Breakerly free and ad-free for everyone.' },
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
  if (st.comp) return 'Pro (owner, free)';
  if (st.plan === 'vip') return 'Pro (VIP, free)';
  if (st.plan === 'company') return `Company · ${st.seats || ''} techs`.replace(' ·  techs', '');
  if (st.interval === 'lifetime') return 'Pro · lifetime';
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
  if (b.plan === 'lifetime') return { error: 'Lifetime is no longer offered. Pick Pro yearly or monthly.' };
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
  return n && can('printName', st) ? n : 'Breakerly';
}

// Lifetime Pro was a one-time Stripe Checkout payment (mode=payment), sold until Oct 29 2026.
// No longer sold; the webhook still stores one if it arrives, and past buyers keep Pro.
export function planFromLifetimePayment(session) {
  const s = session && typeof session === 'object' ? session : {};
  const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
  return {
    plan: paid ? 'pro' : 'free',
    status: paid ? 'active' : String(s.payment_status || ''),
    interval: 'lifetime',
    seats: 0,
    billable: 0,
    customerId: typeof s.customer === 'string' ? s.customer : (s.customer && s.customer.id) || '',
    subscriptionId: '',
    paymentId: typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent && s.payment_intent.id) || '',
    periodEnd: 0,
    trialEnd: 0,
    cancelAtPeriodEnd: false,
  };
}

// Which monthly bucket a scan counts in (UTC), e.g. "2026-10".
export const scanMonth = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);

// How many AI scans this account has left. usage = { month, count, trialUsed } (server-kept).
export function scanAllowance(st, usage, now = Date.now()) {
  const u = usage && typeof usage === 'object' ? usage : {};
  if (st && st.comp) {
    // Owner accounts (config/comp.js, env COMP_EMAILS): no cap.
    const used = u.month === scanMonth(now) ? Math.max(0, Number(u.count) || 0) : 0;
    return { kind: 'owner', limit: 0, unlimited: true, used, left: 9999 };
  }
  if (isPaidPlan(st)) {
    const used = u.month === scanMonth(now) ? Math.max(0, Number(u.count) || 0) : 0;
    return { kind: 'pro', limit: SCAN_LIMITS.pro, used, left: Math.max(0, SCAN_LIMITS.pro - used) };
  }
  const used = Math.max(0, Number(u.trialUsed) || 0);
  return { kind: 'trial', limit: SCAN_LIMITS.freeTrial, used, left: Math.max(0, SCAN_LIMITS.freeTrial - used) };
}

// The usage record after one successful scan.
export function countScan(st, usage, now = Date.now()) {
  const u = usage && typeof usage === 'object' ? usage : {};
  const month = scanMonth(now);
  const sameMonth = u.month === month;
  const out = { month, count: sameMonth ? Math.max(0, Number(u.count) || 0) : 0, trialUsed: Math.max(0, Number(u.trialUsed) || 0), updatedAt: now };
  if (isPaidPlan(st)) out.count += 1; else out.trialUsed += 1;
  return out;
}
