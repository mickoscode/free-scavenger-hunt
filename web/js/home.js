// The landing page: go to a hunt by its address, and a way back for a phone that is in the middle of a game.
import { $ } from './dom.js';
import { eventUrl, recallHunt } from './api.js';

const last = recallHunt();
if (last) {
  $('#continue-name').textContent = last.name;
  $('#continue-link').href = eventUrl(last);
  $('#continue-card').hidden = false;
}

$('#find-form').addEventListener('submit', (event) => {
  event.preventDefault();
  // Accepts "ab3k/beach-hunt", "e/ab3k/beach-hunt" or a whole pasted address.
  const m = /([a-z2-9]{4})\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\/?(?:[?#].*)?$/.exec($('#slug').value.trim().toLowerCase());
  if (!m) { $('#find-error').hidden = false; return; }
  location.href = `/e/${m[1]}/${m[2]}/`;
});
