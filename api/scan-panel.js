// POST /api/scan-panel  (Authorization: Bearer <Firebase ID token>)
// Body: { image: base64 JPEG/PNG/WebP (a data: prefix is fine), mimeType }
// Reads ONE photo of a breaker panel directory with Google Gemini and answers the circuits it sees
// (breaker number, label, amps, poles) for the person to review before anything is saved.
// GET /api/scan-panel answers { enabled, ... } so the app can show "AI scan coming soon".
//
// Env: GEMINI_API_KEY (Vercel > panel-buddy > Settings > Environment Variables). Without it the
// endpoint answers 501 not_configured and the app shows "AI scan coming soon". The key is read only
// here; it is never sent to the browser or logged. Optional GEMINI_MODEL (tried first; see modelList).
//
// Allowance: Pro / Company / VIP / Lifetime get SCAN_LIMITS.pro scans a month, free accounts get
// SCAN_LIMITS.freeTrial scans in total. Usage is kept at scanUsage/{uid} (written by this function
// only, using FIREBASE_SERVICE_ACCOUNT; the Firestore catch-all rule keeps it closed to the app).
// Without the service account, usage is counted per server instance (best effort).
import { send, readBody } from './_lib/http.js';
import { verifyIdToken, bearer, getDocument, setDocument } from './_lib/firebase.js';
import { planForUser } from './billing/status.js';
import { scanAllowance, countScan, SCAN_LIMITS } from '../src/lib/plans.js';

// Google retires model names (gemini-2.5-flash answers 404 for keys made after Oct 2026) and a free key
// has a small daily quota per model, so the reader walks a list (same as Runs Ledger's reader):
// GEMINI_MODEL first when set (comma-separated is fine), then the current alias, then named fallbacks.
// A 404 / 429 / 5xx moves on to the next model; anything else stops.
export const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-flash-lite-latest'];
export function modelList(env = {}) {
  const own = String(env.GEMINI_MODEL || '').split(',').map((x) => x.trim()).filter(Boolean);
  return own.concat(DEFAULT_MODELS.filter((m) => !own.includes(m)));
}
const RETRY_STATUS = (st) => st === 404 || st === 429 || st >= 500;
export const MAX_B64 = 4 * 1024 * 1024; // Vercel's body limit is 4.5 MB; the app sends a ~1600px JPEG
export const LIMIT_PER_HOUR = 15; // per signed-in user, per server instance (guards against a runaway loop)

const ALLOWED_ORIGINS = [/^https:\/\/(www\.)?breakerly\.com$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^https?:\/\/localhost(:\d+)?$/, /^capacitor:\/\/localhost$/];
export function corsHeaders(origin) {
  const ok = origin && ALLOWED_ORIGINS.some((re) => re.test(origin));
  return ok
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : { Vary: 'Origin' };
}

export const hits = new Map();
export function rateLimited(key, now = Date.now()) {
  const list = (hits.get(key) || []).filter((t) => now - t < 3600 * 1000);
  if (list.length >= LIMIT_PER_HOUR) { hits.set(key, list); return true; }
  list.push(now); hits.set(key, list);
  return false;
}

// Usage fallback when Firestore isn't reachable from the server.
export const memUsage = new Map();

export const PROMPT = 'This is a photo of the circuit directory (legend) of a residential or light-commercial electrical breaker panel. ' +
  'It may be handwritten, typed or printed, sometimes on the inside of the panel door, sometimes two columns (odd numbers left, even right). ' +
  'Read ONLY what is written; never invent circuits. For each written entry return: number = the circuit/breaker space number as written (e.g. "1", "14", or "3-5" for a double), ' +
  'label = what it feeds as written, expanded only for obvious abbreviations (e.g. "KIT RECEPT" -> "Kitchen outlets"), amps = the breaker size if written or shown (e.g. "20"), else "", ' +
  'poles = "2" if the entry is a 240V / double breaker (two numbers like "3-5", or words like dryer, range, A/C, water heater), else "1". ' +
  'Give a confidence 0 to 1 per entry; if handwriting is hard to read keep your best reading and lower the confidence. Also return panel_amps (the main breaker size if written, else "") and notes (short, other writing).';

export const SCHEMA = {
  type: 'OBJECT',
  properties: {
    circuits: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { number: { type: 'STRING' }, label: { type: 'STRING' }, amps: { type: 'STRING' }, poles: { type: 'STRING' }, confidence: { type: 'NUMBER' } },
        required: ['number', 'label', 'amps', 'poles', 'confidence'],
      },
    },
    panel_amps: { type: 'STRING' },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['circuits', 'panel_amps', 'notes'],
};

export function geminiRequest(b64, mimeType) {
  return {
    contents: [{ role: 'user', parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: b64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
  };
}

export function textOf(gemini) {
  try { return gemini.candidates[0].content.parts.map((p) => p.text || '').join(''); } catch { return ''; }
}

const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const conf = (c) => (typeof c === 'number' && c >= 0 && c <= 1 ? c : 0.5);
const AMP_SIZES = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225];

export function cleanAmps(v) {
  const n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10);
  return AMP_SIZES.includes(n) ? String(n) : '';
}

// "3-5", "3/5", "3 & 5" -> slot 3, 2-pole. "14" -> 14. Junk -> 0.
export function cleanNumber(v) {
  const m = String(v || '').match(/\d{1,3}/g) || [];
  const first = parseInt(m[0] || '0', 10);
  const n = first > 0 && first <= 84 ? first : 0;
  return { slot: n, double: m.length >= 2 && Math.abs(parseInt(m[1], 10) - first) <= 2 };
}

