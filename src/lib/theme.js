// Appearance setting: System / Light / Dark, saved per device (localStorage).
// "System" follows the phone's dark mode (prefers-color-scheme).
export const THEME_KEY = 'panelbuddy:theme';
export const THEME_OPTIONS = [
  { value: 'system', label: 'System (match my phone)' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function normalizeTheme(v) {
  return v === 'light' || v === 'dark' ? v : 'system';
}

// pref: 'system' | 'light' | 'dark'; systemDark: whether the OS is in dark mode
export function resolveTheme(pref, systemDark) {
  const p = normalizeTheme(pref);
  if (p === 'system') return systemDark ? 'dark' : 'light';
  return p;
}

export function getThemePref() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

export function setThemePref(v) {
  try {
    localStorage.setItem(THEME_KEY, normalizeTheme(v));
  } catch {
    /* private mode: keep it for this visit only */
  }
  applyTheme();
}

let watching = false;
export function applyTheme() {
  if (typeof document === 'undefined') return 'light';
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const theme = resolveTheme(getThemePref(), mq && mq.matches);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f1115' : '#f6f7f9');
  if (mq && !watching) {
    watching = true;
    const onChange = () => getThemePref() === 'system' && applyTheme();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  return theme;
}
