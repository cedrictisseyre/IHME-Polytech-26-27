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
  assert.equal(readConfig(valid).basePath, '');
  assert.equal(readConfig({ ...valid, APP_BASE_PATH: '/' }).basePath, '');
  assert.equal(readConfig({ ...valid, APP_BASE_PATH: '/ihme' }).basePath, '/ihme');
  for (const basePath of ['ihme', '/ihme/', '//ihme', '/../ihme', '/ihme?x=1', '/ihme#test']) {
    assert.throws(() => readConfig({ ...valid, APP_BASE_PATH: basePath }));
  }
  assert.throws(() => readConfig({ ...valid, PUBLIC_ORIGIN: 'https://exemple.fr/ihme', COOKIE_SECURE: 'true' }));
});

test('origines supplémentaires explicites et cohérentes avec HTTPS', async () => {
  const valid = { DATABASE_URL: 'postgresql://localhost/diagnostic', SESSION_SECRET: 'a'.repeat(48), TEACHER_PASSWORD_HASH: await hashPassword('mot-de-passe-de-test'), UNIVERSITY_EMAIL_DOMAINS: 'universite.test', PRIVACY_CONTACT: 'contact@universite.test', PUBLIC_ORIGIN: 'https://csbgestion.jcloud-ver-jpe.ik-server.com', COOKIE_SECURE: 'true' };
  assert.deepEqual(readConfig(valid).origins, [valid.PUBLIC_ORIGIN]);
  assert.deepEqual(readConfig({ ...valid, ADDITIONAL_PUBLIC_ORIGINS: ' https://gestion.tenshodojo.fr,https://gestion.tenshodojo.fr ' }).origins, [valid.PUBLIC_ORIGIN, 'https://gestion.tenshodojo.fr']);
  for (const value of ['https://gestion.tenshodojo.fr/ihme', 'https://user:password@gestion.tenshodojo.fr', 'http://gestion.tenshodojo.fr', '*', 'null']) {
    assert.throws(() => readConfig({ ...valid, ADDITIONAL_PUBLIC_ORIGINS: value }));
  }
});
