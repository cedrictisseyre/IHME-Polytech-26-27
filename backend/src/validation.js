import { z } from 'zod';
import { VERSION } from './questionnaire.js';

const shortText = z.string().trim().min(1).max(120);

export const submissionSchema = z.strictObject({
  requestId: z.uuid(),
  version: z.literal(VERSION),
  lastName: shortText,
  firstName: shortText,
  email: z.email().trim().toLowerCase().max(254),
  answers: z.array(z.strictObject({ questionId: z.number().int().min(1).max(12), choice: z.enum(['A', 'B', 'C', 'D']) })).length(12)
}).superRefine((data, context) => {
  if (new Set(data.answers.map(answer => answer.questionId)).size !== 12) {
    context.addIssue({ code: 'custom', path: ['answers'], message: 'Chaque question doit recevoir exactement une réponse.' });
  }
});

export function validateSubmission(body, allowedDomains) {
  const result = submissionSchema.safeParse(body);
  if (!result.success) {
    return { error: 'Veuillez vérifier les champs du formulaire.', fields: result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) };
  }
  if (!allowedDomains.includes(result.data.email.split('@')[1])) {
    return { error: 'Utilisez une adresse du domaine universitaire autorisé.', fields: [{ path: 'email', message: `Domaines autorisés : ${allowedDomains.join(', ')}` }] };
  }
  result.data.answers.sort((first, second) => first.questionId - second.questionId);
  return { data: result.data };
}
