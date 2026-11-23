import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, matchPictures, parseHuntFile, toContent } from '../../web/js/hunt-file.js';

const config = { name: 'Beach Hunt', timeZone: 'Australia/Perth', day: '2026-11-27', start: '16:45', end: '18:15', teamNames: true, joinCode: 'SECRET1', whatsappUrl: 'https://chat.whatsapp.com/abcdefghij' };
const content = {
  instructions: '# Rules\n- Be kind',
  zones: [
    { id: 'z1', name: 'Beach', map: { thumb: '/assets/h1/z1-ab-thumb.webp', full: '/assets/h1/z1-ab-full.webp' }, questions: [
      { id: 'q1', type: 'whole-number', text: 'How many flags?', answers: ['3'], score: 5 },
      { id: 'q2', type: 'photo', text: 'Photo of a gull', answers: [], score: 20 }] },
    { id: 'z2', name: 'Park', map: null, questions: [{ id: 'q1', type: 'string', text: 'Name the cafe', answers: ['Joes', "Joe's"], score: 10 }] },
  ],
};

test('export: one json file, pictures named by zone, no join code, WhatsApp link, ids or teams', () => {
  const { json, pictures } = buildExport(config, content);
  assert.deepEqual(pictures, [{ name: 'zone1-map.webp', url: '/assets/h1/z1-ab-full.webp' }]);
  const file = JSON.parse(json);
  assert.equal(file.format, 'free-scavenger-hunt');
  assert.equal(file.version, 1);
  assert.deepEqual(Object.keys(file.settings), ['name', 'timeZone', 'day', 'start', 'end', 'teamNames']);
  assert.equal(file.zones[0].map, './zone1-map.webp');
  assert.equal(file.zones[1].map, null);
  assert.deepEqual(file.zones[0].questions[1], { type: 'photo', text: 'Photo of a gull', score: 20 }); // photo challenges carry no answers
  assert.doesNotMatch(json, /SECRET1|whatsapp|"id"|assets\//);
  assert.match(json, /\n {2}"zones"/); // indented: made to be read and edited
});

test('export then import gives back the same hunt', () => {
  const parsed = parseHuntFile(buildExport(config, content).json);
  assert.equal(parsed.ok, true);
  const back = toContent(parsed, [{ thumb: '/t', full: '/f' }, null]);
  assert.equal(back.instructions, content.instructions);
  assert.deepEqual(back.zones.map((z) => [z.id, z.name, z.questions.map((q) => [q.id, q.type, q.text, q.answers, q.score])]),
    content.zones.map((z) => [z.id, z.name, z.questions.map((q) => [q.id, q.type, q.text, q.answers, q.score])]));
  assert.deepEqual(back.zones[0].map, { thumb: '/t', full: '/f' });
  assert.deepEqual(parsed.settings.name, 'Beach Hunt');
});

const file = (extra = {}) => JSON.stringify({ format: 'free-scavenger-hunt', version: 1, zones: [{ name: 'A', questions: [{ type: 'string', text: 'Q', answers: ['x'] }] }], ...extra });

test('hand-written files: scores default, a single "answer" is accepted, numbers become text, settings are optional', () => {
  const p = parseHuntFile(JSON.stringify({ format: 'free-scavenger-hunt', version: 1, zones: [{ name: 'A', questions: [
    { type: 'whole-number', text: 'Q', answer: 7 }, { type: 'photo', text: 'P' }, { type: 'string', text: 'S', answers: ['a'], score: 2.5 }] }] }));
  assert.equal(p.ok, true);
  assert.deepEqual(p.zones[0].questions.map((q) => [q.answers, q.score]), [[['7'], 10], [[], 20], [['a'], 2.5]]);
  assert.deepEqual(p.settings, {});
  assert.equal(p.instructions, '');
});

test('simple, specific errors', () => {
  const err = (text) => { const p = parseHuntFile(text); assert.equal(p.ok, false); return p.error; };
  assert.match(err('{ nope'), /not valid JSON/);
  assert.match(err('[1]'), /should start with \{/);
  assert.match(err('{}'), /"format": "free-scavenger-hunt"/);
  assert.match(err(file({ version: 2 })), /version 2/);
  assert.match(err(file({ zones: [] })), /"zones" list/);
  assert.match(err(file({ zones: [{ questions: [] }] })), /Zone 1 needs a "name"/);
  assert.match(err(file({ zones: [{ name: 'A' }] })), /Zone 1 needs a "questions" list/);
  assert.match(err(file({ zones: [{ name: 'A', questions: [{ type: 'riddle', text: 'x' }] }] })), /Zone 1, question 1: "type" must be one of/);
  assert.match(err(file({ zones: [{ name: 'A', questions: [{ type: 'string' }] }] })), /question 1 needs "text"/);
  assert.match(err(file({ zones: [{ name: 'A', questions: [{ type: 'string', text: 'x' }] }] })), /needs "answers"/);
  assert.match(err(file({ zones: [{ name: 'A', questions: [{ type: 'string', text: 'x', answers: ['a'], score: 'ten' }] }] })), /"score" must be a number/);
  assert.match(err(file({ zones: [{ name: 'A', map: 5, questions: [] }] })), /"map" must be a picture name/);
});

test('pictures are matched by file name, wherever they were picked from and in any capitals', () => {
  const zones = [{ mapRef: './zone1-map.png' }, { mapRef: 'pics/Zone2-MAP.JPG' }, { mapRef: './nothing.png' }, { mapRef: null }];
  const files = [{ name: 'ZONE1-map.png' }, { name: 'zone2-map.jpg' }, { name: 'other.png' }];
  const m = matchPictures(zones, files);
  assert.equal(m[0].file, files[0]);
  assert.equal(m[1].file, files[1]);
  assert.deepEqual([m[2].file, m[2].wanted], [null, 'nothing.png']);
  assert.deepEqual(m[3], { wanted: null, file: null });
});
