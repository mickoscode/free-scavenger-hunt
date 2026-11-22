// Serves the built site and the API on http://localhost:8787 with an in-memory store (restart to reset).
// A site admin exists: username "siteadmin", password "dev-password-123".  npm run dev
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createApp } from '../api/app.js';
import { createMemoryAssets } from '../api/assets.js';
import { hashPassword } from '../api/lib/passwords.js';
import { createMemoryStore } from '../api/store/memory.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

// The same security headers CloudFront adds: the very function it runs (terraform/headers.js) with the policy text Terraform uses.
// (upgrade-insecure-requests is dropped: this server is plain http.)
const CSP = (await readFile(path.join(root, 'terraform/csp.txt'), 'utf8')).trim().replace('; upgrade-insecure-requests', '');
const headersFn = {};
vm.runInNewContext((await readFile(path.join(root, 'terraform/headers.js'), 'utf8')).replaceAll('__CSP__', CSP), headersFn);
const SECURITY = Object.fromEntries(Object.entries(headersFn.handler({ response: { headers: {} } }).headers).map(([k, v]) => [k, v.value]));

// The very function CloudFront runs.
const sandbox = {};
vm.runInNewContext(await readFile(path.join(root, 'terraform/rewrite.js'), 'utf8'), sandbox);

export async function startDevServer({ port = 8787, now = Date.now, quiet = false } = {}) {
  const store = createMemoryStore(now);
  const assets = createMemoryAssets();
  await store.createUser({ name: 'siteadmin', role: 'site-admin', status: 'active', maxEvents: 1000, sessionGen: 0, passwordHash: await hashPassword('dev-password-123'), createdAt: now() });
  const handle = createApp({ store, assets, now });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const out = await handle({
          method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers,
          body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined, ip: req.socket.remoteAddress,
        });
        // The browser is on plain http locally, so the Secure flag is dropped from cookies here (CloudFront serves https).
        res.writeHead(out.status, { ...out.headers, ...(out.cookies.length ? { 'set-cookie': out.cookies.map((c) => c.replace('; Secure', '')) } : {}) });
        return res.end(out.body);
      }
      if (url.pathname.startsWith('/assets/')) {
        const file = assets.files.get(url.pathname.slice(1));
        if (!file) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': file.contentType });
        return res.end(file.bytes);
      }
      const rewritten = sandbox.handler({ request: { uri: url.pathname, querystring: Object.fromEntries([...url.searchParams].map(([k, v]) => [k, { value: v }])) } });
      if (rewritten.statusCode) { res.writeHead(rewritten.statusCode, { location: rewritten.headers.location.value }); return res.end(); }
      const file = path.join(dist, path.normalize(rewritten.uri));
      if (!file.startsWith(dist)) { res.writeHead(400); return res.end(); }
      const body = await readFile(file);
      res.writeHead(200, { ...SECURITY, 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      return res.end(body);
    } catch {
      try { const nf = await readFile(path.join(dist, '404.html')); res.writeHead(404, { ...SECURITY, 'content-type': TYPES['.html'] }); res.end(nf); } catch { res.writeHead(404); res.end(); }
    }
  });
  await new Promise((resolve) => server.listen(port, resolve));
  if (!quiet) console.log(`http://localhost:${server.address().port}  (site admin: siteadmin / dev-password-123)`);
  return { server, store, assets, port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await startDevServer({ port: Number(process.env.PORT ?? 8787) });
