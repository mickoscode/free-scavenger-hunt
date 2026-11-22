// In-memory store: local development and tests. Same interface and semantics as dynamo.js (tests/api/store.contract.js).
import { roundScore } from '../lib/scoring.js';

const clone = (x) => (x === undefined ? undefined : structuredClone(x));

export function createMemoryStore(now = Date.now) {
  const users = new Map();
  const sessions = new Map();
  const rates = new Map();
  const slugs = new Map(); // `${org}/${slug}` -> eventId
  const orgCodes = new Map(); // code -> username
  const events = new Map();
  const contents = new Map();
  const data = new Map(); // eventId -> { counter, teams: Map(n -> team), names: Set(key), answers: Map(`${n}|${key}` -> rec) }
  let settings = { registrationOpen: true };

  const bucket = (id) => {
    if (!data.has(id)) data.set(id, { counter: 0, teams: new Map(), names: new Map(), answers: new Map() });
    return data.get(id);
  };

  return {
    async createUser(u) {
      if (users.has(u.name)) return false;
      users.set(u.name, clone(u));
      return true;
    },
    getUser: async (name) => clone(users.get(name)) ?? null,
    async putUser(u) { users.set(u.name, clone(u)); },
    listUsers: async () => [...users.values()].map(clone).sort((a, b) => a.name.localeCompare(b.name)),
    async deleteUser(name) {
      const u = users.get(name);
      if (u?.code) orgCodes.delete(u.code);
      users.delete(name);
    },
    // Reserves an organiser code for a user (false if somebody else has it).
    async claimOrgCode(code, name) {
      if (orgCodes.has(code)) return false;
      orgCodes.set(code, name);
      return true;
    },

    async putSession(hash, s, ttlSec) { sessions.set(hash, { ...clone(s), expiresAt: now() + ttlSec * 1000 }); },
    async getSession(hash) {
      const s = sessions.get(hash);
      if (!s || s.expiresAt < now()) return null;
      return clone(s);
    },
    async deleteSession(hash) { sessions.delete(hash); },

    getSettings: async () => clone(settings),
    async putSettings(s) { settings = clone(s); },

    // Counts hits per key in a fixed window; returns the count including this one.
    async bumpRate(key, windowSec) {
      const slot = `${key}|${Math.floor(now() / (windowSec * 1000))}`;
      rates.set(slot, (rates.get(slot) ?? 0) + 1);
      return rates.get(slot);
    },

    // Hits so far in the current window (without counting one).
    async getRate(key, windowSec) { return rates.get(`${key}|${Math.floor(now() / (windowSec * 1000))}`) ?? 0; },

    // Saves the user only if its sessionGen is still what the caller read (a password change or recovery elsewhere wins).
    async updateUserIf(u, expectedGen) {
      const cur = users.get(u.name);
      if (!cur || (cur.sessionGen ?? 0) !== expectedGen) return false;
      users.set(u.name, clone(u));
      return true;
    },

    async createEvent(ev) {
      if (slugs.has(`${ev.org}/${ev.slug}`)) return false;
      slugs.set(`${ev.org}/${ev.slug}`, ev.id);
      events.set(ev.id, clone(ev));
      return true;
    },
    getEvent: async (id) => clone(events.get(id)) ?? null,
    getEventBySlug: async (org, slug) => clone(events.get(slugs.get(`${org}/${slug}`))) ?? null,
    async putEvent(ev) { events.set(ev.id, clone(ev)); },
    listEvents: async () => [...events.values()].map(clone).sort((a, b) => a.createdAt - b.createdAt),
    listEventsByOwner: async (owner) => [...events.values()].filter((e) => e.owner === owner).map(clone).sort((a, b) => a.createdAt - b.createdAt),
    async deleteEvent(id) {
      const ev = events.get(id);
      if (ev) slugs.delete(`${ev.org}/${ev.slug}`);
      events.delete(id);
      contents.delete(id);
      data.delete(id);
    },
    getContent: async (id) => clone(contents.get(id)) ?? null,
    async putContent(id, c) { contents.set(id, clone(c)); },

    // Team numbers count up from 1 per event; names are unique (by key) while the team exists.
    async createTeam(eventId, { name, key, secret, createdAt }) {
      const b = bucket(eventId);
      if (key && b.names.has(key)) return { error: 'name-taken' };
      b.counter += 1;
      const team = { number: b.counter, name, secret, score: 0, done: 0, createdAt };
      b.teams.set(team.number, team);
      if (key) b.names.set(key, team.number);
      return { team: clone(team) };
    },
    getTeam: async (eventId, n) => clone(bucket(eventId).teams.get(n)) ?? null,
    listTeams: async (eventId) => [...bucket(eventId).teams.values()].map(clone).sort((a, b) => a.number - b.number),
    async deleteTeam(eventId, n) {
      const b = bucket(eventId);
      const team = b.teams.get(n);
      if (!team) return false;
      b.teams.delete(n);
      for (const [k, v] of b.names) if (v === n) b.names.delete(k);
      for (const k of [...b.answers.keys()]) if (k.startsWith(`${n}|`)) b.answers.delete(k);
      return true;
    },

    // The first submission for a key counts. Updates the team's running score and done count.
    async putAnswer(eventId, n, key, rec) {
      const b = bucket(eventId);
      const team = b.teams.get(n);
      const slot = `${n}|${key}`;
      if (!team || b.answers.has(slot)) return false;
      b.answers.set(slot, clone(rec));
      team.score = roundScore(team.score + rec.points);
      team.done += 1;
      return true;
    },
    async getAnswers(eventId, n) {
      const out = {};
      for (const [slot, rec] of bucket(eventId).answers) {
        const [num, ...rest] = slot.split('|');
        if (+num === n) out[rest.join('|')] = clone(rec);
      }
      return out;
    },
    async listPhotos(eventId) {
      return [...bucket(eventId).answers].filter(([, r]) => r.kind === 'photo').map(([slot, rec]) => {
        const [num, ...rest] = slot.split('|');
        return { team: +num, key: rest.join('|'), rec: clone(rec) };
      }).sort((a, b) => a.rec.at - b.rec.at);
    },
    // Applies a decision to a submitted photo and moves the team's total by the difference. -> the previous record or null.
    async setPhotoDecision(eventId, n, key, decision, points, at) {
      const b = bucket(eventId);
      const rec = b.answers.get(`${n}|${key}`);
      const team = b.teams.get(n);
      if (!rec || rec.kind !== 'photo' || !team) return null;
      const previous = clone(rec);
      rec.decision = decision;
      rec.points = points;
      rec.scoredAt = at;
      team.score = roundScore(team.score + points - previous.points);
      return previous;
    },
    async deletePlayerData(eventId) { data.delete(eventId); },
  };
}
