import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { hashPassword } from '../src/password.js';

const target = new URL('../../.env', import.meta.url);
try {
  await readFile(target);
  console.error('Le fichier .env existe déjà. Il n’a pas été modifié.');
  process.exit(1);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!process.stdin.isTTY) throw new Error('Lancez npm run configure dans un terminal interactif.');
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
try {
  const domains = (await prompt.question('Domaines universitaires autorisés, séparés par des virgules : ')).trim().toLowerCase();
  if (!domains || domains.split(',').some(domain => !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain.trim()))) throw new Error('Indiquez au moins un domaine valide.');
  const contact = (await prompt.question('E-mail de contact pour les données personnelles : ')).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) throw new Error('E-mail de contact invalide.');
  process.stdout.write('Mot de passe enseignant (12 caractères minimum, saisie masquée) : ');
  muted = true;
  const password = await prompt.question('');
  process.stdout.write('\nConfirmez le mot de passe : ');
  const confirmation = await prompt.question('');
  muted = false;
  process.stdout.write('\n');
  if (password.length < 12 || password.length > 256 || password !== confirmation) throw new Error('Les mots de passe doivent être identiques et contenir de 12 à 256 caractères.');
  const databasePassword = randomBytes(24).toString('hex');
  let template = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
  template = template.replaceAll('CHANGE_ME', databasePassword)
    .replace('GENERATE_WITH_NPM_RUN_CONFIGURE', await hashPassword(password))
    .replace('REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS', randomBytes(48).toString('hex'))
    .replace('etudiants.exemple.fr,exemple.fr', domains)
    .replace('enseignant@exemple.fr', contact);
  await writeFile(target, template, { flag: 'wx', mode: 0o600 });
  console.log('Configuration .env créée. Identifiant enseignant : enseignant.');
} finally {
  prompt.close();
}
