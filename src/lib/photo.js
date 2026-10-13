// Compress a photo client-side to a small JPEG data URL so it fits in a Firestore
// document (1 MB limit) on the free plan. Targets ~200 KB.
export async function compressPhoto(file, { maxSide = 1024, maxBytes = 200_000 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    let side = maxSide;
    let out = '';
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      for (const q of [0.72, 0.6, 0.5, 0.4]) {
        out = c.toDataURL('image/jpeg', q);
        if (out.length * 0.75 <= maxBytes) return out;
      }
      side = Math.round(side * 0.75);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
