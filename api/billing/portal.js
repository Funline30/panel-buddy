// POST /api/billing/portal -> { url } of the Stripe customer portal (change plan, card, cancel).
import { send, appUrl } from '../_lib/http.js';
import { verifyIdToken, bearer } from '../_lib/firebase.js';
import { stripe, stripeReady } from '../_lib/stripe.js';
import { customerFor } from './checkout.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!stripeReady()) return send(res, 503, { error: 'coming_soon' });
  const user = await verifyIdToken(bearer(req)).catch(() => null);
  if (!user) return send(res, 401, { error: 'Sign in first.' });
  try {
    const customer = await customerFor(user, { create: false });
    if (!customer) return send(res, 404, { error: 'No plan to manage yet.' });
    const params = { customer, return_url: `${appUrl(req)}/#/plans` };
    let session;
    try {
      session = await stripe('POST', '/v1/billing_portal/sessions', params);
    } catch (e) {
      if (!/configuration/i.test(e.message)) throw e;
      // First use with a key whose account has no portal settings saved yet: make default ones.
      await stripe('POST', '/v1/billing_portal/configurations', {
        business_profile: { headline: 'Breakerly: manage your plan' },
        features: { invoice_history: { enabled: 'true' }, payment_method_update: { enabled: 'true' }, subscription_cancel: { enabled: 'true', mode: 'at_period_end' } },
      });
      session = await stripe('POST', '/v1/billing_portal/sessions', params);
    }
    return send(res, 200, { url: session.url });
  } catch (e) {
    return send(res, 502, { error: 'Could not open plan settings. Try again in a minute.', detail: e.message });
  }
}
