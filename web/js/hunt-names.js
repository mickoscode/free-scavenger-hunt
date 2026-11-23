// Names for hunts. Pure functions, no page code.

// "Summer Fun Hunt!" -> "summer-fun-hunt": letters, numbers and single dashes, at most 40 characters, never starting or ending with a dash.
export function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');
}

// What a copy of a hunt is called by default: "v2-Summer Fun Hunt" at "v2-summer-fun-hunt". The version is the next one not already in use
// by one of the organiser's hunts, and an existing "v2-" prefix is replaced rather than stacked ("v3-Summer Fun Hunt", not "v2-v2-...").
export function cloneDefaults(name, slug, existingSlugs) {
  const baseName = String(name).replace(/^v\d+-/i, '');
  const baseSlug = String(slug).replace(/^v\d+-/, '');
  const taken = new Set(existingSlugs);
  const withVersion = (n) => `v${n}-${baseSlug}`.slice(0, 40).replace(/-+$/, '');
  let n = 2;
  while (taken.has(withVersion(n))) n += 1;
  return { name: `v${n}-${baseName}`.slice(0, 80), slug: withVersion(n) };
}
