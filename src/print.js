// Print / Save as PDF that works everywhere.
// window.print() does nothing in an iPhone home-screen (standalone) web app or inside the iPhone app,
// so there Breakerly makes a PDF of the page (exact sticker size) and hands it to the share sheet,
// where Print, Save to Files, Mail and AirDrop all work. Desktop and normal browsers keep window.print().
// The PDF tools (html2canvas-pro + jsPDF, both free) are loaded only when they are needed.

export function isIos(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const ua = nav.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

export function isStandalone(nav = typeof navigator !== 'undefined' ? navigator : {}, mm = typeof window !== 'undefined' ? window.matchMedia : null) {
  if (nav.standalone === true) return true;
  try {
    return !!(mm && (mm('(display-mode: standalone)').matches || mm('(display-mode: fullscreen)').matches));
  } catch {
    return false;
  }
}

export function isNativeShell(w = typeof window !== 'undefined' ? window : {}) {
  try {
    const C = w.Capacitor;
    return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  } catch {
    return false;
  }
}

// 'print' = the browser's own print dialog works here; 'pdf' = make a PDF and share it.
export function printMode({ nav, mm, w, forced } = {}) {
  const win = w || (typeof window !== 'undefined' ? window : {});
  const n = nav || (typeof navigator !== 'undefined' ? navigator : {});
  let force = forced;
  if (force == null) {
    try {
      force = /[?&]pdf=1/.test((win.location && win.location.search) || '') || (win.localStorage && win.localStorage.getItem('ampmap:forcePdf') === '1');
    } catch {
      force = false;
    }
  }
  if (force) return 'pdf';
  if (isNativeShell(win)) return 'pdf';
  if (isIos(n) && isStandalone(n, mm || win.matchMedia)) return 'pdf';
  if (typeof win.print !== 'function') return 'pdf';
  return 'print';
}

// While capturing, turn the page's @media print rules on for the screen too,
// so the PDF looks like the printout (no buttons, no menus).
function applyPrintStyles() {
  const rules = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of Array.from(list || [])) {
      if (r.media && /\bprint\b/.test(r.media.mediaText) && !/\bscreen\b/.test(r.media.mediaText)) {
        for (const inner of Array.from(r.cssRules || [])) if (!(inner.type === 6)) rules.push(inner.cssText); // skip @page
      }
    }
  }
  const style = document.createElement('style');
  style.setAttribute('data-ampmap-pdf', '');
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
  document.documentElement.classList.add('pdf-capture');
  return () => {
    style.remove();
    document.documentElement.classList.remove('pdf-capture');
  };
}

// page: { w, h } in inches for an exact-size label, or 'letter'.
// place: { w, h } inches when an exact-size item goes on a letter page (top-left, 0.5 in margin).
export async function makePdf(el, { page = 'letter', place = null } = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const undo = applyPrintStyles();
  let canvas;
  try {
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    const rect = el.getBoundingClientRect();
    const widthIn = page !== 'letter' ? page.w : place ? place.w : 7.5;
    const pxPerIn = Math.max(1, rect.width / widthIn);
    const scale = Math.min(4, Math.max(2, 300 / pxPerIn));
    canvas = await html2canvas(el, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      ignoreElements: (n) => !!(n.classList && (n.classList.contains('no-print') || n.classList.contains('toast'))),
    });
  } finally {
    undo();
  }
  if (page !== 'letter') {
    const pdf = new jsPDF({ unit: 'in', format: [page.w, page.h], orientation: page.w > page.h ? 'landscape' : 'portrait', compress: true });
    pdf.addImage(canvas, 'PNG', 0, 0, page.w, page.h, undefined, 'FAST');
    return pdf.output('blob');
  }
  const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait', compress: true });
  const M = 0.5;
  if (place) {
    pdf.addImage(canvas, 'PNG', M, M, place.w, place.h, undefined, 'FAST');
    return pdf.output('blob');
  }
  // a long page: slice it into letter pages
  const W = 8.5 - 2 * M;
  const H = 11 - 2 * M;
  const pxPerInch = canvas.width / W;
  const pageH = Math.floor(H * pxPerInch);
  let y = 0;
  let first = true;
  while (y < canvas.height) {
    const h = Math.min(pageH, canvas.height - y);
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = h;
    const ctx = part.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, part.width, h);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (!first) pdf.addPage('letter', 'portrait');
    pdf.addImage(part, 'PNG', M, M, W, h / pxPerInch, undefined, 'FAST');
    first = false;
    y += h;
  }
  return pdf.output('blob');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Hand the PDF over: iPhone app share sheet, Web Share (iPhone home-screen app), else download/open it.
export async function deliverPdf(blob, filename, { title = filename } = {}) {
  const native = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AmpNative;
  if (isNativeShell() && native && native.shareFile) {
    await native.shareFile({ filename, data: await blobToBase64(blob), mimeType: 'application/pdf', title });
    return 'native-share';
  }
  let file = null;
  try {
    file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title });
      return 'share';
    }
    file = null;
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled'; // they closed the share sheet
    // Safari only opens the share sheet right after a tap; making the PDF can take longer than that.
    if (e && e.name === 'NotAllowedError' && file) return readyButton(file, title);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 60000);
  return 'download';
}

// "Your PDF is ready" bar with a fresh button to tap (a new tap lets Safari open the share sheet).
function readyButton(file, title) {
  return new Promise((resolve) => {
    document.querySelectorAll('.pdf-ready').forEach((n) => n.remove());
    const bar = document.createElement('div');
    bar.className = 'pdf-ready no-print';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'PDF ready');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:9999;background:#1f2a3e;color:#fff;border-radius:16px;padding:14px;display:flex;gap:10px;align-items:center;box-shadow:0 10px 30px rgba(0,0,0,.35);font:600 15px/1.3 -apple-system,system-ui,sans-serif';
    bar.innerHTML = '<span style="flex:1">Your PDF is ready</span><button type="button" class="btn primary" data-go>Print / Save</button><button type="button" class="btn ghost" data-x style="color:#fff">Close</button>';
    document.body.appendChild(bar);
    bar.querySelector('[data-x]').onclick = () => { bar.remove(); resolve('closed'); };
    bar.querySelector('[data-go]').onclick = async () => {
      try {
        await navigator.share({ files: [file], title });
        bar.remove();
        resolve('share');
      } catch (e) {
        if (e && e.name === 'AbortError') { bar.remove(); resolve('cancelled'); }
      }
    };
  });
}

// The one entry point for every "Print / Save as PDF" button.
export async function printOrSave({ el, filename = 'Breakerly.pdf', page = 'letter', place = null, onBusy = () => {} } = {}) {
  if (printMode() === 'print') {
    try {
      window.print();
      return 'print';
    } catch {
      /* fall through to the PDF */
    }
  }
  onBusy(true);
  try {
    const blob = await makePdf(el || document.getElementById('app') || document.body, { page, place });
    return await deliverPdf(blob, filename);
  } finally {
    onBusy(false);
  }
}
