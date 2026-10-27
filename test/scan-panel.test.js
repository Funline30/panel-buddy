import test from 'node:test';
import assert from 'node:assert/strict';
import { handler, normalize, modelList, DEFAULT_MODELS, cleanNumber, cleanAmps, corsHeaders, hits, MAX_B64 } from '../api/scan-panel.js';
import { aiToCircuits, aiScanNote } from '../src/lib/aiScan.js';
import { scanAllowance, countScan, SCAN_LIMITS, scanMonth } from '../src/lib/plans.js';

function fakeRes() {
  const r = { statusCode: 0, headers: {}, body: '' };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = (b) => { r.body = b || ''; };
  r.json = () => JSON.parse(r.body || '{}');
  return r;
}
const IMG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const geminiReply = (obj) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
const SAMPLE = { circuits: [
  { number: '1', label: 'Kitchen outlets', amps: '20', poles: '1', confidence: 0.95 },
  { number: '3-5', label: 'Dryer', amps: '30', poles: '2', confidence: 0.9 },
  { number: '2', label: 'Bath lights?', amps: '15', poles: '1', confidence: 0.5 },
  { number: '2', label: 'duplicate', amps: '15', poles: '1', confidence: 0.9 },
  { number: 'x', label: 'junk', amps: '', poles: '1', confidence: 0.9 },
], panel_amps: '200A', notes: ['Main 200'] };

function deps(over = {}) {
  const store = new Map();
  return {
    env: { GEMINI_API_KEY: 'test-key' },
    verify: async (t) => (t === 'good' ? { uid: 'u1', email: 'a@b.com' } : null),
    planOf: async () => ({ plan: 'free' }),
    usageStore: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
    fetch: async () => geminiReply(SAMPLE),
    _store: store,
    ...over,
  };
}
const post = (body, token = 'good') => ({ method: 'POST', headers: { authorization: `Bearer ${token}`, origin: 'https://www.breakerly.com' }, body });

test('scan: no GEMINI_API_KEY -> 501 not_configured ("coming soon"), GET says enabled false', async () => {
  hits.clear();
  const res = fakeRes();
  await handler(post({ image: IMG }), res, deps({ env: {} }));
  assert.equal(res.statusCode, 501);
  assert.equal(res.json().error, 'not_configured');
  const g = fakeRes();
  await handler({ method: 'GET', headers: {} }, g, deps({ env: {} }));
  assert.equal(g.json().enabled, false);
});

test('scan: must be signed in', async () => {
  hits.clear();
  const res = fakeRes();
  await handler(post({ image: IMG }, 'bad'), res, deps());
  assert.equal(res.statusCode, 401);
});

test('scan: size cap and missing image', async () => {
  hits.clear();
  const big = fakeRes();
  await handler(post({ image: 'A'.repeat(MAX_B64 + 10) }), big, deps());
  assert.equal(big.statusCode, 413);
  const none = fakeRes();
  await handler(post({}), none, deps());
  assert.equal(none.statusCode, 400);
});

test('scan: reads circuits, dedupes, flags low confidence, counts one trial scan', async () => {
  hits.clear();
  const d = deps();
  const res = fakeRes();
  await handler(post({ image: 'data:image/png;base64,' + IMG, mimeType: 'image/png' }), res, d);
  assert.equal(res.statusCode, 200);
  const out = res.json();
  assert.deepEqual(out.result.circuits.map((c) => c.slot), [1, 2, 3]);
  assert.equal(out.result.circuits.find((c) => c.slot === 3).poles, '2');
  assert.equal(out.result.circuits.find((c) => c.slot === 2).low, true);
  assert.equal(out.result.panelAmps, '200');
  assert.equal(out.kind, 'trial');
  assert.equal(out.left, SCAN_LIMITS.freeTrial - 1);
  assert.equal(d._store.get('u1').trialUsed, 1);
  assert.equal(res.headers['access-control-allow-origin'], 'https://www.breakerly.com');
});

