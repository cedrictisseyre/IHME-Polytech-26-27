import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PostgresSessionStore } from './session-store.js';
import { publicQuestionnaire, VERSION } from './questionnaire.js';
import { validateSubmission } from './validation.js';
import { verifyPassword } from './password.js';
import { HttpError, saveSubmission, readDashboard, readStudents } from './repository.js';

const regenerate = request => new Promise((resolve, reject) => request.session.regenerate(error => error ? reject(error) : resolve()));
const saveSession = request => new Promise((resolve, reject) => request.session.save(error => error ? reject(error) : resolve()));

function requireTeacher(request, response, next) {
  if (!request.session.teacher) return response.status(401).json({ error: 'Connectez-vous à l’espace enseignant.' });
  next();
}

function csrfProtection(config) {
  return (request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
    const token = request.get('X-CSRF-Token') || '';
    const expected = request.session.csrf || '';
    const origin = request.get('Origin');
    if ((origin && origin !== config.origin) || !expected || Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return response.status(403).json({ error: 'Session expirée ou requête non autorisée. Rechargez la page ; vos réponses restent affichées.' });
    }
    next();
  };
}

export function createApp(pool, config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ strictTransportSecurity: config.secure ? undefined : false, contentSecurityPolicy: { directives: { upgradeInsecureRequests: config.secure ? [] : null } } }));
  app.use('/api', (request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', async (request, response) => {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  });
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 1200, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Trop de requêtes. Patientez avant de réessayer.' } }));
  app.use('/api', express.json({ limit: '48kb' }));
  app.use('/api', session({
    name: 'diagnostic.sid', store: new PostgresSessionStore(pool), secret: config.secret,
    resave: false, saveUninitialized: false, rolling: true,
    cookie: { path: config.basePath || '/', httpOnly: true, sameSite: 'strict', secure: config.secure, maxAge: 8 * 60 * 60 * 1000 }
  }));
  app.get('/api/session', async (request, response) => {
    if (!request.session.csrf) request.session.csrf = randomBytes(32).toString('hex');
    await saveSession(request);
    response.json({ csrfToken: request.session.csrf, teacher: Boolean(request.session.teacher) });
  });
  app.use('/api', csrfProtection(config));
  app.get('/api/questionnaire', (request, response) => response.json({ ...publicQuestionnaire(), privacy: { contact: config.privacyContact, retentionDays: config.retentionDays, domains: config.domains } }));
  app.post('/api/submissions', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, keyGenerator: request => request.sessionID, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Trop de tentatives de soumission. Réessayez dans quelques minutes.' } }), async (request, response) => {
    if (request.body?.version && request.body.version !== VERSION) return response.status(409).json({ error: 'Le questionnaire a changé. Rechargez la page avant de répondre.' });
    const result = validateSubmission(request.body, config.domains);
    if (result.error) return response.status(400).json(result);
    const receipt = await saveSubmission(pool, result.data, request.sessionID, config.secret);
    response.status(201).json(receipt);
  });
  app.post('/api/teacher/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' } }), async (request, response) => {
    const body = request.body || {};
    const valid = await verifyPassword(body.password, config.passwordHash);
    if (body.username !== config.username || !valid) return response.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    await regenerate(request);
    request.session.teacher = true;
    request.session.csrf = randomBytes(32).toString('hex');
    await saveSession(request);
    response.json({ teacher: true, csrfToken: request.session.csrf });
  });
  app.post('/api/teacher/logout', requireTeacher, async (request, response) => {
    await new Promise((resolve, reject) => request.session.destroy(error => error ? reject(error) : resolve()));
    response.clearCookie('diagnostic.sid', { path: config.basePath || '/', httpOnly: true, sameSite: 'strict', secure: config.secure });
    response.status(204).end();
  });
  app.get('/api/teacher/dashboard', requireTeacher, async (request, response) => response.json(await readDashboard(pool)));
  app.get('/api/teacher/students', requireTeacher, async (request, response) => {
    const page = Number(request.query.page || 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new HttpError(400, 'Page invalide.');
    response.json(await readStudents(pool, page));
  });
  app.use('/api', (request, response) => response.status(404).json({ error: 'Ressource introuvable.' }));
  const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(['/', '/enseignant'], (request, response) => {
      response.set('Cache-Control', 'no-cache');
      response.sendFile(`${dist}/index.html`);
    });
  }
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Le formulaire doit être transmis en JSON valide.' });
    if (error.type === 'entity.too.large') return response.status(413).json({ error: 'Le formulaire est trop volumineux.' });
    if (error.status && error.status < 500) return response.status(error.status).json({ error: error.message });
    console.error('Échec de requête :', error.code || error.name);
    response.status(503).json({ error: 'Service temporairement indisponible. Vos réponses ne sont pas effacées ; vous pouvez réessayer.' });
  });
  if (!config.basePath) return app;
  const mounted = express();
  mounted.disable('x-powered-by');
  mounted.enable('strict routing');
  mounted.get(config.basePath, (request, response) => response.redirect(308, `${config.basePath}/${request.originalUrl.slice(config.basePath.length)}`));
  mounted.use(config.basePath, app);
  return mounted;
}
