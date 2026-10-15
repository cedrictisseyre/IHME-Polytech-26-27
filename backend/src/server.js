import { readConfig } from './config.js';
import { createPool, initializeDatabase, purgeExpiredData } from './database.js';
import { createApp } from './app.js';

const config = readConfig();
const pool = await createPool(config);
await initializeDatabase(pool);
await purgeExpiredData(pool, config.retentionDays);
const maintenance = setInterval(() => purgeExpiredData(pool, config.retentionDays).catch(() => console.error('La purge programmée a échoué.')), 60 * 60 * 1000);
maintenance.unref();
const server = createApp(pool, config).listen(config.port, '0.0.0.0', () => console.log(`Diagnostic prêt sur le port ${config.port}.`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    clearInterval(maintenance);
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
