import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const hashPattern = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, hash) {
  if (!hashPattern.test(hash) || typeof password !== 'string' || password.length > 256) return false;
  const [, salt, expected] = hash.split('$');
  const derived = await scrypt(password, salt, 64);
  return timingSafeEqual(derived, Buffer.from(expected, 'hex'));
}
