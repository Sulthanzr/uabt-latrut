import bcrypt from 'bcryptjs';

const ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

export function hashPassword(password) {
  return bcrypt.hashSync(String(password), ROUNDS);
}

export function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compareSync(String(password), passwordHash);
}
