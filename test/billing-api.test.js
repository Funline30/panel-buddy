// Billing functions: webhook event handling, VIP list stays server-side, /api is not rewritten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { handleEvent } from '../api/billing/webhook.js';
import { VIP_EMAILS } from '../config/vip.js';

const root = new URL('..', import.meta.url).pathname;

test('webhook re-reads the subscription and maps it to the uid in its metadata', async () => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT; // not set up -> computed but not stored, no crash
  const sub = { id: 'sub_9', status: 'active', customer: 'cus_9', metadata: { uid: 'user9', plan: 'pro' }, items: { data: [{ quantity: 1, current_period_end: 99, price: { lookup_key: 'ampmap_pro_monthly', recurring: { interval: 'month' } } }] } };
  const seen = [];
  const fetchImpl = async (url) => { seen.push(url); return { ok: true, json: async () => sub }; };
  const out = await handleEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_9', status: 'incomplete' } } }, { fetchImpl, key: 'sk_test_x' });
  assert.deepEqual([out.uid, out.plan, out.status, out.stored], ['user9', 'pro', 'active', false]);
  assert.match(seen[0], /\/v1\/subscriptions\/sub_9$/);
  const viaCheckout = await handleEvent({ type: 'checkout.session.completed', data: { object: { subscription: 'sub_9', client_reference_id: 'user9' } } }, { fetchImpl, key: 'sk_test_x' });
  assert.equal(viaCheckout.uid, 'user9');
  const ignored = await handleEvent({ type: 'invoice.paid', data: { object: {} } }, { fetchImpl, key: 'sk_test_x' });
  assert.ok(ignored.ignored);
});

test('deleted subscription -> free', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ id: 'sub_1', status: 'canceled', metadata: { uid: 'u1' }, items: { data: [] } }) });
  const out = await handleEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } }, { fetchImpl, key: 'sk_test_x' });
  assert.equal(out.plan, 'free');
});

test('VIP list is a server file, never imported by the app', () => {
  assert.ok(Array.isArray(VIP_EMAILS));
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const f of walk(join(root, 'src')).filter((f) => f.endsWith('.js'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /from\s+['"][^'"]*config\/vip/, f);
});

test('vercel.json sends every page to the app but leaves /api to the functions', () => {
  const v = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const re = new RegExp('^' + v.rewrites[0].source.replace('/(', '(') + '$');
  assert.equal(re.test('h/abc/panel'), true);
  assert.equal(re.test('api/billing/status'), false);
});

test('no Stripe key or secret is hard-coded', () => {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const f of [...walk(join(root, 'api')), ...walk(join(root, 'src'))]) assert.doesNotMatch(readFileSync(f, 'utf8'), /(sk|rk)_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}/, f);
});
