export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slotText(b) {
  if (!b) return '';
  const s = parseInt(b.slot, 10);
  if (!Number.isFinite(s)) return b.slot || '?';
  return String(b.poles) === '2' ? `${s}/${s + 2}` : String(s);
}

export function ampsText(b) {
  if (!b) return '';
  const a = b.amps === 'other' ? b.ampsOther : b.amps;
  return a ? `${a}A` : '';
}

export function sortBreakers(list) {
  return [...list].sort((a, b) => (parseInt(a.slot, 10) || 999) - (parseInt(b.slot, 10) || 999));
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
