# Requirements

Free Scavenger Hunt is a website where **anyone can create and run a scavenger hunt** for their school, club or community, at no cost. Many hunts run side by side, each owned by its organiser. Players need no account: they scan a QR code, pick a team name and play on a phone.

Everything an organiser needs is **inside the site**: no files to upload from another repository, no tools to run. Zones, maps, questions, instructions and settings are all edited on the organiser pages.

## Public pages

- **Front page** (`/`): the site name and one-paragraph pitch, *Create your hunt* and *Organiser sign in* buttons, a *Joining a hunt?* box (type `code/hunt-name`), and a three-step *How it works*; dressed up with a gradient hero, a map-and-trail illustration, short feature chips and numbered step cards. A phone that left a game by accident also sees *Return to your game* at the top. The wording of the pitch, the joining box and the three steps is the owner's and is not to be changed without asking.
- **About** (`/about/`): written in the owner's voice by their brief: why the site exists (playing outside with mates in the 80s), the surf club scavenger hunts that took a lot of writing and printing, the parkrun inspiration, why it is free (no ads, no fees, no premium tier), and exactly what is and is not kept (no email or real name, no analytics, tracking, ads, third-party scripts or visitor logs, nothing sold or shared), a link to the open source code, and "not affiliated" notes for the surf club and parkrun. Every privacy statement on it must stay true: check `docs/security.md` and the code before changing either.
- Both pages share a header (About, Organiser sign in) and a footer ("Made in Perth, Western Australia").

## People

| Role | Who | Can |
|---|---|---|
| **Site admin** | The owner of the site (one account, created by `scripts/create-site-admin.js`) | Everything: see and manage every hunt, suspend or delete organisers, reset passwords, set each organiser's hunt limit, close or open registration |
| **Event admin** (organiser) | Anyone who registers (username + password, no email) | Create, edit, run and delete **their own** hunts (default limit 3) |
| **Player** | Anyone with a hunt's link | Join as a team, play, see the scoreboard and results. No account |
| **Viewer** | Anyone | See the scoreboard only |

## Vocabulary

- **Organiser code**: 4 random characters (letters and digits without look-alikes, e.g. `bgh1`) given to every account when it is created. It never changes.
- **Hunt / event**: one game an organiser prepares: settings, zones, questions, instructions, maps, plus its own teams, answers and scores. Its public address is `/e/<organiser code>/<hunt name>/`, e.g. `/e/bgh1/beach-hunt/`. The name only has to be unique among that organiser's hunts, so two organisers can both have a `beach-hunt`.
- **Game**: only the playing of a hunt (phases `unconfigured`, `pre`, `active`, `post`).
- **Zone**: an area with an optional map and its questions. **Question** kinds: text, whole number, decimal, photo challenge.

## Gameplay (identical for every hunt)

- **Phases**: `unconfigured` (no questions yet), `pre` (before start; joining open, countdown), `active` (start <= now <= end, both inclusive: joining and playing open), `post` (after end: no joining, no answers, scoring continues until results are published). The server clock is the only clock that counts; browsers only display the countdown.
- **Joining**: optional join code (5 to 12 letters/digits, case, spaces and dashes ignored; shown only to the organiser; the public only learns *whether* one is needed). Team name 1 to 30 characters, unique ignoring case, basic profanity filter; or no names ("Team 7") when the organiser turns names off. Team numbers start at 1 per hunt. One team = one device; the session is a cookie that survives closing the browser.
- **Scoreboard** (refreshes every 5 s): heading `provisional results:` until the organiser publishes, then `final results:`; columns rank (ties share a place: 1, 1, 3), name, done (`attempted/total`, photos included, right or wrong), score (whole number, one decimal only when needed). Own row highlighted. After publication each name links to that team's summary.
- **Play page**: `Team 7` large, bold, blue with the name smaller and grey on the same baseline; a `‹ Scoreboard` button (and a `Results` button once published); status and countdown on one line; `Instructions (tap to show/hide)`; a tile per zone (map thumbnail, name, `3 to complete` / `completed`); tapping a tile shows the zone's map (tap to enlarge) and one form per question, each labelled `Question 3 of 10` (so puzzles can refer to them). Questions are only sent while the game is `active`.
- **Answers**: submitted once (first one counts); a form is marked `Done` only after the server confirms, and then shows nothing about what was submitted or whether it was right, until results are published. Text answers allow typos (none under 4 characters, 1 for 4 to 7, 2 for 8+; a typo is an added, missing or changed letter, or a swap of neighbours); several accepted answers allowed. Number answers: digits only (one point for decimals), exact value. Invalid input does not use up the single submission.
- **Photo challenges**: the team sends a photo to the organiser's WhatsApp group and presses `Photo sent to WhatsApp`. If the organiser set a group link, the word WhatsApp becomes a link (and an `Open WhatsApp group` button appears); the link goes only to teams, never to the public.
- **Scoring**: the organiser sees submitted photos in order sent and chooses full, half or zero, then Apply; re-applying corrects (the previous decision is deducted, never added twice). Unsent or unscored photos earn zero.
- **Publishing**: possible only after the end; needs "I have applied all scores"; reversible (`Return to provisional`). While published scoring is read-only. Saving changed settings, or deleting player data, returns a hunt to provisional.
- **Results**: a team sees its place (`You finished 3rd of 12`, medals for 1st to 3rd, ties share), total and a card per question: question, your answer, official answer(s), correct or wrong (icon and text, not colour alone) and points. Photo cards show Full / Half / Zero / Not scored yet / No photo submitted. Anybody can open a **summary without answers** of any team once published.

