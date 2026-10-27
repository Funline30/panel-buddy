// POST /api/billing/webhook  (Stripe -> Breakerly)
// Verifies the Stripe-Signature with STRIPE_WEBHOOK_SECRET, re-reads the subscription from Stripe
// (so events arriving out of order can't leave a stale plan), and stores the plan in Firestore at
// billing/{uid} using FIREBASE_SERVICE_ACCOUNT. Events to send: checkout.session.completed,
// customer.subscription.created, customer.subscription.updated, customer.subscription.deleted.
import { send, rawBody } from '../_lib/http.js';
import { setDocument, getDocument } from '../_lib/firebase.js';
import { stripe, stripeReady, verifySignature } from '../_lib/stripe.js';
import { planFromSubscription, planFromLifetimePayment } from '../../src/lib/plans.js';

export const config = { api: { bodyParser: false } };

export async function handleEvent(event, opts = {}) {
  const obj = (event && event.data && event.data.object) || {};
  // Lifetime Pro: a one-time Checkout payment. Store it straight from the session.
  if (event.type === 'checkout.session.completed' && obj.mode === 'payment') {
    const uid = obj.client_reference_id || (obj.metadata && obj.metadata.uid) || '';
    if (!uid) return { ignored: 'no uid on payment' };
    if (!(obj.metadata && obj.metadata.lifetime === 'true')) return { ignored: 'not a lifetime payment' };
    const record = { ...planFromLifetimePayment(obj), updatedAt: Date.now(), lastEvent: event.type };
    if (record.plan !== 'pro') return { ignored: 'payment not paid yet', status: record.status };
    const stored = await setDocument(`billing/${uid}`, record, opts);
    return { uid, stored, plan: record.plan, status: record.status, interval: 'lifetime' };
  }
  let subId = '';
  if (event.type === 'checkout.session.completed') subId = typeof obj.subscription === 'string' ? obj.subscription : (obj.subscription && obj.subscription.id) || '';
  else if (/^customer\.subscription\./.test(event.type)) subId = obj.id;
  else return { ignored: event.type };
  if (!subId) return { ignored: 'no subscription' };
  let sub;
  try {
    sub = await stripe('GET', `/v1/subscriptions/${subId}`, null, opts);
  } catch (e) {
    if (e.status === 404 && event.type === 'customer.subscription.deleted') sub = { ...obj, status: 'canceled' };
    else throw e;
  }
  const uid = (sub.metadata && sub.metadata.uid) || (event.type === 'checkout.session.completed' ? obj.client_reference_id : '') || '';
  if (!uid) return { ignored: 'no uid on subscription' };
  const record = { ...planFromSubscription(sub), updatedAt: Date.now(), lastEvent: event.type };
  if (record.plan === 'free') {
    // Someone who bought Lifetime keeps it when an older subscription ends.
    const prev = await getDocument(`billing/${uid}`, opts).catch(() => null);
    if (prev && prev.interval === 'lifetime' && prev.plan === 'pro') return { uid, kept: 'lifetime', plan: 'pro' };
  }
  const stored = await setDocument(`billing/${uid}`, record, opts);
  return { uid, stored, plan: record.plan, status: record.status };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret || !stripeReady()) return send(res, 503, { error: 'Webhook not set up yet' });
  const raw = await rawBody(req);
  if (!verifySignature(raw, req.headers['stripe-signature'], secret)) return send(res, 400, { error: 'Bad signature' });
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return send(res, 400, { error: 'Bad JSON' });
  }
  try {
    const out = await handleEvent(event);
    return send(res, 200, { received: true, ...out });
  } catch (e) {
    // 500 makes Stripe retry later (it retries for up to 3 days).
    return send(res, 500, { error: e.message });
  }
}
