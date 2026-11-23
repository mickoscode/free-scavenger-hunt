// The starter "Demo Hunt" every organiser gets on signup: five well known Perth locations with ten questions each, plus a
// "Code-breakers" zone of three logic puzzles built from the other zones' questions. No photo challenges (they need a WhatsApp
// group). Most questions are answerable by anyone, anywhere, from the clue in the question or from the zone's picture; a few
// are local trivia, so testers also meet wrong answers, which is part of what a demo is for.
//
// The Code-breakers answers are computed from the questions they refer to, so they can never drift apart (tests check this).
import { readFileSync } from 'node:fs';

const credits = JSON.parse(readFileSync(new URL('./credits.json', import.meta.url), 'utf8'));

const POINTS = 5;
const q = (type, text, answers) => ({ type, text, answers: [].concat(answers), score: POINTS });
const text = (t, ...answers) => q('string', t, answers);
const whole = (t, n) => q('whole-number', t, String(n));
const decimal = (t, n) => q('decimal', t, String(n));

export const ZONES = [
  {
    key: 'kings-park', name: 'Kings Park',
    questions: [
      text('Kings Park is in the capital city of Western Australia. Which city is that?', 'perth'),
      whole("Kings Park opened in 1895 as 'Perth Park' and was renamed 'Kings Park' in 1901. How many years later was it renamed?", 6),
      text('Look at the picture: which two words are written around the edge of the round mosaic?', 'kings park'),
      decimal('The park covers about 4.06 square kilometres. Another park is exactly half that size. How many square kilometres is it?', 2.03),
      text("The State War Memorial has a pool of reflection and an eternal ___ of remembrance. What is the missing word?", 'flame'),
      whole('A walking trail is 3 km long. You walk it there and back twice. How many kilometres do you walk in total?', 12),
      text('Kings Park holds the Western Australian Botanic Garden. Plants from which country does it mostly grow?', 'australia'),
      whole('A treetop bridge walk has 7 sections, each 10 metres long. How many metres long is the whole bridge?', 70),
      text('Kings Park looks out over which river?', 'swan river', 'swan'),
      decimal('A coffee at the park cafe costs $4.50 and a cake costs $5.25. What is the total cost in dollars?', 9.75),
    ],
  },
  {
    key: 'elizabeth-quay', name: 'Elizabeth Quay',
    questions: [
      whole('The Swan Bells tower holds 18 bells. Twelve of them are very old and the rest are new. How many are new?', 6),
      text("The tower's name includes a bird that is the state emblem of Western Australia. Which bird?", 'black swan', 'swan'),
      whole('Elizabeth Quay opened in 2016. If it is now 2026, how many years ago was that?', 10),
      whole('A ferry crosses the river every 15 minutes. How many ferries leave in one hour?', 4),
      decimal('A ferry ticket costs $3.50. How much do 4 tickets cost in dollars?', 14),
      text('Elizabeth Quay was named after a queen. What was her first name?', 'elizabeth'),
      whole('The tower has 3 viewing floors and each floor holds 25 visitors. How many visitors can be on all the floors?', 75),
      text('Elizabeth Quay sits beside which river?', 'swan river', 'swan'),
      text("Look at the picture: the big copper-coloured shapes beside the glass spire look like the ___ of a boat. What is the missing word?", 'sails', 'sail'),
      decimal('One tower is 80 metres tall and a second tower is 2.5 metres taller. How tall is the second tower in metres?', 82.5),
    ],
  },
  {
    key: 'fremantle-prison', name: 'Fremantle Prison',
    questions: [
      whole('Fremantle Prison opened in 1859 and closed in 1991. For how many years was it a prison?', 132),
      text('Look at the picture: what is on the front of the gatehouse, above the arch, that tells you the time?', 'clock'),
      text('The prison was built from a pale local stone that is also used in many Perth buildings. What is it? (Hint: it is also the rock that forms many caves.)', 'limestone'),
      whole('The gatehouse has 2 towers and each tower has 4 narrow windows. How many windows are in the towers altogether?', 8),
      text('Fremantle Prison is a UNESCO ___ Heritage site. What is the missing word?', 'world'),
      whole('Tours leave every 30 minutes from 10:00 to 16:00, including both of those times. How many tours leave in a day?', 13),
      decimal('A prison tour costs $25.50 for each adult. What do 2 adults pay in dollars?', 51),
      text('In which port city, south-west of Perth, does the prison stand? (Hint: it starts with F.)', 'fremantle'),
      whole('Convicts were sent to Western Australia from 1850 until 1868. For how many years was that?', 18),
      text("Look at the picture: a flag is flying on the left. Which country's flag is it? (Hint: it has the Southern Cross.)", 'australia'),
    ],
  },
  {
    key: 'cottesloe-beach', name: 'Cottesloe Beach',
    questions: [
      text("Cottesloe Beach faces the Indian Ocean, so people watch the sun set over the sea. In which direction does the beach face?", 'west'),
      whole('Lifeguards put a flag every 25 metres along 100 metres of sand, including a flag at both ends. How many flags are there?', 5),
      text("Look at the picture: the tall dark trees in front of the building are Norfolk Island ___. What is the missing word?", 'pine', 'pines'),
      decimal('A bottle of water costs $3.50 and sunscreen costs $12.95. What is the total in dollars?', 16.45),
      text("Every March a free exhibition called 'Sculpture by the ___' is held on this beach. What is the missing word?", 'sea'),
      whole('You arrive at 3:15pm and the sun sets at 7:45pm. How many minutes until sunset?', 270),
      text("The old building on the left of the picture is the Indiana ___ House. What is the missing word?", 'tea'),
      whole('The beach is 400 metres long. You walk its whole length 3 times. How many metres do you walk?', 1200),
      text('Look at the picture: what colour is the sea in the top right?', 'blue'),
      text("Which suburb's beach is this? (Hint: Cottes___.)", 'cottesloe'),
    ],
  },
  {
    key: 'optus-stadium', name: 'Optus Stadium',
    questions: [
      whole('The stadium holds about 60,000 people. If 45,000 have arrived, how many seats are still empty?', 15000),
      text('Which winter football code do the West Coast Eagles and the Fremantle Dockers play here? (Initials are fine.)', 'afl', 'australian rules football', 'australian football', 'aussie rules', 'footy'),
      text('Look at the picture: there is a rectangular strip in the middle of the grass. Which bat-and-ball sport is it used for?', 'cricket'),
      whole('Optus Stadium opened in 2018. If it is now 2026, how many years ago was that?', 8),
      decimal('A pie costs $6.50 and a drink costs $4.25. A fan buys 2 pies and 2 drinks. What is the total in dollars?', 21.5),
      text('Optus Stadium stands beside which river?', 'swan river', 'swan'),
      whole('A match has 4 quarters of 20 minutes each. How many minutes of quarters is that in total?', 80),
      text('In which Perth suburb is the stadium? (Hint: it starts with B.)', 'burswood'),
      whole('A train has 6 carriages carrying 150 fans each. How many fans are on the train?', 900),
      text('What shape is the playing field in the picture? (Hint: like an egg.)', 'oval'),
    ],
  },
];

