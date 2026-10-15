import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { questions, VERSION } from './questionnaire.js';

export async function createPool(config) {
  const ssl = config.databaseSsl ? { rejectUnauthorized: true, ...(config.databaseCaFile ? { ca: await readFile(config.databaseCaFile, 'utf8') } : {}) } : false;
  const pool = new pg.Pool({ connectionString: config.databaseUrl, ssl, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  pool.on('error', () => console.error('Connexion PostgreSQL interrompue.'));
  return pool;
}

export async function initializeDatabase(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(261012)');
    await client.query(await readFile(new URL('../sql/001_initial.sql', import.meta.url), 'utf8'));
    await client.query(await readFile(new URL('../sql/002_simplified_profile.sql', import.meta.url), 'utf8'));
    await client.query(await readFile(new URL('../sql/003_live_classrooms.sql', import.meta.url), 'utf8'));
    const fingerprint = createHash('sha256').update(JSON.stringify(questions)).digest('hex');
    const existing = await client.query('SELECT fingerprint FROM questionnaire_versions WHERE version = $1', [VERSION]);
    if (existing.rows[0] && existing.rows[0].fingerprint !== fingerprint) throw new Error('Questionnaire modifié : créez une nouvelle VERSION pour préserver les réponses existantes.');
    if (!existing.rowCount) {
      await client.query('INSERT INTO questionnaire_versions(version, fingerprint) VALUES ($1, $2)', [VERSION, fingerprint]);
      for (const question of questions) {
        await client.query('INSERT INTO questions(version, id, domain, title, choices, correct_choice, explanation) VALUES ($1, $2, $3, $4, $5, $6, $7)', [VERSION, question.id, question.domain, question.title, JSON.stringify(question.choices), question.correct, question.explanation]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function purgeExpiredData(pool, retentionDays) {
  const result = await pool.query("DELETE FROM submissions WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')", [retentionDays]);
  await pool.query('DELETE FROM teacher_sessions WHERE expires_at < NOW()');
  await pool.query("DELETE FROM live_answers WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')", [retentionDays]);
  await pool.query("DELETE FROM students WHERE last_seen_at < NOW() - ($1::int * INTERVAL '1 day')", [retentionDays]);
  await pool.query("DELETE FROM classrooms WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')", [retentionDays]);
  return result.rowCount;
}
