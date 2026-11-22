// The optional WhatsApp group invite link. Only https://chat.whatsapp.com/<code> is accepted, stored without any query.
// -> { ok: true, url: string | null } or { ok: false }.
export function normaliseWhatsappUrl(input) {
  if (input === undefined || input === null) return { ok: true, url: null };
  if (typeof input !== 'string') return { ok: false };
  const text = input.trim();
  if (text === '') return { ok: true, url: null };
  if (/\s/.test(text)) return { ok: false };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== 'https:' || url.hostname !== 'chat.whatsapp.com' || url.port || url.username || url.password) return { ok: false };
  const code = /^\/([A-Za-z0-9_-]{10,60})\/?$/.exec(url.pathname);
  return code ? { ok: true, url: `https://chat.whatsapp.com/${code[1]}` } : { ok: false };
}
