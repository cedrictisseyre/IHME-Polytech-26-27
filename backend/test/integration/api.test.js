import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initializeDatabase, purgeExpiredData } from '../../src/database.js';
import { hashPassword } from '../../src/password.js';
import { questions, VERSION } from '../../src/questionnaire.js';
import { submission } from '../fixtures.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('API avec une vraie base PostgreSQL isolée', { skip: !databaseUrl && 'Définissez TEST_DATABASE_URL pour exécuter les tests PostgreSQL.' }, async context => {
  const admin = new pg.Pool({ connectionString: databaseUrl });
  const schema = `diagnostic_test_${randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 10 });
  const config = { username: 'enseignant', passwordHash: await hashPassword('mot-de-passe-de-test'), secret: randomBytes(48).toString('hex'), domains: ['universite.test'], origin: 'http://localhost:3000', secure: false, trustProxy: 0, retentionDays: 90, privacyContact: 'contact@universite.test' };
  try {
    await initializeDatabase(pool);
    const newAgent = async app => {
      const agent = request.agent(app);
      const response = await agent.get('/api/session').expect(200);
      return { agent, token: response.body.csrfToken, cookie: response.headers['set-cookie'] };
    };
    const post = (client, body) => client.agent.post('/api/submissions').set('X-CSRF-Token', client.token).send(body);
    const login = async app => {
      const client = await newAgent(app);
      const response = await client.agent.post('/api/teacher/login').set('X-CSRF-Token', client.token).send({ username: 'enseignant', password: 'mot-de-passe-de-test' }).expect(200);
      return { ...client, token: response.body.csrfToken, loginCookie: response.headers['set-cookie'] };
    };
    const clean = () => pool.query('TRUNCATE submissions, teacher_sessions CASCADE');

    await context.test('suppression des anciens champs et initialisation répétable', async () => {
      await pool.query('ALTER TABLE submissions ADD COLUMN phone TEXT, ADD COLUMN formation TEXT NOT NULL DEFAULT \'Master\'');
      await initializeDatabase(pool);
      await initializeDatabase(pool);
      const columns = await pool.query('SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', [schema, 'submissions']);
      assert.deepEqual(columns.rows.map(column => column.column_name).sort(), ['created_at', 'email', 'first_name', 'id', 'last_name', 'owner_session_hash', 'request_hash', 'request_id', 'version']);
    });

    await context.test('aucun corrigé public, aucune liste de profils sans connexion', async () => {
      const app = createApp(pool, config);
      const result = await request(app).get('/api/questionnaire').expect(200);
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal(result.body.questions.length, 12);
      assert.ok(!('correct' in result.body.questions[0]));
      assert.ok(!('explanation' in result.body.questions[0]));
      await request(app).get('/api/teacher/dashboard').expect(401);
      await request(app).get('/api/teacher/students').expect(401);
      await request(app).get('/api/correction').expect(404);
      await request(app).post('/api/submissions').send(submission()).expect(403);
    });

    await context.test('API et redirection isolées sous /ihme', async () => {
      const app = createApp(pool, { ...config, basePath: '/ihme' });
      await request(app).get('/ihme?test=1').expect(308).expect('Location', '/ihme/?test=1');
      await request(app).get('/ihme/api/health').expect(200);
      await request(app).get('/api/health').expect(404);
      await request(app).get('/ihme-autre/api/health').expect(404);
      const questionnaire = await request(app).get('/ihme/api/questionnaire').expect(200);
      assert.equal(questionnaire.body.questions.length, 12);
      const agent = request.agent(app);
      const session = await agent.get('/ihme/api/session').expect(200);
      assert.match(session.headers['set-cookie'][0], /Path=\/ihme;/);
      const result = await agent.post('/ihme/api/submissions').set('X-CSRF-Token', session.body.csrfToken).set('Origin', config.origin).send(submission()).expect(201);
      assert.equal(result.body.questions.length, 12);
    });

    await context.test('session et connexion HTTPS derrière le proxy sous /ihme', async () => {
      const app = createApp(pool, { ...config, basePath: '/ihme', origin: 'https://csbgestion.jcloud-ver-jpe.ik-server.com', secure: true, trustProxy: 1 });
      const session = await request(app).get('/ihme/api/session').set('X-Forwarded-Proto', 'https').expect(200);
      assert.match(session.headers['set-cookie'][0], /Path=\/ihme;/);
      assert.match(session.headers['set-cookie'][0], /; Secure/);
      const cookie = session.headers['set-cookie'][0].split(';')[0];
      const login = await request(app).post('/ihme/api/teacher/login').set('X-Forwarded-Proto', 'https').set('Origin', 'https://csbgestion.jcloud-ver-jpe.ik-server.com').set('Cookie', cookie).set('X-CSRF-Token', session.body.csrfToken).send({ username: 'enseignant', password: 'mot-de-passe-de-test' }).expect(200);
      const teacherCookie = login.headers['set-cookie'][0].split(';')[0];
      await request(app).get('/ihme/api/teacher/dashboard').set('X-Forwarded-Proto', 'https').set('Cookie', teacherCookie).expect(200);
      const logout = await request(app).post('/ihme/api/teacher/logout').set('X-Forwarded-Proto', 'https').set('Cookie', teacherCookie).set('X-CSRF-Token', login.body.csrfToken).send({}).expect(204);
      assert.match(logout.headers['set-cookie'][0], /Path=\/ihme;/);
      await request(app).get('/ihme/api/teacher/dashboard').set('X-Forwarded-Proto', 'https').set('Cookie', teacherCookie).expect(401);
    });

    await context.test('CSRF, origine étrangère et authentification contrôlés', async () => {
      const app = createApp(pool, config);
      const client = await newAgent(app);
      assert.match(client.cookie[0], /HttpOnly/);
      assert.match(client.cookie[0], /SameSite=Strict/);
      await client.agent.post('/api/submissions').set('X-CSRF-Token', 'incorrect').send(submission()).expect(403);
      await client.agent.post('/api/submissions').set('X-CSRF-Token', client.token).set('Origin', 'https://attaquant.test').send(submission()).expect(403);
      await client.agent.post('/api/teacher/login').set('X-CSRF-Token', client.token).send({ username: 'enseignant', password: 'incorrect' }).expect(401);
      const teacher = await login(app);
      assert.notEqual(teacher.cookie[0].split(';')[0], teacher.loginCookie[0].split(';')[0]);
      await teacher.agent.get('/api/teacher/dashboard').expect(200);
      await teacher.agent.post('/api/teacher/logout').set('X-CSRF-Token', teacher.token).send({}).expect(204);
      await teacher.agent.get('/api/teacher/dashboard').expect(401);
    });

    await context.test('soumission invalide et ancienne version refusées sans écriture', async () => {
      await clean();
      const client = await newAgent(createApp(pool, config));
      const data = submission();
      await post(client, { ...data, answers: data.answers.slice(1) }).expect(400);
      await post(client, { ...data, email: 'camille@autre.test' }).expect(400);
      await post(client, { ...data, phone: '0600000000' }).expect(400);
      await post(client, { ...data, version: 'ancienne' }).expect(409);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM submissions')).rows[0].total, 0);
    });

    await context.test('corrigé uniquement après sauvegarde, choix inconnus et agrégats exacts', async () => {
      await clean();
      const app = createApp(pool, config);
      const first = await newAgent(app);
      const response = await post(first, submission()).expect(201);
      assert.equal(response.body.questions.length, 12);
      assert.equal(response.body.questions[0].correct, questions[0].correct);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM answers')).rows[0].total, 12);
      const second = await newAgent(app);
      await post(second, submission({ answers: questions.map(question => ({ questionId: question.id, choice: question.correct })) })).expect(201);
      const teacher = await login(app);
      const dashboard = (await teacher.agent.get('/api/teacher/dashboard').expect(200)).body;
      assert.equal(dashboard.total, 2);
      for (const question of dashboard.questions) {
        assert.equal(question.total, 2);
        assert.equal(question.correct_count, 1);
        assert.equal(question.unknown_count, 1);
        assert.equal(question.incorrect_count, 0);
        assert.equal(question.counts.D, 1);
      }
      assert.ok(!JSON.stringify(dashboard).includes('camille@'));
      const students = (await teacher.agent.get('/api/teacher/students').expect(200)).body;
      assert.equal(students.students.length, 2);
      assert.ok(!('owner_session_hash' in students.students[0]));
      assert.deepEqual(Object.keys(students.students[0]).sort(), ['created_at', 'email', 'first_name', 'id', 'last_name']);
      assert.ok(!('profiles' in dashboard));
      assert.ok(!('experience' in dashboard));
      await teacher.agent.get('/api/teacher/students?page=-1').expect(400);
    });

    await context.test('réessai idempotent, doublon e-mail et accès au corrigé d’un autre étudiant', async () => {
      await clean();
      const app = createApp(pool, config);
      const client = await newAgent(app);
      const data = submission();
      const first = await post(client, data).expect(201);
      const retry = await post(client, data).expect(201);
      assert.equal(first.body.submissionId, retry.body.submissionId);
      const other = await newAgent(app);
      await post(other, data).expect(409);
      await post(client, submission({ email: data.email })).expect(409);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM submissions')).rows[0].total, 1);
    });

    await context.test('les saisies restent des paramètres SQL et du texte', async () => {
      await clean();
      const app = createApp(pool, config);
      const client = await newAgent(app);
      const malicious = "Robert'); DROP TABLE submissions; --";
      await post(client, submission({ lastName: malicious, firstName: '<script>alert(1)</script>' })).expect(201);
      const stored = await pool.query('SELECT last_name, first_name FROM submissions');
      assert.equal(stored.rows[0].last_name, malicious);
      assert.equal(stored.rows[0].first_name, '<script>alert(1)</script>');
    });

    await context.test('échec en milieu de transaction : aucune réponse ni corrigé partiel', async () => {
      await clean();
      await pool.query("CREATE FUNCTION fail_answer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.question_id = 7 THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$");
      await pool.query('CREATE TRIGGER fail_insert BEFORE INSERT ON answers FOR EACH ROW EXECUTE FUNCTION fail_answer()');
      try {
        const client = await newAgent(createApp(pool, config));
        const result = await post(client, submission()).expect(503);
        assert.ok(!('questions' in result.body));
        assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM submissions')).rows[0].total, 0);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM answers')).rows[0].total, 0);
      } finally {
        await pool.query('DROP TRIGGER fail_insert ON answers');
        await pool.query('DROP FUNCTION fail_answer()');
      }
    });

    await context.test('soumissions concurrentes : un seul enregistrement par e-mail', async () => {
      await clean();
      const app = createApp(pool, config);
      const first = await newAgent(app);
      const second = await newAgent(app);
      const email = 'concurrent@universite.test';
      const responses = await Promise.all([post(first, submission({ email })), post(second, submission({ email }))]);
      assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM answers')).rows[0].total, 12);
    });

    await context.test('plus de vingt étudiants derrière une IP, mais répétitions individuelles limitées', async () => {
      await clean();
      const app = createApp(pool, config);
      for (let student = 0; student < 22; student += 1) {
        const client = await newAgent(app);
        await post(client, submission()).expect(201);
      }
      assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM submissions')).rows[0].total, 22);
      const client = await newAgent(app);
      for (let attempt = 0; attempt < 20; attempt += 1) await post(client, {}).expect(400);
      await post(client, {}).expect(429);
    });

    await context.test('la purge supprime aussi les réponses liées', async () => {
      await clean();
      const client = await newAgent(createApp(pool, config));
      await post(client, submission()).expect(201);
      await pool.query("UPDATE submissions SET created_at = NOW() - INTERVAL '91 days'");
      assert.equal(await purgeExpiredData(pool, 90), 1);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS total FROM answers')).rows[0].total, 0);
    });

    await context.test('une modification silencieuse du questionnaire est refusée', async () => {
      await pool.query('UPDATE questionnaire_versions SET fingerprint = $2 WHERE version = $1', [VERSION, 'modified']);
      await assert.rejects(() => initializeDatabase(pool), /nouvelle VERSION/);
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
