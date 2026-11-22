// Makes a map image small in the browser before it is uploaded: a thumbnail and a full-size picture (WebP where possible).
const MAX_BYTES = 480 * 1024;

async function toBlob(bitmap, maxSide, type) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  return null;
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = reject;
  r.readAsDataURL(blob);
});

// -> { thumb, full } as base64, or null when the file is not an image the browser can read.
export async function shrinkMap(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return null; }
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const type = probe.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  const [thumb, full] = await Promise.all([toBlob(bitmap, 320, type), toBlob(bitmap, 1400, type)]);
  bitmap.close?.();
  return thumb && full ? { thumb: await toBase64(thumb), full: await toBase64(full) } : null;
}
