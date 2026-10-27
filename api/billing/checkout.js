// POST /api/billing/checkout {plan:'pro_monthly'|'pro_yearly'|'lifetime'|'company', techs?}
// Lifetime: a one-time $19.99 payment (Checkout mode=payment, price from STRIPE_PRICE_LIFETIME).
// Company: quantity = techs - 2 (the first 2 techs are free), so 3 techs = 1 x $5.
// -> { url } of a Stripe Checkout page. 503 coming_soon when Stripe isn't set up yet.
import { send, readBody, appUrl } from '../_lib/http.js';
import { verifyIdToken, bearer } from '../_lib/firebase.js';
import { stripe, stripeReady, priceFor } from '../_lib/stripe.js';
import { planForUser } from './status.js';
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

// The Stripe Checkout Session body. Exported for tests.
export function checkoutSessionBody(want, { customer, uid, price, app }) {
  const company = want.plan.plan === 'company';
  const base = {
    customer,
    client_reference_id: uid,
    line_items: [{ price, quantity: want.quantity }],
    allow_promotion_codes: 'true',
    metadata: { uid, plan: want.plan.plan, ...(want.plan.oneTime ? { lifetime: 'true' } : {}) },
    success_url: `${app}/#/plans?checkout=done`,
    cancel_url: `${app}/#/plans`,
  };
  if (want.plan.oneTime) {
    return { ...base, mode: 'payment', payment_intent_data: { metadata: { uid, plan: 'pro', lifetime: 'true', app: 'breakerly' } } };
  }
  return {
    ...base,
    mode: 'subscription',
    subscription_data: {
      metadata: { uid, plan: want.plan.plan, app: 'ampmap', ...(company ? { techs: String(want.techs) } : {}) },
      ...(company ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}),
    },
    ...(company ? { payment_method_collection: 'if_required' } : {}),
  };
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
    const current = await planForUser(user).catch(() => ({ plan: 'free' }));
    if (current && current.interval === 'lifetime' && current.plan === 'pro') return send(res, 409, { error: 'You already have Pro for life.' });
    let price;
    try {
      price = await priceFor(want.plan.key);
    } catch (e) {
      if (e.code === 'lifetime_not_set_up') return send(res, 503, { error: 'coming_soon', message: 'Lifetime Pro is coming soon.' });
      throw e;
    }
    const app = appUrl(req);
    const session = await stripe('POST', '/v1/checkout/sessions', checkoutSessionBody(want, { customer, uid: user.uid, price, app }));
    return send(res, 200, { url: session.url });
  } catch (e) {
    return send(res, 502, { error: 'Checkout could not start. Try again in a minute.', detail: e.message });
  }
}
