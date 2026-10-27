// Behaviour that only applies inside the Breakerly iPhone app (Capacitor shell, see native/).
// On the website every function here is a no-op or falls back to the normal web behaviour,
// so the web app on Vercel works exactly as before.
import { PUBLIC_APP_URL } from './lib/sticker.js';

export function isNativeApp() {
  try {
    const C = typeof window !== 'undefined' ? window.Capacitor : null;
    return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  } catch {
    return false;
  }
}

// Links, QR codes and share links must point at the public website, never at the app's
// internal capacitor://localhost address.
export function publicBase() {
  return isNativeApp() ? PUBLIC_APP_URL + '/' : location.origin + location.pathname;
}

function plugin() {
  const C = window.Capacitor;
  return (C && C.Plugins && C.Plugins.AmpNative) || null;
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// "Download" inside the app = the iOS share sheet with the file (Save to Files, Mail, AirDrop...).
export async function nativeDownload(filename, text, type) {
  const p = plugin();
  if (!p) return false;
  await p.shareFile({ filename, data: toBase64(text), mimeType: type, title: filename });
  return true;
}

// Is this link something the app should hand to Safari instead of opening inside itself?
// External sites, plus website-only pages (privacy policy, setup page, /get smart link).
export function externalUrlFor(href, here = location.href) {
  if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return null;
  let u;
  try {
    u = new URL(href, here);
  } catch {
    return null;
  }
  if (u.protocol === 'mailto:' || u.protocol === 'tel:' || u.protocol === 'sms:') return u.href;
  const hereUrl = new URL(here);
  if (u.protocol === 'http:' || u.protocol === 'https:') {
    if (u.host !== hereUrl.host) return u.href;
  }
  if (u.origin === hereUrl.origin) {
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/index.html') return null; // the app itself (hash routes)
    if (/\.(png|jpe?g|webp|svg|ico|json|js|css)$/i.test(path)) return null; // the app's own assets
    return PUBLIC_APP_URL + u.pathname + u.search + u.hash;
  }
  return null;
}

let started = false;
export function initNative() {
  if (started || !isNativeApp()) return;
  started = true;
  document.documentElement.classList.add('native-app');
  const p = plugin();
  if (p) {
    // WKWebView ignores window.print(); use the iOS print sheet (also "Save to Files" as PDF).
    window.print = () => {
      p.print({ name: document.title || 'Breakerly' }).catch((e) => console.warn('print', e));
    };
    // The share sheet, for code/link sharing that already calls navigator.share.
    try {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (data = {}) => p.share({ title: data.title || '', text: data.text || '', url: data.url || '' }),
      });
    } catch {
      /* keep the web version */
    }
    window.AmpNativeDownload = nativeDownload;
  }
  // Website pages and other sites open in Safari; the app keeps its own screens.
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.hasAttribute('download')) return;
      const url = externalUrlFor(a.getAttribute('href'));
      if (!url) return;
      e.preventDefault();
      // Capacitor hands any navigation to another host to the system (Safari, Mail, Phone).
      window.location.href = url;
    },
    true
  );
}