## Protecting players in the middle of a game

Players may be away from the QR code that got them in and may not be technical. So: no page of a game links to the site's front page or anywhere outside the game; every game page has clear buttons back to the scoreboard and the play page; the session is a long-lived cookie that survives leaving and returning; and the phone remembers the last hunt it played, so if a player does end up on the site's front page it shows a *You have a game in progress: Return to your game* button.

## Interface principles

Everything pressable looks pressable: buttons are filled or outlined with a border and shadow (not bare text), links are underlined, tappable cards have a chevron and lift on hover, touch targets are at least 44 px on phones, keyboard focus is clearly visible, and the admin tabs show the active one strongly. Status is never shown by colour alone.

## Organiser features

- **Account**: register with a username (3 to 30 letters, numbers, `-`, `_`) and a password (10+ characters). Change password; delete account (removes your hunts).
- **Recovery without anyone's help**: registration gives 8 one-time recovery codes (20 characters, about 99 bits each), shown once with copy, download and print; the organiser must tick that they saved them. Forgotten password: *Forgot your password?* on the sign in page, then username + one code + a new password. A used code is gone, every session of the account ends, the new password signs in, and the account shows a notice ("a recovery code was used") until dismissed. Codes can be remade any time with the password (the old set stops working); the dashboard warns when 2 or fewer are left. No email or any personal data is involved.
- **Dashboard**: list of your hunts, create one (name, address, time zone). The address field shows the organiser's code in front: `/e/bgh1/` + the name chosen.
- **Demo Hunt**: every new account is given a hunt called *Demo Hunt* (`/e/<code>/demo-hunt/`) so there is something to try at once, and something to copy as a template. It opens **5 minutes after the account is created** (so the organiser sees the pre-game screen) and stays open for **15 minutes** in the organiser's browser time zone (never crossing midnight), so they can play it and watch it finish without a long wait. Afterwards they change its settings like any hunt (or use *override* while it runs). It has 6 zones: Kings Park, Elizabeth Quay, Fremantle Prison, Cottesloe Beach and Optus Stadium (10 questions each, a mix of text, whole-number and decimal answers, no photo challenges, mostly answerable by anyone from the clue in the question or the zone's picture, plus a few local-knowledge questions) and *Code-breakers* (3 logic puzzles that combine other zones' questions, worth bonus points, no travelling needed). It includes generic player instructions and an image credits list. It counts as one of the organiser's hunts (default limit 4, so three of their own).
- **Overview**: share link and QR code, checklist, use as template (copy settings, questions, instructions and maps to a new hunt), delete player data (type `delete`), delete hunt (type its address).
- **Settings**: name, time zone (any), day, start, end, team names on/off, join code, WhatsApp link. Locked while the game is active (type `override` to change anyway).
- **Questions**: an in-site editor: add, reorder, copy and remove zones and questions; upload a map image per zone (shrunk in the browser: a 320 px thumbnail and a 1400 px picture, each at most 500 KB); text, whole-number, decimal and photo questions with points; several accepted text answers; instructions in simple Markdown with a live preview. Validation messages say which zone and question to fix. Locked once teams exist (delete player data first).
- **Teams**: live scoreboard, tap a team to see its answers exactly as it will see them, remove a team.
- **Scoring**: the photo queue and publishing.

## Site admin features

Users table (hunt count and limit, suspend / activate, reset password to a one-time temporary one, delete with their hunts), all hunts with their organisers, and the switch for open registration.

## Limits and abuse protection

20 zones per hunt, 30 questions per zone, content at most 256 KB, instructions 20 KB, map images 500 KB, 300 teams per hunt, 3 hunts per organiser (site admin can change), 60 MB of uploaded pictures per hunt. Rate limits: 4 registrations per hour per address and 30 per hour overall; 8 wrong passwords per 15 minutes per username; 30 joins per hour per address per hunt. API Gateway throttles at 25 requests per second sustained, burst 60 (cached scoreboard reads do not count); see `docs/security.md` for why this is also the cost ceiling.

## Security model

- Passwords: scrypt. Recovery codes: random, 99 bits, only a hash bound to the username is stored (a database copy yields nothing usable), compared in constant time without early exit, 5 attempts per account per hour and 15 per address per hour, refused for suspended accounts, identical errors for wrong code and unknown account.
- Privacy: no email, name or any personal data is stored. Rate limit counters are keyed by a hash of the address and expire within two hours. The site admin can reset a password (a one-time temporary password) but cannot see passwords or codes, and the owner is shown an "admin reset" notice on their next visit. Admin sessions: random token, only its hash stored, 12 hours, cookie `HttpOnly; Secure; SameSite=Strict`, ended by password change, reset or suspension. All state-changing API calls require `application/json`.
- Tenancy: every admin route resolves the hunt through its owner; another organiser's hunt looks exactly like a missing one (`no-event`). Team sessions are per hunt.
- Answers never leave the server before publication. The content security policy allows only the site's own files; page code builds the DOM with `textContent`.
- API errors avoid 403 and 404 (CloudFront replaces them with the site's 404 page): 400 unknown/invalid, 401 not signed in, 409 wrong state, 429 rate limited.

## Parked

Recovery by email (needs a sending domain and AWS email production access, and would store an address; the codes cover it without), custom domain, download of results, CSV export, translations.
