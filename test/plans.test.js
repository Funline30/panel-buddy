// Paid plans: pricing rules, gating, Stripe helpers, webhook handling (no network: fetch is faked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PLANS, PRO_FEATURES, can, isVip, planFromSubscription, companyQuote, checkoutRequest, billableTechs, techsFromQuantity, seatsRequest, isTwaLaunch, checkoutAllowed, printFooterName, planLabel, accentOf } from '../src/lib/plans.js';
import { formEncode, verifySignature, priceFor, stripeReady } from '../api/_lib/stripe.js';
import { toFields, fromFields } from '../api/_lib/firebase.js';
import seatsHandler, { changeSeats } from '../api/billing/seats.js';

test('locked prices', () => {
  assert.equal(PLANS.pro_monthly.amount, 199);
  assert.equal(PLANS.pro_monthly.interval, 'month');
  assert.equal(PLANS.pro_yearly.amount, 1499);
  assert.equal(PLANS.pro_yearly.interval, 'year');
  assert.equal(PLANS.company.amount, 500);
  assert.equal(PLANS.company.trialDays, 30);
  assert.equal(PLANS.company.lookupKey, 'ampmap_company_seat_monthly');
});

test('free keeps everything: only Pro feature ids are gated', () => {
  for (const f of ['panels', 'floorplan', 'print', 'qr', 'share', 'backup', 'loadcheck', 'anything-else']) assert.equal(can(f, { plan: 'free' }), true);
  for (const f of PRO_FEATURES) {
    assert.equal(can(f.id, { plan: 'free' }), false, f.id);
    assert.equal(can(f.id, null), false, f.id);
    for (const p of ['pro', 'company', 'vip']) assert.equal(can(f.id, { plan: p }), true, `${f.id} on ${p}`);
  }
});

test('VIP list matches emails without case or spaces', () => {
  assert.equal(isVip(' Mom@Example.com ', ['mom@example.com']), true);
  assert.equal(isVip('someone@else.com', ['mom@example.com']), false);
  assert.equal(isVip('', ['']), false);
  assert.equal(isVip('nope', ['nope']), false);
});

test('company: 1-2 techs free, 3+ pay $5 for each tech after the first 2', () => {
  assert.equal(companyQuote(1).free, true);
  assert.equal(companyQuote(2).free, true);
  assert.equal(companyQuote(3).free, false);
  assert.equal(companyQuote(3).monthly, 5);
  assert.equal(companyQuote(4).monthly, 10);
  assert.equal(companyQuote(10).monthly, 40);
  assert.match(companyQuote(4).text, /30 days free, then \$10\/month/);
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(billableTechs), [0, 0, 0, 1, 2, 8]);
  assert.deepEqual([0, 1, 2, 8].map(techsFromQuantity), [0, 3, 4, 10]);
  assert.ok(checkoutRequest({ plan: 'company', techs: 2 }).error);
  assert.equal(checkoutRequest({ plan: 'company', techs: 3 }).quantity, 1);
  assert.equal(checkoutRequest({ plan: 'company', techs: 3 }).techs, 3);
  assert.equal(checkoutRequest({ plan: 'company', techs: 7 }).quantity, 5);
  assert.ok(checkoutRequest({ plan: 'company', techs: 501 }).error);
  assert.deepEqual(seatsRequest({ techs: 4 }), { techs: 4, quantity: 2 });
  assert.ok(seatsRequest({ techs: 2 }).error);
  assert.ok(seatsRequest(null).error);
  assert.equal(checkoutRequest({ plan: 'pro_yearly' }).quantity, 1);
  assert.ok(checkoutRequest({ plan: 'gold' }).error);
  assert.ok(checkoutRequest(null).error);
});

test('subscription -> plan record', () => {
  const sub = { id: 'sub_1', customer: 'cus_1', status: 'trialing', trial_end: 2000, metadata: { uid: 'u1', plan: 'company' }, items: { data: [{ quantity: 4, current_period_end: 3000, price: { lookup_key: 'ampmap_company_seat_monthly', recurring: { interval: 'month' } } }] } };
  const r = planFromSubscription(sub);
  // quantity 4 = 4 billed techs + the 2 free ones = 6 techs
  assert.deepEqual([r.plan, r.seats, r.billable, r.customerId, r.periodEnd, r.trialEnd, r.status], ['company', 6, 4, 'cus_1', 3000, 2000, 'trialing']);
  assert.equal(planFromSubscription({ ...sub, status: 'canceled' }).plan, 'free');
  const pro = planFromSubscription({ id: 's', status: 'active', current_period_end: 5, items: { data: [{ price: { lookup_key: 'ampmap_pro_yearly', recurring: { interval: 'year' } } }] } });
  assert.equal(pro.plan, 'pro');
  assert.equal(pro.interval, 'year');
  assert.equal(planLabel(pro), 'Pro · yearly');
  assert.equal(planFromSubscription(null).plan, 'free');
});

test('no web checkout inside the iPhone app or the Android Play app', () => {
  assert.equal(checkoutAllowed({}), true);
  assert.equal(checkoutAllowed({ native: true }), false);
  assert.equal(checkoutAllowed({ twa: true }), false);
  assert.equal(isTwaLaunch('android-app://com.funline.ampmap/', ''), true);
  assert.equal(isTwaLaunch('https://google.com/', '?twa=1'), true);
  assert.equal(isTwaLaunch('https://google.com/', ''), false);
});