// Answers read out of the zones above, by (zone key, question number from 1).
const answerOf = (zoneKey, n) => ZONES.find((z) => z.key === zoneKey).questions[n - 1].answers[0];
const firstLetter = (zoneKey, n) => answerOf(zoneKey, n)[0];

export const CODE_BREAKERS = {
  key: 'code-breakers', name: 'Code-breakers',
  // Each puzzle names the questions it uses. Players need only the answers they already worked out: no travel needed.
  questions: () => [
    { type: 'whole-number', score: 20, text: 'Add your answer to Kings Park question 2 to your answer to Elizabeth Quay question 1. What is the total?', answers: [String(Number(answerOf('kings-park', 2)) + Number(answerOf('elizabeth-quay', 1)))] },
    { type: 'whole-number', score: 20, text: 'Multiply your answer to Cottesloe Beach question 2 by your answer to Fremantle Prison question 4. What is the result?', answers: [String(Number(answerOf('cottesloe-beach', 2)) * Number(answerOf('fremantle-prison', 4)))] },
    { type: 'string', score: 20, text: 'Take the first letter of your answers to Kings Park question 9, Fremantle Prison question 10 and Cottesloe Beach question 1, in that order. Which 3-letter word do they spell?', answers: [firstLetter('kings-park', 9) + firstLetter('fremantle-prison', 10) + firstLetter('cottesloe-beach', 1)] },
  ],
};

export const INSTRUCTIONS = `# Welcome to the Demo Hunt

This is a practice hunt, made for you so you can try everything straight away. When you are ready, press **Clone** next to it under **My hunts** to make your own copy, then change the questions, maps and settings.

## How to play

- Join with a team name. One team plays on **one phone**.
- When the game starts, tap a **zone** to open its questions. Tap the zone's picture to enlarge it.
- Each question can be answered **once**, so read it carefully before you press Submit. A form says **Done** after you answer, and never tells you whether you were right.
- Answer text questions in your own words (small spelling mistakes are fine). Number questions accept digits only.
- Watch the **countdown** at the top: answers close at the end time, exactly.

## Scoring

- Each question is worth points shown beside it. A correct answer earns them; a wrong one earns none.
- The **scoreboard** shows the teams ranked by points. It shows how many questions each team has attempted, not which were right.
- When the organiser publishes the final results you can open your own results to see every answer and the official answers.

## Code-breakers

The last zone needs no travelling: use your answers to the other zones' questions to solve the puzzles for bonus points.

## Fair play

- Be kind: no rude team names. Teams with unsuitable names may be removed.
- Work with your team, not against other teams.
- Have fun!

## Image credits

${credits.map((c) => `- **${c.zone === 'code-breakers' ? 'Code-breakers' : c.zone.replace(/-/g, ' ')}**: ${c.title}${c.source.startsWith('http') ? ` by ${c.author}, ${c.license}, ${c.source}` : ` (${c.author})`}`).join('\n')}
`;

// maps: { [zoneKey]: { thumb, full } } (addresses of the uploaded pictures). Returns content in the shape lib/content.js validates.
export function demoContent(maps) {
  const zones = [...ZONES, CODE_BREAKERS].map((zone, i) => ({
    id: `z${i + 1}`,
    name: zone.name,
    map: maps[zone.key] ?? null,
    questions: (typeof zone.questions === 'function' ? zone.questions() : zone.questions).map((x, j) => ({ id: `q${j + 1}`, type: x.type, text: x.text, answers: x.answers, score: x.score })),
  }));
  return { instructions: INSTRUCTIONS, zones };
}

export const DEMO_IMAGE_KEYS = [...ZONES.map((z) => z.key), 'code-breakers'];
