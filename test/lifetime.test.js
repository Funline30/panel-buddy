import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, PRO_FEATURES, checkoutRequest, planFromLifetimePayment, planLabel, can, isPaidPlan } from '../src/lib/plans.js';
import { checkoutSessionBody } from '../api/billing/checkout.js';
import { handleEvent } from '../api/billing/webhook.js';
import { priceFor } from '../api/_lib/stripe.js';
import { compList } from '../api/_lib/http.js';
import { COMP_EMAILS } from '../config/comp.js';
import { isVip } from '../src/lib/plans.js';
import { telHref, electricianCard } from '../src/lib/sticker.js';
import { feedbackMailto, notifyMailto, ELECTRICIAN_PITCH, FEEDBACK_EMAIL, APPS_SOON } from '../src/lib/marketing.js';
import fs from 'node:fs';

test('lifetime: $19.99 one-time plan, Checkout mode=payment, no subscription data', () => {
  assert.equal(PLANS.lifetime.amount, 1999);
  assert.equal(PLANS.lifetime.oneTime, true);
  const want = checkoutRequest({ plan: 'lifetime' });
  assert.equal(want.plan.key, 'lifetime');
  const body = checkoutSessionBody(want, { customer: 'cus_1', uid: 'u1', price: 'price_x', app: 'https://www.breakerly.com' });
  assert.equal(body.mode, 'payment');
  assert.equal(body.subscription_data, undefined);
  assert.equal(body.metadata.lifetime, 'true');
  assert.equal(body.payment_intent_data.metadata.uid, 'u1');
  assert.deepEqual(body.line_items, [{ price: 'price_x', quantity: 1 }]);
  const sub = checkoutSessionBody(checkoutRequest({ plan: 'pro_yearly' }), { customer: 'c', uid: 'u', price: 'p', app: 'a' });
  assert.equal(sub.mode, 'subscription');
});

test('lifetime: price comes from STRIPE_PRICE_LIFETIME and is never invented', async () => {
  const saved = process.env.STRIPE_PRICE_LIFETIME;
  process.env.STRIPE_PRICE_LIFETIME = 'price_from_env';
  assert.equal(await priceFor('lifetime'), 'price_from_env');
  delete process.env.STRIPE_PRICE_LIFETIME;
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([init.method, url]); return { ok: true, json: async () => ({ data: [] }) }; };
  await assert.rejects(priceFor('lifetime', { fetchImpl, key: 'sk_test_x' }), /lifetime_not_set_up/);
  assert.ok(calls.every(([m]) => m === 'GET'), 'no price or product is created');
  if (saved !== undefined) process.env.STRIPE_PRICE_LIFETIME = saved;
});

test('lifetime: webhook turns a paid one-time Checkout into Pro for life', async () => {
  const ev = { type: 'checkout.session.completed', data: { object: { mode: 'payment', payment_status: 'paid', client_reference_id: 'u9', customer: 'cus_9', payment_intent: 'pi_9', metadata: { uid: 'u9', lifetime: 'true' } } } };
  const out = await handleEvent(ev);
  assert.equal(out.plan, 'pro');
  assert.equal(out.interval, 'lifetime');
  const unpaid = await handleEvent({ ...ev, data: { object: { ...ev.data.object, payment_status: 'unpaid' } } });
  assert.ok(unpaid.ignored);
  const rec = planFromLifetimePayment(ev.data.object);
  assert.equal(rec.periodEnd, 0);
  assert.ok(isPaidPlan(rec));
  assert.equal(planLabel(rec), 'Pro · lifetime');
});

test('Pro perks: AI scan and branded PDF schedules are Pro; free features stay free', () => {
  const ids = PRO_FEATURES.map((f) => f.id);
  assert.ok(ids.includes('aiScan') && ids.includes('pdfSchedule'));
  assert.equal(can('pdfSchedule', { plan: 'free' }), false);
  assert.equal(can('pdfSchedule', { plan: 'pro' }), true);
  assert.equal(can('printSchedule', { plan: 'free' }), true, 'anything not listed as Pro stays free');
});

test('owner comp list: Caleb\'s 4 accounts, plus env COMP_EMAILS', () => {
  for (const e of ['margoittac@gmail.com', 'margoitta2002@gmail.com', 'caleb.margoitta2002@gmail.com', 'funlineprints@gmail.com']) assert.ok(COMP_EMAILS.includes(e));
  const list = compList({ COMP_EMAILS: 'x@y.com, Z@Q.com' });
  assert.ok(isVip('z@q.com', list));
  assert.ok(isVip('MARGOITTAC@gmail.com', list));
  assert.equal(isVip('someone@else.com', list), false);
  assert.equal(planLabel({ plan: 'vip', comp: true }), 'Pro (owner, free)');
});

test('electrician card: name, phone and a tel: link', () => {
  assert.equal(telHref('(254) 555-0100'), 'tel:+12545550100');
  assert.equal(telHref('254-555-0100 ext 2'), 'tel:+12545550100');
  assert.equal(telHref(''), '');
  assert.deepEqual(electricianCard({ company: 'Sparky Electric', phone: '254 555 0100' }), { name: 'Sparky Electric', phone: '254 555 0100', tel: 'tel:+12545550100' });
  assert.equal(electricianCard({}), null);
});

test('site copy: feedback and Notify me go to Caleb by email; pitch text; no AmpMap left', () => {
  assert.ok(feedbackMailto('idea').startsWith(`mailto:${FEEDBACK_EMAIL}?subject=Breakerly%20feature%20idea`));
  assert.ok(feedbackMailto('review').includes('Breakerly%20review'));
  assert.ok(notifyMailto().includes('Notify%20me'));
  assert.equal(ELECTRICIAN_PITCH, 'Leave a QR directory on every panel you touch, with your name and number on it.');
  assert.ok(APPS_SOON.title.includes('iPhone & Android'));
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes('Call your electrician'));
  assert.ok(main.includes('landingSections()'));
  for (const f of ['../index.html', '../public/manifest.webmanifest', '../src/main.js', '../public/support.html', '../public/privacy.html']) {
    assert.equal(/AmpMap/.test(fs.readFileSync(new URL(f, import.meta.url), 'utf8')), false, f + ' still says AmpMap');
  }
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>Breakerly/);
  assert.match(html, /og:title" content="Breakerly/);
});
