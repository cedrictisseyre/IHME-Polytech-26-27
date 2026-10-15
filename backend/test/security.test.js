import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/password.js';
import { readConfig } from '../src/config.js';

test('mots de passe hachés avec un sel différent et comparaison sûre', async () => {
  const first = await hashPassword('mot-de-passe-de-test');
  const second = await hashPassword('mot-de-passe-de-test');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('mot-de-passe-de-test', first), true);
  assert.equal(await verifyPassword('incorrect', first), false);
  assert.equal(await verifyPassword(undefined, first), false);
  assert.equal(await verifyPassword({}, first), false);
  assert.equal(await verifyPassword('test', 'invalid'), false);
});

test('configuration refuse les secrets exemples et incohérences HTTPS', async () => {
  const valid = { DATABASE_URL: 'postgresql://localhost/diagnostic', SESSION_SECRET: 'a'.repeat(48), TEACHER_PASSWORD_HASH: await hashPassword('mot-de-passe-de-test'), UNIVERSITY_EMAIL_DOMAINS: 'universite.test', PRIVACY_CONTACT: 'contact@universite.test' };
  assert.equal(readConfig(valid).retentionDays, 90);
  assert.throws(() => readConfig({ ...valid, SESSION_SECRET: 'court' }));
  assert.throws(() => readConfig({ ...valid, TEACHER_PASSWORD_HASH: 'GENERATE_WITH_NPM_RUN_CONFIGURE' }));
  assert.throws(() => readConfig({ ...valid, UNIVERSITY_EMAIL_DOMAINS: '' }));
  assert.throws(() => readConfig({ ...valid, PUBLIC_ORIGIN: 'https://exemple.fr', COOKIE_SECURE: 'false' }));
  assert.throws(() => readConfig({ ...valid, RETENTION_DAYS: '-1' }));
});
