# The original Demo Hunt

This folder is the **original** Demo Hunt kept as plain data: 6 zones, 53 questions, 12 pictures, generic player instructions and an image credits list. The site never reads it. It exists so the demo can be put back if it is ever lost or spoiled.

How the demo works on the live site: every new organiser gets a copy of the hunt called **`master-demo`** in the site admin's account (see `docs/requirements.md`, *Demo Hunt*). The site admin edits `master-demo` like any hunt; organisers who sign up afterwards get the latest copy, and demos that already exist are never changed.

## Making or restoring master-demo

```sh
node scripts/seed-master-demo.js                  # shows what it would do
node scripts/seed-master-demo.js --yes            # creates master-demo from this folder (does nothing if it exists)
node scripts/seed-master-demo.js --replace --yes  # throws the current master-demo away and restores the original
```

Protection of `master-demo` is deliberately simple: deleting a hunt already means typing its name; DynamoDB point-in-time recovery (35 days) covers its questions; and this folder is the fallback for everything, pictures included. Losing it costs a demo, not data.

## What is in it

| Zone | Questions | Picture |
|---|---|---|
| Kings Park | 10 | Kings Park mosaic and State War Memorial |
| Elizabeth Quay | 10 | Swan Bells tower |
| Fremantle Prison | 10 | the prison gatehouse |
| Cottesloe Beach | 10 | beach and Indiana Tea House |
| Optus Stadium | 10 | inside the stadium |
| Code-breakers | 3 | an original neon cipher-disc picture |

Design rules: no photo challenges; every kind of answer (text, whole number, decimal) appears; at least half of the questions can be answered by anyone from the clue in the question or the zone's picture, and a few are local trivia so a tester also sees a wrong answer. The Code-breakers questions refer to other zones' questions by number, never to their answers, and their answers are computed from the referenced answers (`content.js`).

## Image credits and licences

The five photographs are from Wikimedia Commons under open licences; their authors, licences and sources are in `credits.json` and in the demo's *Image credits* instructions section.

| Zone | Author | Licence | Source |
|---|---|---|---|
| Kings Park | Dinkum | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Botanic_Garden_Kings_Park_in_Perth_WA,_Australia.JPG |
| Elizabeth Quay | W. Bulach | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:00_1633_Swan_Bell_Tower_in_Perth,_Australia.jpg |
| Fremantle Prison | Calistemon | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Fremantle_Prison_Gatehouse,_July_2023_01.jpg |
| Cottesloe Beach | Calistemon | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Cottesloe_Beach,_May_2021_01.jpg |
| Optus Stadium | Gnangarra | CC BY 2.5 AU | https://commons.wikimedia.org/wiki/File:Perth_Stadium_opening_210118_gnangarra-12.jpg |
