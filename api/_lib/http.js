// Small helpers shared by the billing functions.
import { VIP_EMAILS } from '../../config/vip.js';
import { getDocument } from './firebase.js';

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await rawBody(req);
  try {
    return raw.length ? JSON.parse(raw.toString('utf8')) : {};
  } catch {
    return {};
  }
}

export function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// VIP emails: config/vip.js + env VIP_EMAILS + (optional) Firestore doc config/vip {emails:[...]}
export async function vipList(opts = {}) {
  const env = String(process.env.VIP_EMAILS || '').split(/[\s,;]+/).filter(Boolean);
  let doc = [];
  try {
    const d = await getDocument('config/vip', opts);
    if (d && Array.isArray(d.emails)) doc = d.emails;
  } catch {
    /* Firestore not reachable: the file and env still count */
  }
  return [...VIP_EMAILS, ...env, ...doc];
}

// Where Stripe sends people back to. APP_URL wins; else the host that called us.
export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'panel-buddy.vercel.app';
  return `https://${String(host).split(',')[0].trim()}`;
}
