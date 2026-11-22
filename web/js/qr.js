// A QR code as a PNG image (a data: address, which the page's security policy allows). Drawn on a canvas so it can be shown crisp at any
// size, saved as a file and printed. The white margin of 4 modules is what scanners need around a code.
import qrcode from '/js/vendor/qrcode.mjs';

export function qrPng(text, px = 1024) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const margin = 4;
  const cells = n + margin * 2;
  const scale = Math.max(1, Math.floor(px / cells));
  const canvas = document.createElement('canvas');
  canvas.width = cells * scale;
  canvas.height = cells * scale;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) g.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
  return canvas.toDataURL('image/png');
}
