import { createHash, createHmac, randomUUID } from 'node:crypto';
import { VERSION } from './questionnaire.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function correction(pool, submissionId) {
  const result = await pool.query('SELECT q.id, q.domain, q.title, q.choices, a.choice AS selected, q.correct_choice AS correct, q.explanation FROM answers a JOIN questions q ON q.version = a.version AND q.id = a.question_id WHERE a.submission_id = $1 ORDER BY q.id', [submissionId]);
  return { submissionId, questions: result.rows };
}

export async function saveSubmission(pool, data, sessionId, secret) {
  const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const ownerHash = createHmac('sha256', secret).update(sessionId).digest('hex');
  const client = await pool.connect();
  let submissionId;
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO submissions (id, version, request_id, request_hash, owner_session_hash,
        last_name, first_name, email)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (request_id) DO NOTHING RETURNING id`,
    [randomUUID(), VERSION, data.requestId, requestHash, ownerHash, data.lastName, data.firstName, data.email]);
    if (!result.rowCount) {
      const existing = await client.query('SELECT id, request_hash, owner_session_hash FROM submissions WHERE request_id = $1', [data.requestId]);
      if (!existing.rows[0] || existing.rows[0].request_hash !== requestHash || existing.rows[0].owner_session_hash !== ownerHash) throw new HttpError(409, 'Cette tentative de soumission ne correspond pas au formulaire initial.');
      submissionId = existing.rows[0].id;
    } else {
      submissionId = result.rows[0].id;
      for (const answer of data.answers) {
        await client.query('INSERT INTO answers(submission_id, version, question_id, choice) VALUES ($1, $2, $3, $4)', [submissionId, VERSION, answer.questionId, answer.choice]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new HttpError(409, 'Une réponse a déjà été enregistrée avec cet e-mail pour cette séance.');
    throw error;
  } finally {
    client.release();
  }
  return correction(pool, submissionId);
}

export async function readDashboard(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const summary = await client.query('SELECT COUNT(*)::int AS total, MAX(created_at) AS last_submission FROM submissions WHERE version = $1', [VERSION]);
    const results = await client.query(`
      SELECT q.id, q.domain, q.title, q.choices, q.correct_choice AS correct,
        COUNT(a.submission_id)::int AS total,
        COUNT(a.submission_id) FILTER (WHERE a.choice = q.correct_choice)::int AS correct_count,
        COUNT(a.submission_id) FILTER (WHERE a.choice <> q.correct_choice AND a.choice <> 'D')::int AS incorrect_count,
        COUNT(a.submission_id) FILTER (WHERE a.choice = 'D')::int AS unknown_count,
        jsonb_build_object(
          'A', COUNT(a.submission_id) FILTER (WHERE a.choice = 'A'),
          'B', COUNT(a.submission_id) FILTER (WHERE a.choice = 'B'),
          'C', COUNT(a.submission_id) FILTER (WHERE a.choice = 'C'),
          'D', COUNT(a.submission_id) FILTER (WHERE a.choice = 'D')) AS counts
      FROM questions q LEFT JOIN answers a ON q.version = a.version AND q.id = a.question_id
      WHERE q.version = $1 GROUP BY q.version, q.id ORDER BY q.id`, [VERSION]);
    await client.query('COMMIT');
    return { version: VERSION, total: summary.rows[0].total, lastSubmission: summary.rows[0].last_submission, updatedAt: new Date().toISOString(), questions: results.rows };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function readStudents(pool, page) {
  const result = await pool.query(`
    SELECT id, first_name, last_name, email, created_at
    FROM submissions WHERE version = $1 ORDER BY created_at DESC, id LIMIT 21 OFFSET $2`, [VERSION, (page - 1) * 20]);
  return { students: result.rows.slice(0, 20), page, hasNext: result.rows.length > 20 };
}
