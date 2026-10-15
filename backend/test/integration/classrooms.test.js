import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initializeDatabase, purgeExpiredData } from '../../src/database.js';
import { hashPassword } from '../../src/password.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('séances en direct et reconnexion étudiant avec PostgreSQL', { skip: !databaseUrl && 'Définissez TEST_DATABASE_URL.' }, async context => {
  const admin = new pg.Pool({ connectionString: databaseUrl });
  const schema = `live_test_${randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  const config = { username: 'enseignant', passwordHash: await hashPassword('mot-de-passe-prof'), secret: randomBytes(48).toString('hex'), domains: ['etu.univ-amu.fr', 'univ-amu.fr'], origin: 'http://localhost', secure: false, trustProxy: 0, retentionDays: 90 };
  try {
    await initializeDatabase(pool);
    await initializeDatabase(pool);
    const app = createApp(pool, config);
    const client = async () => {
      const agent = request.agent(app);
      const session = await agent.get('/api/session').expect(200);
      return { agent, token: session.body.csrfToken };
    };
    const post = async (actor, path, body, status = 200) => {
      const result = await actor.agent.post(`/api${path}`).set('X-CSRF-Token', actor.token).send(body).expect(status);
      if (result.body.csrfToken) actor.token = result.body.csrfToken;
      return result.body;
    };
    const teacher = await client();
    await post(teacher, '/teacher/login', { username: 'enseignant', password: 'mot-de-passe-prof' });
    const student = await client();
    const outsider = await client();
    const profile = { firstName: 'Alice', lastName: 'Étudiante', email: ' Alice@etu.univ-amu.fr ', password: 'mot-de-passe-alice' };
    let room;
    let questionId;
    const question = { title: 'Que conserve un volume Docker ?', choices: ['Les données', 'Un nom de domaine', 'Un mot de passe en clair'], correct: 'A', explanation: 'Un volume conserve les données indépendamment du conteneur.' };

    await context.test('authentification obligatoire, CSRF et domaines autorisés', async () => {
      await outsider.agent.get('/api/student/me').expect(401);
      await outsider.agent.get('/api/teacher/classrooms').expect(401);
      await post(outsider, '/teacher/classrooms', { title: 'Interdit' }, 401);
      await student.agent.post('/api/student/register').send(profile).expect(403);
      await post(student, '/student/register', { ...profile, email: 'alice@example.org' }, 400);
      await post(student, '/student/register', { ...profile, password: 'court' }, 400);
      const registered = await post(student, '/student/register', profile);
      assert.equal(registered.student.email, 'alice@etu.univ-amu.fr');
      assert.ok(!JSON.stringify(registered).includes('password'));
      const stored = (await pool.query('SELECT password_hash FROM students')).rows[0];
      assert.match(stored.password_hash, /^scrypt\$/);
      assert.notEqual(stored.password_hash, profile.password);
      await post(outsider, '/student/register', { ...profile, email: 'alice@etu.univ-amu.fr' }, 409);
      const professor = await client();
      await post(professor, '/student/register', { ...profile, email: 'prof@univ-amu.fr' });
      await professor.agent.get('/api/teacher/classrooms').expect(401);
    });

    await context.test('création, inscription idempotente et brouillon invisible', async () => {
      room = await post(teacher, '/teacher/classrooms', { title: 'TD web & IA' }, 201);
      assert.match(room.code, /^[A-F0-9]{8}$/);
      await post(student, '/student/join', { code: '00000000' }, 404);
      await post(student, '/student/join', { code: room.code.toLowerCase() });
      await post(student, '/student/join', { code: room.code });
      const draft = await post(teacher, `/teacher/classrooms/${room.id}/questions`, question, 201);
      questionId = draft.id;
      await post(teacher, `/teacher/classrooms/${room.id}/questions/${questionId}/status`, { status: 'closed' }, 409);
      const view = (await student.agent.get(`/api/student/classrooms/${room.id}`).expect(200)).body;
      assert.deepEqual(view.questions, []);
      await post(student, `/student/questions/${questionId}/answer`, { choice: 'A' }, 409);
      const adminView = (await teacher.agent.get(`/api/teacher/classrooms/${room.id}`).expect(200)).body;
      assert.equal(adminView.members, 1);
      assert.equal(adminView.questions[0].correct, 'A');
    });

    await context.test('publication, cloisonnement et aucun corrigé avant réponse', async () => {
      await post(teacher, `/teacher/classrooms/${room.id}/questions/${questionId}/status`, { status: 'open' }, 204);
      const view = (await student.agent.get(`/api/student/classrooms/${room.id}`).expect(200)).body;
      assert.equal(view.questions[0].status, 'open');
      assert.ok(!('correct' in view.questions[0]));
      assert.ok(!('explanation' in view.questions[0]));
      await post(outsider, '/student/register', { ...profile, email: 'autre@etu.univ-amu.fr' });
      await outsider.agent.get(`/api/student/classrooms/${room.id}`).expect(404);
      await post(outsider, `/student/questions/${questionId}/answer`, { choice: 'A' }, 404);
      await post(student, `/student/questions/${questionId}/answer`, { choice: 'E' }, 400);
    });

    await context.test('enregistrement atomique, réponse définitive et réessai idempotent', async () => {
      const receipt = await post(student, `/student/questions/${questionId}/answer`, { choice: 'A' }, 201);
      assert.equal(receipt.correct, 'A');
      assert.equal(receipt.explanation, question.explanation);
      await post(student, `/student/questions/${questionId}/answer`, { choice: 'A' }, 201);
      await post(student, `/student/questions/${questionId}/answer`, { choice: 'B' }, 409);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM live_answers')).rows[0].total, 1);
      const results = (await teacher.agent.get(`/api/teacher/classrooms/${room.id}`).expect(200)).body;
      assert.equal(results.questions[0].count_a, 1);
      assert.equal(results.questions[0].total, 1);
    });

    await context.test('reconnexion depuis un autre navigateur, historique et logout', async () => {
      const reconnected = await client();
      await post(reconnected, '/student/login', { email: 'alice@etu.univ-amu.fr', password: 'incorrect' }, 401);
      await post(reconnected, '/student/login', { email: 'ALICE@etu.univ-amu.fr', password: profile.password });
      const self = (await reconnected.agent.get('/api/student/me').expect(200)).body;
      assert.equal(self.classrooms[0].id, room.id);
      assert.equal(self.student.firstName, profile.firstName);
      const view = (await reconnected.agent.get(`/api/student/classrooms/${room.id}`).expect(200)).body;
      assert.equal(view.questions[0].selected, 'A');
      assert.equal(view.questions[0].correct, 'A');
      await post(reconnected, '/student/logout', {});
      await reconnected.agent.get('/api/student/me').expect(401);
    });

    await context.test('question suivante, concurrence et clôture', async () => {
      const next = await post(teacher, `/teacher/classrooms/${room.id}/questions`, question, 201);
      await post(teacher, `/teacher/classrooms/${room.id}/questions/${next.id}/status`, { status: 'open' }, 204);
      const view = (await student.agent.get(`/api/student/classrooms/${room.id}`).expect(200)).body;
      assert.equal(view.questions.find(item => item.id === questionId).status, 'closed');
      await post(teacher, `/teacher/classrooms/${room.id}/questions/${questionId}/status`, { status: 'open' }, 409);
      const responses = await Promise.all(['B', 'D'].map(choice => student.agent.post(`/api/student/questions/${next.id}/answer`).set('X-CSRF-Token', student.token).send({ choice })));
      assert.deepEqual(responses.map(result => result.status).sort(), [201, 409]);
      await post(teacher, `/teacher/classrooms/${room.id}/questions/${next.id}/status`, { status: 'closed' }, 204);
      await post(student, '/student/join', { code: room.code });
      await post(outsider, '/student/join', { code: room.code });
      await post(outsider, `/student/questions/${next.id}/answer`, { choice: 'D' }, 409);
      const outsiderView = (await outsider.agent.get(`/api/student/classrooms/${room.id}`).expect(200)).body;
      assert.ok(outsiderView.questions.every(item => !('correct' in item)));
    });

    await context.test('échec SQL : pas de corrigé ni réponse partielle', async () => {
      const next = await post(teacher, `/teacher/classrooms/${room.id}/questions`, question, 201);
      await post(teacher, `/teacher/classrooms/${room.id}/questions/${next.id}/status`, { status: 'open' }, 204);
      await pool.query("CREATE FUNCTION fail_live_answer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$");
      await pool.query('CREATE TRIGGER fail_live_insert BEFORE INSERT ON live_answers FOR EACH ROW EXECUTE FUNCTION fail_live_answer()');
      try {
        const result = await post(student, `/student/questions/${next.id}/answer`, { choice: 'A' }, 503);
        assert.ok(!('correct' in result));
        assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM live_answers WHERE question_id = $1', [next.id])).rows[0].total, 0);
      } finally {
        await pool.query('DROP TRIGGER fail_live_insert ON live_answers');
        await pool.query('DROP FUNCTION fail_live_answer()');
      }
    });

    await context.test('réponses liées à la bonne séance et conservation limitée', async () => {
      const other = await post(teacher, '/teacher/classrooms', { title: 'Autre séance' }, 201);
      await post(teacher, `/teacher/classrooms/${other.id}/questions/${questionId}/status`, { status: 'closed' }, 404);
      await student.agent.get('/api/student/classrooms/pas-un-uuid').expect(400);
      await pool.query("UPDATE live_answers SET created_at = NOW() - INTERVAL '91 days'");
      await purgeExpiredData(pool, 90);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM live_answers')).rows[0].total, 0);
      await pool.query("UPDATE students SET last_seen_at = NOW() - INTERVAL '91 days'");
      await purgeExpiredData(pool, 90);
      await student.agent.get('/api/student/me').expect(401);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM classroom_members')).rows[0].total, 0);
      await pool.query("UPDATE classrooms SET created_at = NOW() - INTERVAL '91 days'");
      await purgeExpiredData(pool, 90);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM live_questions')).rows[0].total, 0);
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
