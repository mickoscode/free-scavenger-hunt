// Runs the store contract against DynamoDB Local: DYNAMODB_ENDPOINT=http://localhost:8000 npm test (CI starts it).
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { storeContract } from './store.contract.js';

const endpoint = process.env.DYNAMODB_ENDPOINT;

if (!endpoint) {
  test('dynamo store: skipped (set DYNAMODB_ENDPOINT to run against DynamoDB Local)', { skip: true }, () => {});
} else {
  const { DynamoDBClient, CreateTableCommand } = await import('@aws-sdk/client-dynamodb');
  const { createDynamoStore } = await import('../../api/store/dynamo.js');
  const raw = new DynamoDBClient({ endpoint, region: 'local', credentials: { accessKeyId: 'x', secretAccessKey: 'x' } });
  storeContract('dynamo store', async () => {
    const tableName = `fsh-test-${randomUUID()}`; // a fresh table per test
    await raw.send(new CreateTableCommand({
      TableName: tableName, BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'PK', AttributeType: 'S' }, { AttributeName: 'SK', AttributeType: 'S' }, { AttributeName: 'gsi1pk', AttributeType: 'S' }, { AttributeName: 'gsi1sk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
      GlobalSecondaryIndexes: [{ IndexName: 'gsi1', KeySchema: [{ AttributeName: 'gsi1pk', KeyType: 'HASH' }, { AttributeName: 'gsi1sk', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } }],
    }));
    return createDynamoStore({ tableName, endpoint });
  });
}
