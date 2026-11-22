// The landing page: go to a hunt by its name.
import { $ } from './dom.js';

$('#find-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const slug = $('#slug').value.trim().toLowerCase().replace(/^\/?e\//, '').replace(/\/+$/, '');
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) { $('#find-error').hidden = false; return; }
  location.href = `/e/${slug}/`;
});
