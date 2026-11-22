// Creates (or resets) the site admin account directly in the DynamoDB table and prints a random password.
// Run from a computer with AWS credentials for the account:  node scripts/create-site-admin.js [username]
// The username defaults to "siteadmin". Nothing about the account is stored anywhere but the table (a password hash).
import { createDynamoStore } from '../api/store/dynamo.js';
import { hashPassword, temporaryPassword } from '../api/lib/passwords.js';

const name = (process.argv[2] ?? 'siteadmin').toLowerCase();
if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(name)) throw new Error('Usernames are 3 to 30 letters, numbers, - or _.');
const store = createDynamoStore({ tableName: process.env.FSH_TABLE ?? 'fsh-main' });

const password = temporaryPassword();
const existing = await store.getUser(name);
if (existing && existing.role !== 'site-admin') throw new Error(`${name} is an organiser account: choose another username.`);
await store.putUser({
  name, role: 'site-admin', status: 'active', maxEvents: 1000, createdAt: existing?.createdAt ?? Date.now(),
  sessionGen: (existing?.sessionGen ?? 0) + 1, passwordHash: await hashPassword(password),
});
console.log(`${existing ? 'Reset' : 'Created'} site admin "${name}".\nPassword: ${password}\nSign in at /admin/ and change it there.`);
