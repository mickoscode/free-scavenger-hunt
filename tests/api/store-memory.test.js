import { createMemoryStore } from '../../api/store/memory.js';
import { storeContract } from './store.contract.js';

storeContract('memory store', async () => createMemoryStore());