test('scan: free trial runs out -> 402 trial_used, Pro gets a monthly allowance', async () => {
  hits.clear();
  const d = deps();
  d._store.set('u1', { trialUsed: SCAN_LIMITS.freeTrial });
  const res = fakeRes();
  await handler(post({ image: IMG }), res, d);
  assert.equal(res.statusCode, 402);
  assert.equal(res.json().error, 'trial_used');
  const pro = deps({ planOf: async () => ({ plan: 'pro', status: 'active' }) });
  pro._store.set('u1', { trialUsed: 3, month: scanMonth(), count: SCAN_LIMITS.pro - 1 });
  const r2 = fakeRes();
  await handler(post({ image: IMG }), r2, pro);
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json().left, 0);
  const r3 = fakeRes();
  await handler(post({ image: IMG }), r3, pro);
  assert.equal(r3.statusCode, 402);
  assert.equal(r3.json().error, 'monthly_limit');
});

test('scan: owner (comp) accounts have no cap', async () => {
  hits.clear();
  const d = deps({ planOf: async () => ({ plan: 'vip', comp: true, status: 'active' }) });
  d._store.set('u1', { month: scanMonth(), count: 500 });
  const res = fakeRes();
  await handler(post({ image: IMG }), res, d);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().unlimited, true);
});

test('scan: a retired model (404) falls through to the next model; nothing found is not counted', async () => {
  hits.clear();
  const tried = [];
  const d = deps({
    fetch: async (url) => {
      tried.push(url.match(/models\/([^:]+)/)[1]);
      return tried.length === 1 ? { ok: false, status: 404, json: async () => ({}) } : geminiReply({ circuits: [], panel_amps: '', notes: [] });
    },
  });
  const res = fakeRes();
  await handler(post({ image: IMG }), res, d);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(tried, DEFAULT_MODELS.slice(0, 2));
  assert.equal(res.json().result.circuits.length, 0);
  assert.equal(d._store.get('u1'), undefined);
});

test('scan: reader error -> 502 and the scan is not counted', async () => {
  hits.clear();
  const d = deps({ fetch: async () => ({ ok: false, status: 400, json: async () => ({}) }) });
  const res = fakeRes();
  await handler(post({ image: IMG }), res, d);
  assert.equal(res.statusCode, 502);
  assert.equal(d._store.get('u1'), undefined);
});

test('scan: rate limit per user', async () => {
  hits.clear();
  const d = deps({ planOf: async () => ({ plan: 'vip', comp: true }) });
  let last;
  for (let i = 0; i < 16; i++) { last = fakeRes(); await handler(post({ image: IMG }), last, d); }
  assert.equal(last.statusCode, 429);
  hits.clear();
});

test('scan helpers: model list, numbers, amps, CORS', () => {
  assert.deepEqual(modelList({ GEMINI_MODEL: 'gemini-flash-latest' }), DEFAULT_MODELS);
  assert.equal(modelList({ GEMINI_MODEL: 'a, b' })[1], 'b');
  assert.deepEqual(cleanNumber('3/5'), { slot: 3, double: true });
  assert.deepEqual(cleanNumber('#14'), { slot: 14, double: false });
  assert.equal(cleanAmps('20A'), '20');
  assert.equal(cleanAmps('23'), '');
  assert.equal(corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], undefined);
  assert.equal(corsHeaders('capacitor://localhost')['Access-Control-Allow-Origin'], 'capacitor://localhost');
  assert.equal(normalize('not json').circuits.length, 0);
});

test('AI scan -> review circuits (same shape as the on-device scan)', () => {
  const cs = aiToCircuits(normalize(SAMPLE));
  const dryer = cs.find((c) => c.slot === 3);
  assert.equal(dryer.poles, '2');
  assert.equal(dryer.type, 'appliance');
  assert.equal(cs.find((c) => c.slot === 2).guessed, true);
  assert.ok(cs.every((c) => c.amps && c.label));
});

test('AI scan note and allowance', () => {
  assert.equal(aiScanNote(null).text, 'AI scan coming soon');
  assert.equal(aiScanNote({ enabled: true, signedIn: true, kind: 'trial', left: 2, limit: 3 }).text, '2 free AI scans left');
  assert.equal(aiScanNote({ enabled: true, signedIn: true, unlimited: true }).on, true);
  const a = scanAllowance({ plan: 'free' }, {});
  assert.equal(a.left, SCAN_LIMITS.freeTrial);
  const next = countScan({ plan: 'pro' }, { month: '2020-01', count: 9 });
  assert.equal(next.count, 1); // new month resets
});
