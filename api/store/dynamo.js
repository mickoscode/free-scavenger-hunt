// DynamoDB store. One table (fsh-main), keys PK/SK, one index (gsi1).
//
//   PK E#<eventId>   META               the event (settings, owner); gsi1pk EVENTS, gsi1sk <owner>#<eventId>
//                    CONTENT            zones, questions, instructions
//                    CTR                team number counter
//                    T#<nnnnn>          a team: name, secret, score, done
//                    N#<nameKey>        reserves a team name (conditional put = uniqueness)
//                    A#<nnnnn>#<key>    a team's answer or photo submission (conditional put = first one counts)
//   PK S#<slug>      S                  slug -> eventId (conditional put = unique slugs)
//   PK U#<name>      U                  a user; gsi1pk USERS, gsi1sk <name>
//   PK SESS#<hash>   S                  an admin session (ttl)
//   PK RATE#<key>    <window>           a rate counter (ttl)
//   PK SETTINGS      S                  site settings
//
// Written against the AWS SDK v3 that the Lambda runtime provides.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { roundScore } from '../lib/scoring.js';

const pad = (n) => String(n).padStart(5, '0');
const strip = (item) => {
  if (!item) return null;
  const { PK, SK, gsi1pk, gsi1sk, ttl, ...rest } = item;
  return rest;
};
const isConditionFailure = (e) => e?.name === 'ConditionalCheckFailedException';

