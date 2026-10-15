import { randomUUID } from 'node:crypto';
import { VERSION, questions } from '../src/questionnaire.js';

export function submission(overrides = {}) {
  return {
    requestId: randomUUID(), version: VERSION, firstName: 'Camille', lastName: 'Martin',
    email: `${randomUUID()}@universite.test`,
    answers: questions.map(question => ({ questionId: question.id, choice: 'D' })),
    ...overrides
  };
}
