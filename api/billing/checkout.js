// POST /api/billing/checkout {plan:'pro_monthly'|'pro_yearly'|'company', techs?}
// -> { url } of a Stripe Checkout page. 503 coming_soon when Stripe isn't set up yet.
import { send, readBody, appUrl } from '../_lib/http.js';
import { verifyIdToken, bearer } from '../_lib/firebase.js';
import { stripe, stripeReady, priceFor } from '../_lib/stripe.js';
import { checkoutRequest, ACTIVE_STATUSES, TRIAL_DAYS } from '../../src/lib/plans.js';

export async function customerFor(user, { create = true, ...opts } = {}) {
  if (user.email) {
    const list = await stripe('GET', '/v1/customers', { email: user.email, limit: 10 }, opts);
    const all = list.data || [];
    const mine = all.find((c) => c.metadata && c.metadata.uid === user.uid) || all.find((c) => !c.metadata || !c.metadata.uid);
    if (mine) {
      if (!mine.metadata || mine.metadata.uid !== user.uid) await stripe('POST', `/v1/customers/${mine.id}`, { metadata: { uid: user.uid, app: 'ampmap' } }, opts);
      return mine.id;
    }
  }
  if (!create) return '';
  const c = await stripe('POST', '/v1/customers', { email: user.email || undefined, metadata: { uid: user.uid, app: 'ampmap' } }, opts);
  return c.id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!stripeReady()) return send(res, 503, { error: 'coming_soon', message: 'Upgrades are coming soon.' });
  const user = await verifyIdToken(bearer(req)).catch(() => null);
  if (!user) return send(res, 401, { error: 'Sign in first.' });
  const want = checkoutRequest(await readBody(req));
  if (want.error) return send(res, 400, { error: want.error });
  try {
    const customer = await customerFor(user);
    const subs = await stripe('GET', '/v1/subscriptions', { customer, status: 'all', limit: 10 });
    if ((subs.data || []).some((s) => ACTIVE_STATUSES.includes(s.status))) return send(res, 409, { error: 'You already have a plan. Use Manage plan to change it.', manage: true });
    const price = await priceFor(want.plan.key);
    const app = appUrl(req);
    const company = want.plan.plan === 'company';
    const session = await stripe('POST', '/v1/checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: user.uid,
      line_items: [{ price, quantity: want.quantity }],
      allow_promotion_codes: 'true',
      subscription_data: {
        metadata: { uid: user.uid, plan: want.plan.plan, app: 'ampmap' },
        ...(company ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}),
      },
      ...(company ? { payment_method_collection: 'if_required' } : {}),
      metadata: { uid: user.uid, plan: want.plan.plan },
      success_url: `${app}/#/plans?checkout=done`,
      cancel_url: `${app}/#/plans`,
    });
    return send(res, 200, { url: session.url });
  } catch (e) {
    return send(res, 502, { error: 'Checkout could not start. Try again in a minute.', detail: e.message });
  }
}
