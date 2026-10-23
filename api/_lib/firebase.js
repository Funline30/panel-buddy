// Firebase from the Vercel functions without the admin SDK:
//  * who is calling: the app sends its Firebase ID token; Google's accounts:lookup checks it.
//  * the plan record: billing/{uid} in Firestore, written with a service account (optional).
//    Nobody can read or write billing/ from the app (the existing rules deny everything not
//    listed), so a user cannot give themselves Pro.
import crypto from 'node:crypto';

const DEFAULT_API_KEY = 'AIzaSyB3DAWskFyX0CTWV8LtaxAl3RIeouK4mKM'; // public web key (same as src/firebase-config.js)
const DEFAULT_PROJECT = 'panel-buddy';
export const apiKey = () => process.env.VITE_FIREBASE_API_KEY || DEFAULT_API_KEY;

export async function verifyIdToken(idToken, { fetchImpl = fetch } = {}) {
  if (!idToken || typeof idToken !== 'string' || idToken.length < 20) return null;
  const res = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const u = data.users && data.users[0];
  if (!u || !u.localId) return null;
  return { uid: u.localId, email: String(u.email || '').toLowerCase(), emailVerified: !!u.emailVerified };
}

export function bearer(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  return /^Bearer\s+(.+)$/i.test(h) ? h.replace(/^Bearer\s+/i, '').trim() : '';
}

// ---- service account (FIREBASE_SERVICE_ACCOUNT = the whole JSON key file, pasted as one value)
export function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    if (!sa.client_email || !sa.private_key) return null;
    sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
    return sa;
  } catch {
    return null;
  }
}
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
let cached = { token: '', exp: 0 };
async function accessToken(sa, fetchImpl) {
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.exp - 60 > now) return cached.token;
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key));
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${claim}.${sig}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Google token: ' + (data.error_description || data.error || res.status));
  cached = { token: data.access_token, exp: now + Number(data.expires_in || 3600) };
  return cached.token;
}
const projectId = (sa) => process.env.VITE_FIREBASE_PROJECT_ID || sa.project_id || DEFAULT_PROJECT;

// Firestore REST values <-> plain JS (strings, numbers, booleans, arrays of strings).
export function toFields(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (typeof v === 'boolean') f[k] = { booleanValue: v };
    else if (typeof v === 'number') f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (Array.isArray(v)) f[k] = { arrayValue: { values: v.map((x) => ({ stringValue: String(x) })) } };
    else if (v === null) f[k] = { nullValue: null };
    else f[k] = { stringValue: String(v) };
  }
  return f;
}
export function fromFields(fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if ('stringValue' in v) o[k] = v.stringValue;
    else if ('integerValue' in v) o[k] = Number(v.integerValue);
    else if ('doubleValue' in v) o[k] = v.doubleValue;
    else if ('booleanValue' in v) o[k] = v.booleanValue;
    else if ('arrayValue' in v) o[k] = (v.arrayValue.values || []).map((x) => x.stringValue ?? '');
    else o[k] = null;
  }
  return o;
}

export async function getDocument(path, { fetchImpl = fetch } = {}) {
  const sa = serviceAccount();
  if (!sa) return undefined; // not set up
  const tok = await accessToken(sa, fetchImpl);
  const res = await fetchImpl(`https://firestore.googleapis.com/v1/projects/${projectId(sa)}/databases/(default)/documents/${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Firestore read ' + res.status);
  return fromFields((await res.json()).fields);
}

export async function setDocument(path, obj, { fetchImpl = fetch } = {}) {
  const sa = serviceAccount();
  if (!sa) return false;
  const tok = await accessToken(sa, fetchImpl);
  const res = await fetchImpl(`https://firestore.googleapis.com/v1/projects/${projectId(sa)}/databases/(default)/documents/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(obj) }),
  });
  if (!res.ok) throw new Error('Firestore write ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return true;
}
