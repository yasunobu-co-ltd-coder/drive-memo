// パスワードハッシュ — Node.js 組み込み crypto (scrypt) を使用
// bcryptjs 不要、外部パッケージなし
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const inputHash = scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(hash, 'hex'), inputHash);
}