test('printout footer name is Pro only', () => {
  assert.equal(printFooterName({ printName: 'Sparky Electric' }, { plan: 'free' }), 'Breakerly');
  assert.equal(printFooterName({ printName: 'Sparky Electric' }, { plan: 'pro' }), 'Sparky Electric');
  assert.equal(printFooterName({}, { plan: 'pro' }), 'Breakerly');
  assert.equal(accentOf('nope').value, 'amber');
});

test('Stripe form encoding (nested + arrays)', () => {
  assert.equal(formEncode({ a: 1, line_items: [{ price: 'p', quantity: 2 }], m: { uid: 'x y' }, skip: undefined }), 'a=1&line_items%5B0%5D%5Bprice%5D=p&line_items%5B0%5D%5Bquantity%5D=2&m%5Buid%5D=x%20y');
});

test('webhook signature check', () => {
  const secret = 'whsec_test';
  const payload = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  assert.equal(verifySignature(payload, `t=${t},v1=${sig}`, secret), true);
  assert.equal(verifySignature(Buffer.from(payload), `t=${t},v1=${sig}`, secret), true);
  assert.equal(verifySignature(payload + ' ', `t=${t},v1=${sig}`, secret), false);
  assert.equal(verifySignature(payload, `t=${t},v1=${sig}`, 'whsec_other'), false);
  assert.equal(verifySignature(payload, `t=${t - 3600},v1=${sig}`, secret), false, 'old events refused');
  assert.equal(verifySignature(payload, '', secret), false);
});

test('prices found by lookup key, created when missing (test-mode keys)', async () => {
  const calls = [];
  const fake = (found) => async (url, init) => {
    calls.push([init.method, url, init.body || '']);
    if (url.includes('/v1/prices?')) return { ok: true, json: async () => ({ data: found ? [{ id: 'price_found' }] : [] }) };
    if (url.endsWith('/v1/products')) return { ok: true, json: async () => ({ id: 'prod_new' }) };
    if (url.endsWith('/v1/prices')) return { ok: true, json: async () => ({ id: 'price_new' }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'nope' } }) };
  };
  assert.equal(await priceFor('pro_monthly', { fetchImpl: fake(true), key: 'sk_test_x' }), 'price_found');
  assert.match(calls[0][1], /lookup_keys%5B0%5D=ampmap_pro_monthly/);
  calls.length = 0;
  assert.equal(await priceFor('company', { fetchImpl: fake(false), key: 'sk_test_x' }), 'price_new');
  const create = calls.find((c) => c[1].endsWith('/v1/prices'));
  assert.match(create[2], /unit_amount=500/);
  assert.match(create[2], /lookup_key=ampmap_company_seat_monthly/);
});

test('nothing set up: Stripe is off, no crash', () => {
  const old = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal(stripeReady(), false);
  process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
  assert.equal(stripeReady(), true);
  if (old === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = old;
});

test('Firestore field mapping round-trips', () => {
  const o = { plan: 'pro', seats: 3, cancelAtPeriodEnd: false, price: 1.5 };
  assert.deepEqual(fromFields(toFields(o)), o);
});

test('seats: changing techs sets the Stripe quantity to techs - 2 on the company subscription', async () => {
  const sub = { id: 'sub_c', status: 'active', customer: 'cus_c', metadata: { uid: 'u', plan: 'company' }, items: { data: [{ id: 'si_1', quantity: 1, price: { lookup_key: 'ampmap_company_seat_monthly', recurring: { interval: 'month' } } }] } };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([init.method, url, init.body || '']);
    if (init.method === 'GET') return { ok: true, json: async () => ({ data: [sub] }) };
    return { ok: true, json: async () => ({ ...sub, items: { data: [{ ...sub.items.data[0], quantity: 3 }] } }) };
  };
  const out = await changeSeats('cus_c', seatsRequest({ techs: 5 }), { fetchImpl, key: 'sk_test_x' });
  assert.deepEqual([out.ok, out.seats, out.billable], [true, 5, 3]);
  const post = calls.find((c) => c[0] === 'POST');
  assert.match(post[1], /\/v1\/subscriptions\/sub_c$/);
  const body = decodeURIComponent(post[2]);
  assert.match(body, /items\[0\]\[id\]=si_1/);
  assert.match(body, /items\[0\]\[quantity\]=3/);
  assert.match(body, /metadata\[techs\]=5/);
  // same count again: no Stripe write
  calls.length = 0;
  const same = await changeSeats('cus_c', seatsRequest({ techs: 3 }), { fetchImpl, key: 'sk_test_x' });
  assert.equal(same.unchanged, true);
  assert.equal(calls.filter((c) => c[0] === 'POST').length, 0);
  // no company plan -> clear error
  const none = await changeSeats('cus_c', seatsRequest({ techs: 4 }), { fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }), key: 'sk_test_x' });
  assert.ok(none.error);
});

test('seats endpoint: no Stripe env -> coming soon, no crash', async () => {
  const old = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  const res = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b || ''; } };
  await seatsHandler({ method: 'POST', headers: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /coming_soon/);
  if (old !== undefined) process.env.STRIPE_SECRET_KEY = old;
});
