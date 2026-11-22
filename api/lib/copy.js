// Copying a hunt's content: every zone picture is copied to new files under the destination hunt, and the content comes back with
// the new addresses. Used by "use this hunt as a template" and by the Demo Hunt every new organiser gets.
import { randomId } from './passwords.js';

export async function copyContent({ assets }, content, fromEventId, toEventId) {
  const zones = [];
  for (const z of content.zones) {
    let map = null;
    if (z.map) {
      const tag = randomId(8);
      map = {};
      for (const kind of ['thumb', 'full']) {
        const from = String(z.map[kind]).slice(1);
        if (!from.startsWith(`assets/${fromEventId}/`)) throw new Error('a picture outside its own hunt'); // never copy anything else
        const to = `assets/${toEventId}/${z.id}-${tag}-${kind}.${from.split('.').pop()}`;
        await assets.copy(from, to);
        map[kind] = `/${to}`;
      }
    }
    zones.push({ ...z, map });
  }
  return { ...content, zones };
}
