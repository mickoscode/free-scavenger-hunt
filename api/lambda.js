// AWS Lambda entry point (API Gateway HTTP API, payload format 2.0). Needs FSH_TABLE and FSH_ASSETS_BUCKET.
import { createApp } from './app.js';
import { createS3Assets } from './assets.js';
import { createDynamoStore } from './store/dynamo.js';

let app;
async function getApp() {
  app ??= createApp({
    store: createDynamoStore({ tableName: process.env.FSH_TABLE }),
    assets: await createS3Assets({ bucket: process.env.FSH_ASSETS_BUCKET }),
  });
  return app;
}

export async function handler(event) {
  const handle = await getApp();
  const res = await handle({
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: event.queryStringParameters ?? {},
    headers: { ...event.headers, ...(event.cookies ? { cookie: event.cookies.join('; ') } : {}) },
    body: event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : event.body,
    ip: event.requestContext.http.sourceIp,
  });
  return { statusCode: res.status, headers: res.headers, cookies: res.cookies, body: res.body };
}
