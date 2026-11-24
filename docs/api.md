# API reference

JSON over HTTPS under `/api/`. Errors are `{ "error": "<code>" }`. Statuses: 200, 400 (invalid or unknown), 401 (not signed in / no team session), 405, 409 (wrong state), 429 (rate limited), 500. Bodies of POST/PUT/PATCH/DELETE must be `application/json`. Implementation: `api/` (routes in `api/routes-*.js`, rules in `api/lib/`).

## Accounts (`routes-auth.js`)
`POST /api/auth/register {username,password}` (also returns `recoveryCodes`, once) · `POST /api/auth/login` · `POST /api/auth/recover {username,code,next}` · `POST /api/auth/recovery-codes {password}` (new set, shown once) · `POST /api/auth/notices/dismiss` · `POST /api/auth/logout` · `GET /api/auth/me` (`{user, registrationOpen}`) · `POST /api/auth/password {current,next}` · `POST /api/auth/delete {password}`

## Players (`routes-public.js`), `:org` is the organiser's 4 character code and `:slug` the hunt name (`/e/:org/:slug/` on the site)
| Route | Notes |
|---|---|
| `GET /api/events/:org/:slug/info` | name, status, `timeZone` (the hunt's, for wording the start), `startMs`/`endMs`/`serverNowMs`, `teamNames`, `joinCodeRequired`, `resultsPublished`. Cacheable 3 s |
| `GET /api/events/:org/:slug/scoreboard` | `{teams:[{rank,name,done,score,number?}], questionTotal, resultsPublished}`. `number` only once published. `score` includes the organiser's adjustment only once the results are published (never the reason). Cacheable 3 s |
| `POST /api/events/:org/:slug/join {name,code}` | sets the team cookie. `wrong-code`, `name-taken`, `invalid-name`, `not-joinable`, `event-full` |
| `GET /api/events/:org/:slug/me` | team session: number, name, `score` (the team's own total: running total, plus the organiser's adjustment once the results are published), `done:{answers,photos}`, `whatsappUrl` |
| `GET /api/events/:org/:slug/play` | team session: `instructions`; `zones` (questions without answers) only while active |
| `POST /api/events/:org/:slug/answer {zone,question,answer}` · `POST .../photo {zone,question}` | `already-submitted`, `invalid-answer`, `not-playing`, `no-question` |
| `GET /api/events/:org/:slug/results` | team session: `{published:false}` or the full breakdown, incl. `total` and `adjustment:{points,reason}` or `null` (the organiser's bonus or penalty, already in `total`) |
| `GET /api/events/:org/:slug/results/team/:n` | public summary without answers once published; `adjustment` is `{points}` or `null` (never the reason) |

## Organisers (`routes-admin.js`), `:id` is the hunt's id
`GET|POST /api/admin/events` · `GET|DELETE /api/admin/events/:id` · `PUT .../config` · `PUT .../content` · `POST .../zones/:zone/map {thumb,full}` (base64) · `POST .../duplicate {slug,name}` (the Clone button) · `GET .../teams` (each team: `score` running total, `adjustment` or `null`, `final` = total with the adjustment; also `scoringOpen`, `resultsPublished`) · `PUT .../teams/:n/adjustment {points,reason}` (one per team; empty or 0 `points` removes it; 400 `invalid-adjustment` with `problems:['points'|'reason']`; 409 `results-published` or `scoring-closed`) · `DELETE .../teams/:n` · `GET .../teams/:n/results` · `GET .../photos` · `POST .../photos/score {team,zone,question,decision}` · `POST .../publish {confirm:true}` · `POST .../unpublish` · `POST .../player-data/delete {confirm:"delete", override?}`

## Site admin (`routes-site.js`)
`GET /api/site/users` · `PATCH /api/site/users/:name {status?,maxEvents?}` · `POST /api/site/users/:name/reset-password` · `DELETE /api/site/users/:name {confirm}` · `GET|PUT /api/site/settings {registrationOpen}`. `GET /api/admin/events?all=1` lists every hunt for the site admin.
