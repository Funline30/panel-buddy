// "This panel uses AmpMap" sticker + the smart /get link. Pure logic only (no DOM), so it can be tested.

// ---- App links: the ONE place to fill in once the store listings exist. ----
// While a store URL is '', /get shows "coming soon" for that phone and offers the web app.
// Once filled in, /get sends that phone straight to its store, so stickers already printed never need reprinting.
export const APP_STORE_URL = '';
export const PLAY_STORE_URL = '';
// Public web app. Printed stickers always point here (not at whatever site or app printed them).
export const PUBLIC_APP_URL = 'https://panel-buddy.vercel.app';
export const GET_PATH = '/get';
export const GET_URL = PUBLIC_APP_URL + GET_PATH;

// 'ios' | 'android' | 'other'. iPadOS 13+ says "Macintosh" in its user agent, so a Mac with a touch screen counts as an iPad.
export function detectPlatform(ua = '', { platform = '', maxTouchPoints = 0 } = {}) {
  const s = String(ua || '');
  if (/android/i.test(s)) return 'android';
  if (/iPhone|iPad|iPod/i.test(s)) return 'ios';
  if ((/Macintosh/i.test(s) || platform === 'MacIntel') && Number(maxTouchPoints) > 1) return 'ios';
  return 'other';
}

// Where /get should send this visitor. redirect = true only when the matching store URL is filled in.
export function getTarget(platform, { appStore = APP_STORE_URL, playStore = PLAY_STORE_URL, web = PUBLIC_APP_URL } = {}) {
  if (platform === 'ios' && appStore) return { kind: 'appstore', url: appStore, redirect: true };
  if (platform === 'android' && playStore) return { kind: 'play', url: playStore, redirect: true };
  return { kind: 'web', url: web, redirect: false };
}

// The store rows shown on the /get page (the visitor's own phone first).
export function storeRows(platform, { appStore = APP_STORE_URL, playStore = PLAY_STORE_URL } = {}) {
  const rows = [
    { key: 'ios', label: 'iPhone & iPad', store: 'App Store', url: appStore, soon: !appStore, text: appStore ? 'Get it on the App Store' : 'iPhone app coming soon' },
    { key: 'android', label: 'Android', store: 'Google Play', url: playStore, soon: !playStore, text: playStore ? 'Get it on Google Play' : 'Android app coming soon' },
  ];
  return platform === 'android' ? rows.reverse() : rows;
}

// What the sticker's QR opens: this home's read-only shared copy when sharing is on (unless the app link is
// chosen), otherwise the smart /get link.
export function stickerQrTarget(home, { shareUrl = (t) => `${PUBLIC_APP_URL}/#/share/${t}`, getUrl = GET_URL, prefer = '' } = {}) {
  const token = home && home.shareToken;
  if (token && prefer !== 'get') return { kind: 'share', url: shareUrl(token) };
  return { kind: 'get', url: getUrl };
}

// "Installed by" line: { company, phone }, both optional. null when there's nothing to show.
export function cleanInstalledBy(v) {
  if (!v || typeof v !== 'object') return null;
  const company = String(v.company || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const phone = String(v.phone || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!company && !phone) return null;
  return { ...(company ? { company } : {}), ...(phone ? { phone } : {}) };
}

export function installedByText(v) {
  const c = cleanInstalledBy(v);
  if (!c) return '';
  return 'Installed by: ' + [c.company, c.phone].filter(Boolean).join(' · ');
}

// Default for a sticker: what was saved on this home (even a deliberate blank), else for Tech/Pro accounts the
// last value they used (settings.installedBy), else nothing. Old homes have no installedBy field: that's fine.
export function installedByDefault(home, settings, pro = false) {
  if (home && Object.prototype.hasOwnProperty.call(home, 'installedBy')) return cleanInstalledBy(home.installedBy);
  if (pro && settings) return cleanInstalledBy(settings.installedBy);
  return null;
}

// Printable sizes. w/h in inches, as the label is printed.
export const STICKER_SIZES = [
  { value: '2x3', label: '2 x 3 in label', w: 3, h: 2 },
  { value: '4x6', label: '4 x 6 in sign', w: 4, h: 6 },
];
export const stickerSize = (v) => STICKER_SIZES.find((s) => s.value === v) || STICKER_SIZES[1];

// The words on the sticker, by what the QR opens.
export function stickerCopy(kind) {
  return kind === 'share'
    ? { scan: 'Scan to see this panel', sub: 'and get the free AmpMap app' }
    : { scan: 'Scan to get the app', sub: 'Free for iPhone, Android & web' };
}

// ---- How you print it: a label maker (1 in / 24 mm tape) or a regular printer.
export const PRINT_METHODS = [
  { value: 'maker', label: 'Label maker', icon: '🏷️', sub: '1 in (24 mm) tape' },
  { value: 'printer', label: 'Regular printer', icon: '🖨️', sub: 'Paper or label sheets' },
];
// 24 mm tape (Brother TZe, Brady). h = tape width; the printable part is a bit narrower.
export const TAPE_SIZES = [
  { value: 'tape25', label: '1 x 2.5 in', w: 2.5, h: 0.94 },
  { value: 'tape35', label: '1 x 3.5 in', w: 3.5, h: 0.94 },
];
export const tapeSize = (v) => TAPE_SIZES.find((s) => s.value === v) || TAPE_SIZES[0];
// paper: 'tape' = label maker, 'label' = exact sticker size, 'letter' = letter page to cut out
export function printChoice(paper) {
  if (paper === 'tape') return { method: 'maker', paper: 'tape' };
  return { method: 'printer', paper: paper === 'letter' ? 'letter' : 'label' };
}

// ---- Product links: ONE place, so they can be swapped for partner / affiliate links later.
// Prices are approximate (checked Oct 17, 2026).
export const WEATHERPROOF_SHEETS = { name: 'Avery Waterproof Labels (2 x 4 in, #5523)', url: 'https://www.avery.com/products/labels/5523', note: 'Pick the 2 x 3 in size: it fits on these labels.' };
export const LABEL_MAKERS = [
  { tier: 'Budget / homeowner', name: 'Brother P-touch CUBE Plus (PT-P710BT)', price: 'approx. $90–115', url: 'https://www.brother-usa.com/p/thermal-printers-labelers/PTP710BT' },
  { tier: 'Pro', name: 'Brady M211', price: 'approx. $180', url: 'https://www.tequipment.net/Brady/M211/Printers-and-Printing-Supplies/' },
  { tier: 'Pro (with keyboard)', name: 'Brother PT-E560BT', price: 'approx. $319', url: 'https://www.ptouchdirect.com/ptouch/pte560btvp-new.html' },
];
export const TAPE_TIP = 'Use 1 in (24 mm) laminated tape: Brother TZe or Brady. Laminated tape holds up to heat, oil and moisture.';
