import test from 'node:test';
import assert from 'node:assert/strict';
import { submission } from './fixtures.js';
import { validateSubmission } from '../src/validation.js';
import { publicQuestionnaire, questions } from '../src/questionnaire.js';

test('le questionnaire public possède 12 questions et ne révèle aucun corrigé', () => {
  const result = publicQuestionnaire();
  assert.equal(result.questions.length, 12);
  for (const question of result.questions) {
    assert.deepEqual(Object.keys(question).sort(), ['choices', 'domain', 'id', 'title']);
    assert.equal(question.choices.length, 4);
    assert.equal(question.choices[3].key, 'D');
  }
  for (const question of questions) assert.ok(!JSON.stringify(result).includes(question.explanation));
});

test('seuls le nom, le prénom, l’e-mail et les réponses sont nécessaires', () => {
  const result = validateSubmission(submission(), ['universite.test']);
  assert.ok(result.data);
  assert.deepEqual(Object.keys(result.data).sort(), ['answers', 'email', 'firstName', 'lastName', 'requestId', 'version']);
});

test('normalise le domaine et les noms avant de sauvegarder', () => {
  const result = validateSubmission(submission({ email: 'CAMILLE@UNIVERSITE.TEST', firstName: ' Camille ' }), ['universite.test']);
  assert.equal(result.data.email, 'camille@universite.test');
  assert.equal(result.data.firstName, 'Camille');
});

test('refuse les domaines voisins, les réponses manquantes et les questions dupliquées', () => {
  const data = submission();
  assert.ok(validateSubmission({ ...data, email: 'a@universite.test.attaquant.fr' }, ['universite.test']).error);
  assert.ok(validateSubmission({ ...data, answers: data.answers.slice(1) }, ['universite.test']).error);
  assert.ok(validateSubmission({ ...data, answers: data.answers.map(answer => ({ ...answer, questionId: 1 })) }, ['universite.test']).error);
});

test('refuse les identités invalides, les anciens champs de profil et les clés inconnues', () => {
  assert.ok(validateSubmission(submission({ firstName: ' ' }), ['universite.test']).error);
  assert.ok(validateSubmission(submission({ lastName: 'a'.repeat(121) }), ['universite.test']).error);
  assert.ok(validateSubmission(submission({ email: 'invalide' }), ['universite.test']).error);
  assert.ok(validateSubmission(submission({ teacher: true }), ['universite.test']).error);
  for (const field of ['phone', 'formation', 'formationDetail', 'pathway', 'projectExperience', 'projectDescription', 'expectation', 'expectationDetail', 'concern', 'experience']) {
    assert.ok(validateSubmission(submission({ [field]: '' }), ['universite.test']).error);
  }
});
