import { hashPattern } from './password.js';

export function readConfig(environment = process.env) {
  const required = ['DATABASE_URL', 'SESSION_SECRET', 'TEACHER_PASSWORD_HASH', 'UNIVERSITY_EMAIL_DOMAINS', 'PRIVACY_CONTACT'];
  for (const key of required) if (!environment[key]) throw new Error(`Configuration manquante : ${key}. Lancez npm run configure.`);
  if (environment.SESSION_SECRET.length < 32 || environment.SESSION_SECRET.startsWith('REPLACE_')) throw new Error('SESSION_SECRET doit contenir au moins 32 caractères aléatoires.');
  if (!hashPattern.test(environment.TEACHER_PASSWORD_HASH)) throw new Error('Le mot de passe enseignant doit être haché : lancez npm run configure.');
  const domains = environment.UNIVERSITY_EMAIL_DOMAINS.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!domains.length || domains.some(domain => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain))) throw new Error('UNIVERSITY_EMAIL_DOMAINS doit contenir des domaines valides séparés par des virgules.');
  const origin = new URL(environment.PUBLIC_ORIGIN || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('PUBLIC_ORIGIN doit être une URL HTTP ou HTTPS.');
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('PUBLIC_ORIGIN doit contenir uniquement l’origine, sans chemin. Utilisez APP_BASE_PATH pour un sous-chemin.');
  const basePath = environment.APP_BASE_PATH === '/' ? '' : environment.APP_BASE_PATH || '';
  if (basePath && !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(basePath)) throw new Error('APP_BASE_PATH doit être vide ou un chemin comme /ihme, sans barre finale.');
  const secure = environment.COOKIE_SECURE === 'true';
  if (origin.protocol === 'https:' && !secure) throw new Error('Activez COOKIE_SECURE=true avec une origine HTTPS.');
  if (origin.protocol === 'http:' && secure) throw new Error('COOKIE_SECURE=true nécessite HTTPS.');
  const retentionDays = Number(environment.RETENTION_DAYS || 90);
  const trustProxy = Number(environment.TRUST_PROXY || 0);
  const port = Number(environment.PORT || 3000);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error('RETENTION_DAYS doit être compris entre 1 et 365.');
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 10) throw new Error('TRUST_PROXY doit être compris entre 0 et 10.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT invalide.');
  return { databaseUrl: environment.DATABASE_URL, databaseSsl: environment.DATABASE_SSL === 'true', databaseCaFile: environment.DATABASE_CA_FILE, secret: environment.SESSION_SECRET, passwordHash: environment.TEACHER_PASSWORD_HASH, username: environment.TEACHER_USERNAME || 'enseignant', domains, origin: origin.origin, basePath, secure, retentionDays, trustProxy, port, privacyContact: environment.PRIVACY_CONTACT };
}
