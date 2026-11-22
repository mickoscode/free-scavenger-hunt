// Creates the master-demo hunt in the site admin's account from the original Demo Hunt kept in scripts/demo-master/, or restores it.
// Run from a computer with AWS credentials for the account:
//
//   node scripts/seed-master-demo.js                          shows what it would do, changes nothing
//   node scripts/seed-master-demo.js --yes                    creates master-demo (does nothing if it already exists)
//   node scripts/seed-master-demo.js --replace --yes          throws the current master-demo away and restores the original
//   node scripts/seed-master-demo.js <username> ...           for a site admin that is not called "siteadmin"
import { createDynamoStore } from '../api/store/dynamo.js';
import { createS3Assets } from '../api/assets.js';
import { seedMaster } from './lib/seed-master.js';

const args = process.argv.slice(2);
const store = createDynamoStore({ tableName: process.env.FSH_TABLE ?? 'fsh-main' });
const assets = await createS3Assets({ bucket: process.env.FSH_ASSETS_BUCKET ?? 'fsh-assets-722937635825' });

const result = await seedMaster({
  store, assets, adminName: args.find((a) => !a.startsWith('--')) ?? 'siteadmin',
  replace: args.includes('--replace'), yes: args.includes('--yes'), log: console.log,
});
if (result.dryRun) console.log('\nNothing was changed. Add --yes to do it.');
