// On-device OCR for "Scan the panel label". The text reader (tesseract.js, free, runs in the
// browser) is only downloaded when someone taps Scan, so normal app load stays fast.
// The photo never leaves the phone for reading.
import { toGray, stretchContrast, scanSize, cleanForOcr } from './lib/labelScan.js';

const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let loading = null;

function loadReader() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESS_URL;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('reader')));
      s.onerror = () => { loading = null; s.remove(); reject(Object.assign(new Error('offline'), { code: 'offline' })); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

// Photo -> clean black-on-white canvas (turned by `rotate` degrees, gray, stronger contrast,
// table lines removed).
export function prepareCanvas(img, rotate = 0) {
  const { w, h } = scanSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const turn = ((rotate % 360) + 360) % 360;
  const side = turn === 90 || turn === 270;
  const c = document.createElement('canvas');
  c.width = side ? h : w;
  c.height = side ? w : h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const g = cleanForOcr(stretchContrast(toGray(data.data)), c.width, c.height);
  for (let i = 0; i < g.length; i++) {
    data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = g[i];
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

// Small JPEG of the original photo to keep with the panel (same size limits as other photos).
export function photoDataUrl(img, rotate = 0, max = 1400) {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const k = Math.min(1, max / Math.max(W, H));
  const w = Math.round(W * k), h = Math.round(H * k);
  const turn = ((rotate % 360) + 360) % 360;
  const side = turn === 90 || turn === 270;
  const c = document.createElement('canvas');
  c.width = side ? h : w;
  c.height = side ? w : h;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  let q = 0.72;
  let url = c.toDataURL('image/jpeg', q);
  while (url.length > 850000 && q > 0.3) { q -= 0.12; url = c.toDataURL('image/jpeg', q); }
  return url;
}

// Read the text twice (row mode, then sparse mode, which catches numbers in their own boxes).
// onProgress(0..1, words) while it works. -> [text1, text2]
export async function readText(canvas, onProgress = () => {}) {
  onProgress(0, 'Getting the reader ready (first time takes a little longer)…');
  const T = await loadReader();
  let pass = 0;
  const worker = await T.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(0.15 + 0.425 * (pass + (m.progress || 0)), 'Reading the label…');
      else if (/load|initializ/i.test(m.status || '')) onProgress(0.15 * (m.progress || 0), 'Getting the reader ready (first time takes a little longer)…');
    },
  });
  try {
    const texts = [];
    for (const psm of ['4', '11']) {
      await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: psm });
      const { data } = await worker.recognize(canvas);
      texts.push(data.text || '');
      pass++;
    }
    return texts;
  } finally {
    worker.terminate();
  }
}
