import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { hashPassword, verifyPassword } from './password.js';
import { HttpError } from './repository.js';

const text = z.string().trim().min(1).max(120);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(10).max(256);
const registration = z.strictObject({ firstName: text, lastName: text, email, password });
const credentials = z.strictObject({ email, password: z.string().min(1).max(256) });
const questionInput = z.strictObject({ title: z.string().trim().min(1).max(1000), choices: z.array(z.string().trim().min(1).max(500)).length(3), correct: z.enum(['A', 'B', 'C']), explanation: z.string().trim().min(1).max(3000) });
const choiceInput = z.strictObject({ choice: z.enum(['A', 'B', 'C', 'D']) });
const publicStudent = student => ({ id: student.id, email: student.email, firstName: student.first_name, lastName: student.last_name });

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, 'Vérifiez les champs saisis et leurs longueurs. Le mot de passe doit contenir au moins 10 caractères à la création du compte.');
  return result.data;
}

function uuid(value) {
  if (!z.uuid().safeParse(value).success) throw new HttpError(400, 'Identifiant invalide.');
  return value;
}

async function transaction(pool, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function membership(pool, classroomId, studentId) {
  const result = await pool.query('SELECT c.id, c.title, c.code FROM classrooms c JOIN classroom_members m ON m.classroom_id = c.id WHERE c.id = $1 AND m.student_id = $2', [uuid(classroomId), studentId]);
  if (!result.rowCount) throw new HttpError(404, 'Séance introuvable. Rejoignez-la avec son code.');
  return result.rows[0];
}

async function classroom(pool, classroomId, lock = false) {
  const result = await pool.query(`SELECT id, title, code FROM classrooms WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [uuid(classroomId)]);
  if (!result.rowCount) throw new HttpError(404, 'Séance introuvable.');
  return result.rows[0];
}

export function installClassroomRoutes(app, pool, config, { requireTeacher, regenerate, saveSession }) {
  const authenticate = async (request, response, student) => {
    await regenerate(request);
    request.session.studentId = student.id;
    request.session.csrf = randomBytes(32).toString('hex');
    await saveSession(request);
    response.json({ student: publicStudent(student), csrfToken: request.session.csrf });
  };
  const requireStudent = async (request, response, next) => {
    if (!request.session.studentId) throw new HttpError(401, 'Connectez-vous avec votre e-mail et votre mot de passe.');
    const result = await pool.query('SELECT id, email, first_name, last_name FROM students WHERE id = $1', [request.session.studentId]);
    if (!result.rowCount) throw new HttpError(401, 'Votre compte a expiré. Créez un nouveau compte.');
    request.student = result.rows[0];
    next();
  };
  const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Trop de tentatives sur ce réseau. Réessayez dans 15 minutes.' } });
  const accountLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: request => typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : 'invalid', standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Trop de tentatives pour cette adresse. Réessayez dans 15 minutes.' } });
  app.post('/api/student/register', authLimit, accountLimit, async (request, response) => {
    const data = parse(registration, request.body);
    if (!config.domains.includes(data.email.split('@')[1])) throw new HttpError(400, 'Utilisez une adresse universitaire autorisée.');
    const hash = await hashPassword(data.password);
    const result = await pool.query('INSERT INTO students(id, email, first_name, last_name, password_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING RETURNING id, email, first_name, last_name', [randomUUID(), data.email, data.firstName, data.lastName, hash]);
    if (!result.rowCount) throw new HttpError(409, 'Création impossible. Si vous possédez déjà un compte, utilisez la connexion.');
    await authenticate(request, response, result.rows[0]);
  });
  app.post('/api/student/login', authLimit, accountLimit, async (request, response) => {
    const data = parse(credentials, request.body);
    const result = await pool.query('SELECT id, email, first_name, last_name, password_hash FROM students WHERE email = $1', [data.email]);
    const valid = await verifyPassword(data.password, result.rows[0]?.password_hash || config.passwordHash);
    if (!result.rowCount || !valid) throw new HttpError(401, 'E-mail ou mot de passe incorrect.');
    await pool.query('UPDATE students SET last_seen_at = NOW() WHERE id = $1', [result.rows[0].id]);
    await authenticate(request, response, result.rows[0]);
  });
  app.get('/api/student/me', requireStudent, async (request, response) => {
    await pool.query('UPDATE students SET last_seen_at = NOW() WHERE id = $1', [request.student.id]);
    const result = await pool.query('SELECT c.id, c.title, c.code FROM classrooms c JOIN classroom_members m ON c.id = m.classroom_id WHERE m.student_id = $1 ORDER BY c.created_at DESC', [request.student.id]);
    response.json({ student: publicStudent(request.student), classrooms: result.rows });
  });
  app.post('/api/student/logout', requireStudent, async (request, response) => {
    await regenerate(request);
    request.session.csrf = randomBytes(32).toString('hex');
    await saveSession(request);
    response.json({ csrfToken: request.session.csrf });
  });
  app.post('/api/student/join', requireStudent, async (request, response) => {
    const { code } = parse(z.strictObject({ code: z.string().trim().toUpperCase().regex(/^[A-F0-9]{8}$/) }), request.body);
    const result = await pool.query('SELECT id, title, code FROM classrooms WHERE code = $1', [code]);
    if (!result.rowCount) throw new HttpError(404, 'Code de séance inconnu.');
    await pool.query('INSERT INTO classroom_members(classroom_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [result.rows[0].id, request.student.id]);
    response.json(result.rows[0]);
  });
  app.get('/api/student/classrooms/:id', requireStudent, async (request, response) => {
    const room = await membership(pool, request.params.id, request.student.id);
    const result = await pool.query(`SELECT q.id, q.title, q.choices, q.status, a.choice AS selected,
      CASE WHEN a.student_id IS NOT NULL THEN q.correct_choice END AS correct,
      CASE WHEN a.student_id IS NOT NULL THEN q.explanation END AS explanation
      FROM live_questions q LEFT JOIN live_answers a ON a.question_id = q.id AND a.student_id = $2
      WHERE q.classroom_id = $1 AND q.status <> 'draft' ORDER BY q.published_at, q.id`, [room.id, request.student.id]);
    response.json({ classroom: room, questions: result.rows.map(question => {
      if (!question.selected) { delete question.correct; delete question.explanation; }
      return question;
    }) });
  });
  app.post('/api/student/questions/:id/answer', requireStudent, async (request, response) => {
    const data = parse(choiceInput, request.body);
    const questionId = uuid(request.params.id);
    const receipt = await transaction(pool, async client => {
      const result = await client.query('SELECT id, classroom_id, status, correct_choice, explanation FROM live_questions WHERE id = $1 FOR UPDATE', [questionId]);
      const question = result.rows[0];
      if (!question) throw new HttpError(404, 'Question introuvable.');
      await membership(client, question.classroom_id, request.student.id);
      const existing = await client.query('SELECT choice FROM live_answers WHERE question_id = $1 AND student_id = $2', [questionId, request.student.id]);
      if (existing.rowCount) {
        if (existing.rows[0].choice !== data.choice) throw new HttpError(409, 'Votre réponse est déjà enregistrée et ne peut plus être modifiée.');
      } else {
        if (question.status !== 'open') throw new HttpError(409, 'Cette question n’est plus ouverte aux réponses.');
        await client.query('INSERT INTO live_answers(question_id, classroom_id, student_id, choice) VALUES ($1,$2,$3,$4)', [questionId, question.classroom_id, request.student.id, data.choice]);
      }
      return { selected: data.choice, correct: question.correct_choice, explanation: question.explanation };
    });
    response.status(201).json(receipt);
  });
  app.get('/api/teacher/classrooms', requireTeacher, async (request, response) => {
    const result = await pool.query('SELECT id, title, code, created_at FROM classrooms ORDER BY created_at DESC');
    response.json({ classrooms: result.rows });
  });
  app.post('/api/teacher/classrooms', requireTeacher, async (request, response) => {
    const { title } = parse(z.strictObject({ title: text }), request.body);
    const result = await pool.query('INSERT INTO classrooms(id, title, code) VALUES ($1,$2,$3) RETURNING id, title, code', [randomUUID(), title, randomBytes(4).toString('hex').toUpperCase()]);
    response.status(201).json(result.rows[0]);
  });
  app.get('/api/teacher/classrooms/:id', requireTeacher, async (request, response) => {
    const room = await classroom(pool, request.params.id);
    const members = await pool.query('SELECT COUNT(*)::int AS total FROM classroom_members WHERE classroom_id = $1', [room.id]);
    const results = await pool.query(`SELECT q.id, q.title, q.choices, q.correct_choice AS correct, q.explanation, q.status,
      COUNT(a.student_id)::int AS total,
      COUNT(a.student_id) FILTER (WHERE a.choice = 'A')::int AS count_a,
      COUNT(a.student_id) FILTER (WHERE a.choice = 'B')::int AS count_b,
      COUNT(a.student_id) FILTER (WHERE a.choice = 'C')::int AS count_c,
      COUNT(a.student_id) FILTER (WHERE a.choice = 'D')::int AS count_d
      FROM live_questions q LEFT JOIN live_answers a ON a.question_id = q.id
      WHERE q.classroom_id = $1 GROUP BY q.id ORDER BY q.created_at, q.id`, [room.id]);
    response.json({ classroom: room, members: members.rows[0].total, questions: results.rows });
  });
  app.post('/api/teacher/classrooms/:id/questions', requireTeacher, async (request, response) => {
    const data = parse(questionInput, request.body);
    const room = await classroom(pool, request.params.id);
    const result = await pool.query('INSERT INTO live_questions(id, classroom_id, title, choices, correct_choice, explanation) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [randomUUID(), room.id, data.title, JSON.stringify(data.choices), data.correct, data.explanation]);
    response.status(201).json(result.rows[0]);
  });
  app.post('/api/teacher/classrooms/:id/questions/:questionId/status', requireTeacher, async (request, response) => {
    const { status } = parse(z.strictObject({ status: z.enum(['open', 'closed']) }), request.body);
    await transaction(pool, async client => {
      const room = await classroom(client, request.params.id, true);
      const result = await client.query('SELECT id, status FROM live_questions WHERE id = $1 AND classroom_id = $2 FOR UPDATE', [uuid(request.params.questionId), room.id]);
      if (!result.rowCount) throw new HttpError(404, 'Question introuvable.');
      if (status === 'closed' && result.rows[0].status === 'draft') throw new HttpError(409, 'Diffusez la question avant de la clôturer.');
      if (status === 'open' && result.rows[0].status === 'closed') throw new HttpError(409, 'Une question clôturée ne peut pas être rouverte. Créez-en une nouvelle.');
      if (status === 'open') await client.query("UPDATE live_questions SET status = 'closed' WHERE classroom_id = $1 AND status = 'open' AND id <> $2", [room.id, result.rows[0].id]);
      await client.query("UPDATE live_questions SET status = $2, published_at = COALESCE(published_at, NOW()) WHERE id = $1", [result.rows[0].id, status]);
    });
    response.status(204).end();
  });
}
