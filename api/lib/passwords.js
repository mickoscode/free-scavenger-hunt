// Password hashing (scrypt, no dependencies) and random tokens.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384;
const R = 8;
const P = 1;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 32, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, key] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const randomId = (length = 10) => Array.from(crypto.randomBytes(length), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');

// A readable temporary password (no look-alike characters).
export const temporaryPassword = () => `${randomId(5)}-${randomId(5)}-${randomId(5)}`;

// ---- recovery codes: one-time codes an organiser keeps to get back in if the password is forgotten.
// 20 characters from a 31 symbol alphabet without look-alikes (about 99 bits), shown as XXXXX-XXXXX-XXXXX-XXXXX. Only a
// hash is stored, so neither the site admin nor a copy of the database reveals a usable code.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_COUNT = 8;

export function recoveryCode() {
  const chars = Array.from({ length: 20 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
  return chars.match(/.{5}/g).join('-');
}
export const normaliseRecoveryCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Bound to the username, so a code cannot be moved to another account.
export const hashRecoveryCode = (username, code) => sha256(`recovery:${username}:${normaliseRecoveryCode(code)}`);

// -> { codes: [...plain, shown once], hashes: [...stored] }
export function newRecoverySet(username) {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
  return { codes, hashes: codes.map((c) => hashRecoveryCode(username, c)) };
}
