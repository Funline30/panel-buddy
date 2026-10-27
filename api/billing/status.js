// GET /api/billing/status  (Authorization: Bearer <Firebase ID token>)
// -> { enabled, plan: 'free'|'pro'|'company'|'vip', status, interval, seats, periodEnd, ... }
// enabled = Stripe checkout is set up (STRIPE_SECRET_KEY present). With nothing set up the app
// shows "coming soon" and everything free keeps working.
import { send, vipList, compList } from '../_lib/http.js';
import { verifyIdToken, bearer, getDocument } from '../_lib/firebase.js';
import { stripe, stripeReady, lifetimeReady } from '../_lib/stripe.js';
import { isVip, planFromSubscription, isPaidPlan, ACTIVE_STATUSES } from '../../src/lib/plans.js';

export async function planForUser(user, opts = {}) {
  if (isVip(user.email, compList())) return { plan: 'vip', status: 'active', comp: true };
  if (isVip(user.email, await vipList(opts))) return { plan: 'vip', status: 'active' };
  let doc;
  try {
    doc = await getDocument(`billing/${user.uid}`, opts);
  } catch {
    doc = undefined;
  }
  const graceMs = 3 * 86400000;
  if (doc && isPaidPlan(doc) && (!doc.periodEnd || doc.periodEnd * 1000 + graceMs > Date.now())) return doc;
  if (stripeReady()) {
    const found = await stripe('GET', '/v1/subscriptions/search', { query: `metadata['uid']:'${user.uid.replace(/'/g, '')}'`, limit: 10 }, opts).catch(() => ({ data: [] }));
    const subs = (found.data || []).filter((s) => ACTIVE_STATUSES.includes(s.status));
    if (subs.length) return planFromSubscription(subs[0]);
    // Lifetime Pro is a one-time payment, not a subscription.
    const paid = await stripe('GET', '/v1/payment_intents/search', { query: `metadata['uid']:'${user.uid.replace(/'/g, '')}' AND metadata['lifetime']:'true' AND status:'succeeded'`, limit: 1 }, opts).catch(() => ({ data: [] }));
    if (paid.data && paid.data[0]) return { plan: 'pro', status: 'active', interval: 'lifetime', periodEnd: 0, customerId: paid.data[0].customer || '' };
  }
  return doc && doc.customerId ? { plan: 'free', customerId: doc.customerId } : { plan: 'free' };
}

// The iPhone app (capacitor://localhost) reads the plan too, so a VIP or an existing web
// subscriber gets Pro there. Read-only; no checkout is ever offered inside the apps.
const APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];

export default async function handler(req, res) {
  const origin = req.headers && req.headers.origin;
  if (origin && APP_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
  const enabled = stripeReady();
  const lifetime = lifetimeReady();
  try {
    const user = await verifyIdToken(bearer(req));
    if (!user) return send(res, 200, { enabled, lifetime, plan: 'free', signedIn: false });
    const p = await planForUser(user);
    const { customerId: _c, ...pub } = p;
    void _c;
    return send(res, 200, { enabled, lifetime, signedIn: true, ...pub });
  } catch (e) {
    return send(res, 200, { enabled, lifetime, plan: 'free', error: 'Could not check your plan right now.' });
  }
}