export function createDynamoStore({ tableName, endpoint, now = Date.now, client }) {
  const doc = client ?? DynamoDBDocumentClient.from(
    new DynamoDBClient({ ...(endpoint ? { endpoint, region: 'local', credentials: { accessKeyId: 'x', secretAccessKey: 'x' } } : {}) }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  const T = tableName;
  const get = async (PK, SK) => (await doc.send(new GetCommand({ TableName: T, Key: { PK, SK }, ConsistentRead: true }))).Item ?? null;
  const put = (Item, condition) => doc.send(new PutCommand({ TableName: T, Item, ...(condition ? { ConditionExpression: condition } : {}) }));
  const del = (PK, SK) => doc.send(new DeleteCommand({ TableName: T, Key: { PK, SK } }));

  async function queryAll(params) {
    const items = [];
    let ExclusiveStartKey;
    do {
      const r = await doc.send(new QueryCommand({ TableName: T, ConsistentRead: !params.IndexName, ...params, ExclusiveStartKey }));
      items.push(...(r.Items ?? []));
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }
  const queryPrefix = (PK, prefix) => queryAll({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': PK, ':p': prefix },
  });

  async function batchDelete(items) {
    for (let i = 0; i < items.length; i += 25) {
      let requests = items.slice(i, i + 25).map(({ PK, SK }) => ({ DeleteRequest: { Key: { PK, SK } } }));
      while (requests.length) {
        const r = await doc.send(new BatchWriteCommand({ RequestItems: { [T]: requests } }));
        requests = r.UnprocessedItems?.[T] ?? [];
      }
    }
  }

  const eventItem = (ev) => ({ PK: `E#${ev.id}`, SK: 'META', gsi1pk: 'EVENTS', gsi1sk: `${ev.owner}#${ev.id}`, ...ev });
  const byGsi = async (pk, prefix) => queryAll({
    IndexName: 'gsi1', KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :p)', ExpressionAttributeValues: { ':pk': pk, ':p': prefix },
  });

  return {
    async createUser(u) {
      try {
        await put({ PK: `U#${u.name}`, SK: 'U', gsi1pk: 'USERS', gsi1sk: u.name, ...u }, 'attribute_not_exists(PK)');
        return true;
      } catch (e) { if (isConditionFailure(e)) return false; throw e; }
    },
    getUser: async (name) => strip(await get(`U#${name}`, 'U')),
    async putUser(u) { await put({ PK: `U#${u.name}`, SK: 'U', gsi1pk: 'USERS', gsi1sk: u.name, ...u }); },
    listUsers: async () => (await byGsi('USERS', '')).map(strip),
    async deleteUser(name) { await del(`U#${name}`, 'U'); },

    async putSession(hash, s, ttlSec) {
      await put({ PK: `SESS#${hash}`, SK: 'S', ...s, ttl: Math.floor(now() / 1000) + ttlSec });
    },
    async getSession(hash) {
      const item = await get(`SESS#${hash}`, 'S');
      return item && item.ttl > now() / 1000 ? strip(item) : null;
    },
    async deleteSession(hash) { await del(`SESS#${hash}`, 'S'); },

    async getSettings() { return strip(await get('SETTINGS', 'S')) ?? { registrationOpen: true }; },
    async putSettings(s) { await put({ PK: 'SETTINGS', SK: 'S', ...s }); },

    async bumpRate(key, windowSec) {
      const slot = Math.floor(now() / (windowSec * 1000));
      const r = await doc.send(new UpdateCommand({
        TableName: T, Key: { PK: `RATE#${key}`, SK: String(slot) },
        UpdateExpression: 'ADD hits :one SET #t = :ttl', ExpressionAttributeNames: { '#t': 'ttl' },
        ExpressionAttributeValues: { ':one': 1, ':ttl': Math.floor(now() / 1000) + windowSec * 2 }, ReturnValues: 'UPDATED_NEW',
      }));
      return r.Attributes.hits;
    },

    async createEvent(ev) {
      try {
        await put({ PK: `S#${ev.slug}`, SK: 'S', eventId: ev.id }, 'attribute_not_exists(PK)');
      } catch (e) { if (isConditionFailure(e)) return false; throw e; }
      await put(eventItem(ev));
      return true;
    },
    getEvent: async (id) => strip(await get(`E#${id}`, 'META')),
    async getEventBySlug(slug) {
      const s = await get(`S#${slug}`, 'S');
      return s ? strip(await get(`E#${s.eventId}`, 'META')) : null;
    },
    async putEvent(ev) { await put(eventItem(ev)); },
    listEvents: async () => (await byGsi('EVENTS', '')).map(strip).sort((a, b) => a.createdAt - b.createdAt),
    listEventsByOwner: async (owner) => (await byGsi('EVENTS', `${owner}#`)).map(strip).sort((a, b) => a.createdAt - b.createdAt),
    async deleteEvent(id) {
      const ev = await get(`E#${id}`, 'META');
      if (ev) await del(`S#${ev.slug}`, 'S');
      await batchDelete(await queryAll({ KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `E#${id}` } }));
    },
    getContent: async (id) => strip(await get(`E#${id}`, 'CONTENT'))?.content ?? null,
    async putContent(id, content) { await put({ PK: `E#${id}`, SK: 'CONTENT', content }); },

    async createTeam(eventId, { name, key, secret, createdAt }) {
      const PK = `E#${eventId}`;
      if (key) {
        try {
          await put({ PK, SK: `N#${key}`, number: 0 }, 'attribute_not_exists(PK)');
        } catch (e) { if (isConditionFailure(e)) return { error: 'name-taken' }; throw e; }
      }
      const c = await doc.send(new UpdateCommand({
        TableName: T, Key: { PK, SK: 'CTR' }, UpdateExpression: 'ADD n :one', ExpressionAttributeValues: { ':one': 1 }, ReturnValues: 'UPDATED_NEW',
      }));
      const number = c.Attributes.n;
      const team = { number, name, secret, score: 0, done: 0, createdAt };
      await put({ PK, SK: `T#${pad(number)}`, ...team });
      if (key) await put({ PK, SK: `N#${key}`, number });
      return { team };
    },
    getTeam: async (eventId, n) => strip(await get(`E#${eventId}`, `T#${pad(n)}`)),
    async listTeams(eventId) { return (await queryPrefix(`E#${eventId}`, 'T#')).map(strip); },
    async deleteTeam(eventId, n) {
      const PK = `E#${eventId}`;
      const team = await get(PK, `T#${pad(n)}`);
      if (!team) return false;
      const answers = await queryPrefix(PK, `A#${pad(n)}#`);
      const names = (await queryPrefix(PK, 'N#')).filter((i) => i.number === n);
      await batchDelete([team, ...answers, ...names]);
      return true;
    },

    async putAnswer(eventId, n, key, rec) {
      const PK = `E#${eventId}`;
      try {
        await put({ PK, SK: `A#${pad(n)}#${key}`, ...rec }, 'attribute_not_exists(PK)');
      } catch (e) { if (isConditionFailure(e)) return false; throw e; }
      try {
        await doc.send(new UpdateCommand({
          TableName: T, Key: { PK, SK: `T#${pad(n)}` }, ConditionExpression: 'attribute_exists(PK)',
          UpdateExpression: 'ADD score :p, done :one', ExpressionAttributeValues: { ':p': rec.points, ':one': 1 },
        }));
      } catch (e) {
        if (isConditionFailure(e)) { await del(PK, `A#${pad(n)}#${key}`); return false; } // the team was removed meanwhile
        throw e;
      }
      return true;
    },
    async getAnswers(eventId, n) {
      const out = {};
      for (const item of await queryPrefix(`E#${eventId}`, `A#${pad(n)}#`)) out[item.SK.split('#').slice(2).join('#')] = strip(item);
      return out;
    },
    async listPhotos(eventId) {
      return (await queryPrefix(`E#${eventId}`, 'A#')).filter((i) => i.kind === 'photo').map((i) => {
        const [, num, ...rest] = i.SK.split('#');
        return { team: +num, key: rest.join('#'), rec: strip(i) };
      }).sort((a, b) => a.rec.at - b.rec.at);
    },
    async setPhotoDecision(eventId, n, key, decision, points, at) {
      const PK = `E#${eventId}`;
      let old;
      try {
        const r = await doc.send(new UpdateCommand({
          TableName: T, Key: { PK, SK: `A#${pad(n)}#${key}` }, ConditionExpression: 'attribute_exists(PK) AND kind = :photo',
          UpdateExpression: 'SET decision = :d, points = :p, scoredAt = :at',
          ExpressionAttributeValues: { ':d': decision, ':p': points, ':at': at, ':photo': 'photo' }, ReturnValues: 'ALL_OLD',
        }));
        old = r.Attributes;
      } catch (e) { if (isConditionFailure(e)) return null; throw e; }
      const delta = roundScore(points - old.points);
      if (delta !== 0) {
        await doc.send(new UpdateCommand({
          TableName: T, Key: { PK, SK: `T#${pad(n)}` }, UpdateExpression: 'ADD score :d', ExpressionAttributeValues: { ':d': delta },
        }));
      }
      return strip(old);
    },
    async deletePlayerData(eventId) {
      const PK = `E#${eventId}`;
      const items = (await queryAll({ KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': PK } }))
        .filter((i) => !['META', 'CONTENT'].includes(i.SK));
      await batchDelete(items);
    },
  };
}
