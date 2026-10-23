// Tiny Stripe client for the Vercel functions (no SDK: plain fetch + the form encoding Stripe uses).
import crypto from 'node:crypto';
import { PLANS } from '../../src/lib/plans.js';

export const stripeKey = () => process.env.STRIPE_SECRET_KEY || '';
export const stripeReady = () => /^(sk|rk)_(test|live)_/.test(stripeKey());

// {a:{b:1}, c:[x,y]} -> a[b]=1&c[0]=x&c[1]=y
export function formEncode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [i, x])) : v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join('&');
}

export async function stripe(method, path, params, { fetchImpl = fetch, key = stripeKey() } = {}) {
  const isGet = method === 'GET';
  const qs = params && isGet ? '?' + formEncode(params) : '';
  const res = await fetchImpl('https://api.stripe.com' + path + qs, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: isGet ? undefined : formEncode(params || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || `Stripe ${res.status}`);
    err.status = res.status;
    err.stripe = data.error;
    throw err;
  }
  return data;
}

// Prices are found by lookup_key, so the same code works with test keys and live keys.
// If a key has no price yet (for example the first run with a test key), it is created.
const PRODUCTS = {
  pro: { name: 'AmpMap Pro', description: 'AmpMap Pro for homeowners.' },
  company: { name: 'AmpMap Company', description: 'AmpMap for electrical companies: $5 a month for each tech after the first 2.', unit_label: 'tech' },
};
export async function priceFor(planKey, opts = {}) {
  const p = PLANS[planKey];
  if (!p) throw new Error('Unknown plan');
  const envId = process.env[`STRIPE_PRICE_${planKey.toUpperCase()}`];
  if (envId) return envId;
  const found = await stripe('GET', '/v1/prices', { lookup_keys: [p.lookupKey], active: 'true', limit: 1 }, opts);
  if (found.data && found.data[0]) return found.data[0].id;
  const product = await stripe('POST', '/v1/products', { ...PRODUCTS[p.plan], metadata: { app: 'ampmap', plan: p.plan } }, opts);
  const price = await stripe('POST', '/v1/prices', {
    product: product.id,
    currency: 'usd',
    unit_amount: p.amount,
    recurring: { interval: p.interval },
    lookup_key: p.lookupKey,
    nickname: `AmpMap ${p.label}`,
    metadata: { app: 'ampmap', plan: p.plan },
  }, opts);
  return price.id;
}

// Stripe-Signature: t=123,v1=abc -> true when the HMAC matches and the event is fresh.
export function verifySignature(payload, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!payload || !header || !secret) return false;
  const parts = Object.fromEntries(String(header).split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i).trim(), kv.slice(i + 1)]; }).filter(([k]) => k !== 'v1'));
  const sigs = String(header).split(',').filter((kv) => kv.trim().startsWith('v1=')).map((kv) => kv.trim().slice(3));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${typeof payload === 'string' ? payload : payload.toString('utf8')}`).digest('hex');
  const a = Buffer.from(expected);
  return sigs.some((s) => { const b = Buffer.from(s); return b.length === a.length && crypto.timingSafeEqual(a, b); });
}