// Gemini's JSON -> circuits in the same shape as the on-device label scan (labelScan.js), so the
// same review grid and "add breakers" path is used. Low-confidence rows are flagged for a check.
export function normalize(raw) {
  let j = raw;
  if (typeof raw === 'string') { try { j = JSON.parse(raw); } catch { j = {}; } }
  j = j && typeof j === 'object' ? j : {};
  const seen = new Set();
  const circuits = [];
  for (const c of Array.isArray(j.circuits) ? j.circuits : []) {
    if (!c || typeof c !== 'object') continue;
    const { slot, double } = cleanNumber(c.number);
    const label = clip(c.label, 60).replace(/\?/g, '').trim();
    if (!slot || seen.has(slot)) continue;
    if (!label && !c.amps) continue;
    seen.add(slot);
    const poles = double || String(c.poles) === '2' ? '2' : '1';
    circuits.push({ slot, label, amps: cleanAmps(c.amps), poles, low: conf(c.confidence) < 0.8 || /\?/.test(String(c.label || '')), source: 'ai' });
    if (circuits.length >= 84) break;
  }
  circuits.sort((a, b) => a.slot - b.slot);
  return {
    circuits,
    panelAmps: cleanAmps(j.panel_amps),
    notes: (Array.isArray(j.notes) ? j.notes : []).map((n) => clip(n, 120)).filter(Boolean).slice(0, 6),
  };
}

async function readUsage(uid, deps) {
  if (deps.usageStore) return deps.usageStore.get(uid);
  const doc = await getDocument(`scanUsage/${uid}`, deps.fetch ? { fetchImpl: deps.fetch } : {}).catch(() => undefined);
  if (doc === undefined) return { ...(memUsage.get(uid) || {}), _mem: true };
  return doc || {};
}
async function writeUsage(uid, usage, deps) {
  if (deps.usageStore) return deps.usageStore.set(uid, usage);
  memUsage.set(uid, usage);
  return setDocument(`scanUsage/${uid}`, usage, deps.fetch ? { fetchImpl: deps.fetch } : {}).catch(() => false);
}

export async function handler(req, res, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetch || fetch;
  const verify = deps.verify || ((tok) => verifyIdToken(tok));
  const planOf = deps.planOf || ((u) => planForUser(u));
  const cors = corsHeaders(req.headers && req.headers.origin);
  const out = (status, obj) => { Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v)); return send(res, status, obj); };
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v)); res.statusCode = 204; return res.end(); }
  const enabled = !!env.GEMINI_API_KEY;
  if (req.method === 'GET') {
    // Status for the app: is the scanner on, and how many scans are left for this person.
    const user = await verify(bearer(req)).catch(() => null);
    if (!user || !enabled) return out(200, { enabled, limits: SCAN_LIMITS, signedIn: !!user });
    const st = await planOf(user).catch(() => ({ plan: 'free' }));
    const allowance = scanAllowance(st, await readUsage(user.uid, deps));
    return out(200, { enabled, limits: SCAN_LIMITS, signedIn: true, ...allowance });
  }
  if (req.method !== 'POST') return out(405, { error: 'method' });
  if (!enabled) return out(501, { error: 'not_configured', message: 'AI scan is coming soon.' });
  const user = await verify(bearer(req)).catch(() => null);
  if (!user) return out(401, { error: 'sign_in', message: 'Sign in to use AI scan.' });
  if (rateLimited(user.uid, deps.now)) return out(429, { error: 'slow_down', message: 'Too many scans in a row. Try again in a bit.' });
  const body = await readBody(req).catch(() => null);
  const b64 = String((body && body.image) || '').replace(/^data:[^,]*,/, '');
  const mimeType = /^image\/(jpeg|png|webp)$/.test(body && body.mimeType) ? body.mimeType : 'image/jpeg';
  if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64.slice(0, 200))) return out(400, { error: 'no_image', message: 'No photo came through.' });
  if (b64.length > MAX_B64) return out(413, { error: 'too_big', message: 'That photo is too big. Try again.' });
  const st = await planOf(user).catch(() => ({ plan: 'free' }));
  const usage = await readUsage(user.uid, deps);
  const allowance = scanAllowance(st, usage, deps.now);
  if (allowance.left <= 0) {
    return out(402, {
      error: allowance.kind === 'trial' ? 'trial_used' : 'monthly_limit',
      message: allowance.kind === 'trial' ? `You've used your ${allowance.limit} free AI scans. Pro includes ${SCAN_LIMITS.pro} a month.` : `You've used all ${allowance.limit} AI scans this month. They reset on the 1st.`,
      ...allowance,
    });
  }
  try {
    let r = null;
    let model = '';
    for (const m of modelList(env)) {
      model = m;
      r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(geminiRequest(b64, mimeType)),
      });
      if (r.ok || !RETRY_STATUS(r.status)) break;
    }
    if (!r || !r.ok) return out(502, { error: 'reader_failed', status: r && r.status, message: 'The AI reader had a problem. Your scan was not counted.' });
    const result = normalize(textOf(await r.json()));
    // Only a scan that found something counts against the allowance.
    let after = allowance;
    if (result.circuits.length) {
      const { _mem, ...prev } = usage || {};
      void _mem;
      const next = countScan(st, prev, deps.now);
      await writeUsage(user.uid, next, deps);
      after = scanAllowance(st, next, deps.now);
    }
    return out(200, { ok: true, model, result, ...after });
  } catch {
    return out(502, { error: 'reader_failed', message: 'The AI reader had a problem. Your scan was not counted.' });
  }
}

export default function scanPanel(req, res) { return handler(req, res); }
