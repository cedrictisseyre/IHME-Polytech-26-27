import { readConfig } from '../src/config.js';
import { createPool, purgeExpiredData } from '../src/database.js';

const config = readConfig();
const pool = await createPool(config);
try {
  console.log(`${await purgeExpiredData(pool, config.retentionDays)} soumission(s) expirée(s) supprimée(s).`);
} finally {
  await pool.end();
}
