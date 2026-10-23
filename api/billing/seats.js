// POST /api/billing/seats {techs} -> change how many techs a company plan covers.
// The first 2 techs are free, so the Stripe quantity becomes techs - 2 (3 techs = 1 x $5).
// Going down to 1-2 techs means no paid plan is needed: cancel in Manage plan instead.
import { send, readBody } from '../_lib/http.js';
import { verifyIdToken, bearer } from '../_lib/firebase.js';
import { stripe, stripeReady } from '../_lib/stripe.js';
import { customerFor } from './checkout.js';
import { seatsRequest, planFromSubscription, ACTIVE_STATUSES } from '../../src/lib/plans.js';

// Pure part (testable with a fake fetch): find the live company subscription and set its quantity.
export async function changeSeats(customer, want, opts = {}) {
  const subs = await stripe('GET', '/v1/subscriptions', { customer, status: 'all', limit: 10 }, opts);
  const sub = (subs.data || []).find((s) => ACTIVE_STATUSES.includes(s.status) && planFromSubscription(s).plan === 'company');
  if (!sub) return { error: 'No company plan to change. Start one from Plans first.', status: 404 };
  const item = (sub.items && sub.items.data && sub.items.data[0]) || {};
  if (!item.id) return { error: 'That plan has no seat line to change.', status: 409 };
  if (Number(item.quantity) === want.quantity) return { ok: true, unchanged: true, ...planFromSubscription(sub) };
  const updated = await stripe('POST', `/v1/subscriptions/${sub.id}`, {
    items: [{ id: item.id, quantity: want.quantity }],
    proration_behavior: 'create_prorations',
    metadata: { ...(sub.metadata || {}), techs: String(want.techs) },
  }, opts);
  return { ok: true, ...planFromSubscription(updated) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!stripeReady()) return send(res, 503, { error: 'coming_soon', message: 'Upgrades are coming soon.' });
  const user = await verifyIdToken(bearer(req)).catch(() => null);
  if (!user) return send(res, 401, { error: 'Sign in first.' });
  const want = seatsRequest(await readBody(req));
  if (want.error) return send(res, 400, { error: want.error });
  try {
    const customer = await customerFor(user, { create: false });
    if (!customer) return send(res, 404, { error: 'No company plan to change. Start one from Plans first.' });
    const out = await changeSeats(customer, want);
    if (out.error) return send(res, out.status || 400, { error: out.error });
    return send(res, 200, out);
  } catch (e) {
    return send(res, 502, { error: 'Could not change techs. Try again in a minute.', detail: e.message });
  }
}
