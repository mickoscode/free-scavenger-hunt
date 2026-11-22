// Removes EVERY organiser account and all of their hunts, teams, scores and pictures from the live database and assets bucket.
// Site admin accounts (and any hunts they own) are never touched. Used once, when hunt addresses changed shape (organiser
// codes), so old test data does not linger. Run from a computer with AWS credentials for the account:
//
//   node scripts/reset-organisers.js            lists what would be removed, changes nothing
//   node scripts/reset-organisers.js --yes      removes it
import { createDynamoStore } from '../api/store/dynamo.js';
import { createS3Assets } from '../api/assets.js';
import { resetOrganisers } from './lib/reset.js';

const store = createDynamoStore({ tableName: process.env.FSH_TABLE ?? 'fsh-main' });
const assets = await createS3Assets({ bucket: process.env.FSH_ASSETS_BUCKET ?? 'fsh-assets-722937635825' });
const yes = process.argv.includes('--yes');

const result = await resetOrganisers({ store, assets, yes, log: console.log });
console.log(result.dryRun ? '\nNothing was changed. Run again with --yes to remove the above.' : `\nRemoved ${result.removedUsers} organiser account(s) and ${result.removedEvents} hunt(s).`);
