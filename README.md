# free-scavenger-hunt

A website that lets anyone create and host a free scavenger hunt for their community. Organisers sign up, build a hunt entirely inside the site (zones, maps, questions, instructions, settings), share a QR code, and run it live; players join on their phones with no account. One **site admin** oversees everything; each **event admin** (organiser) manages only their own hunts. Spec: `docs/requirements.md`.

## Layout

| Path | What it is |
|---|---|
| `web/` | The static site: `index.html` (landing), `event/{view,play,results}/` (the player pages, served at `/e/<hunt>/...`), `admin/` (organiser pages: sign in and hunts, `event/` manager, `site/` site admin), `js/` (ES modules, no framework), `css/site.css` |
| `api/` | The API (Node, one Lambda): `app.js` router, `routes-*.js`, `lib/` game rules as pure functions, `store/` (in-memory and DynamoDB behind one interface), `assets.js` (map images) |
| `terraform/` | The app's infrastructure (CI applies it): S3, CloudFront, DynamoDB, Lambda, API Gateway, deploy role. `rewrite.js` is the CloudFront Function; `csp.txt` the content security policy |
| `terraform/bootstrap/` | State bucket, CI roles and **all GitHub settings of this repo**, applied from an admin machine with `scripts/bootstrap.sh` |
| `scripts/` | `build.sh`, `package-backend.sh`, `dev-server.js`, `smoke-test.js`, `create-site-admin.js`, `bootstrap.sh` |
| `tests/` | `unit/` (pages vs CSP, helpers, rewrite), `api/` (store contract, every rule of the game, tenant isolation), `browser/` (Chromium: a whole hunt through the real pages) |
| `docs/` | `requirements.md`, `api.md`, `organiser-guide.md`, `setup.md` |

## Develop

```sh
npm ci
npm test                 # build, unit tests, API tests (in-memory store, controllable clock)
npx playwright install chromium && npm run test:browser
npm run dev              # http://localhost:8787, in-memory data; site admin: siteadmin / dev-password-123
node scripts/smoke-test.js http://localhost:8787
```

Mobile first. The CSP allows only the site's own files: no inline script/style, no CDNs (`npm test` fails if you break this). Team names and any user text go on the page with `textContent`.

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `web-pr.yml` | pull request | `Validate site` (build, unit and API tests), `API tests` (store contract on DynamoDB Local), `Browser tests` (Chromium) |
| `terraform-pr.yml` | PR touching `terraform/` | fmt, validate, tflint, Trivy, read-only plan as a PR comment |
| `terraform-apply.yml` | push to `main` touching `terraform/` | plan, approval (`terraform-production` environment), apply, then a deploy |
| `deploy.yml` | push to `main` touching `web/`, `api/`..., or manual | tests, deploy the API (Lambda), sync the site, invalidate CloudFront, smoke test the live site with a throwaway account |
| `delete-merged-branch.yml` | PR merged | deletes the branch |

No secrets in GitHub, no AWS keys: workflows assume AWS roles through GitHub OIDC. This project shares only the AWS account with anything else (resources are named `fsh-*`).
