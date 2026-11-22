# The Demo Hunt

Every new organiser account gets this hunt (`api/demo/content.js`, created by `api/demo/create.js`). It is playable 5 minutes after signup and open for 15 minutes.

| Zone | Questions | Picture |
|---|---|---|
| Kings Park | 10 | Kings Park mosaic and State War Memorial |
| Elizabeth Quay | 10 | Swan Bells tower |
| Fremantle Prison | 10 | the prison gatehouse |
| Cottesloe Beach | 10 | beach and Indiana Tea House |
| Optus Stadium | 10 | inside the stadium |
| Code-breakers | 3 | original artwork (`scripts/make-demo-logo.js`) |

Design rules: no photo challenges; every kind of answer (text, whole number, decimal) appears; at least half of the questions can be answered by anyone from the clue in the question or from the zone's picture, and a few are local trivia so a tester also sees a wrong answer. The Code-breakers questions refer to other zones' questions by number (`Kings Park question 2`), never to their answers, and their answers are computed from the referenced answers.

## Image credits and licences

The five photographs are from Wikimedia Commons under open licences and are shown to every organiser with their author, licence and source in the demo's *Image credits* section (generated from `api/demo/credits.json`). They are stored at 320 px and 1280 px wide, as downloaded from Commons.

| Zone | Author | Licence | Source |
|---|---|---|---|
| Kings Park | Dinkum | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Botanic_Garden_Kings_Park_in_Perth_WA,_Australia.JPG |
| Elizabeth Quay | W. Bulach | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:00_1633_Swan_Bell_Tower_in_Perth,_Australia.jpg |
| Fremantle Prison | Calistemon | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Fremantle_Prison_Gatehouse,_July_2023_01.jpg |
| Cottesloe Beach | Calistemon | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Cottesloe_Beach,_May_2021_01.jpg |
| Optus Stadium | Gnangarra | CC BY 2.5 AU | https://commons.wikimedia.org/wiki/File:Perth_Stadium_opening_210118_gnangarra-12.jpg |

To change a picture, replace the two files in `api/demo/images/` (at most 500 KB each) and update `credits.json`.
