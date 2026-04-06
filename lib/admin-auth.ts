// ============================================================
// drive v2 — 管理者認証ユーティリティ
// HMAC署名トークンによるステートレス認証
// ============================================================
import { createHmac, timingSafeEqual } from 'crypto';

const secret = () => process.env.ADMIN_SECRET!;

// ─── メール認証トークン（10分有効） ───

export function generateEmailToken(): string {
  const expires = Date.now() + 10 * 60 * 1000;
  const payload = `email:${expires}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyEmailToken(token: string): boolean {
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!payload.startsWith('email:')) return false;

  const expected = createHmac('sha256', secret()).update(payload).digest('hex');
  if (!safeEqual(sig, expected)) return false;

  const expires = Number(payload.split(':')[1]);
  return Date.now() <= expires;
}

// ─── 管理者セッショントークン（24時間有効） ───

export function generateSessionToken(): string {
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `admin:${expires}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): boolean {
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!payload.startsWith('admin:')) return false;

  const expected = createHmac('sha256', secret()).update(payload).digest('hex');
  if (!safeEqual(sig, expected)) return false;

  const expires = Number(payload.split(':')[1]);
  return Date.now() <= expires;
}

// ─── リクエストから管理者セッションを検証 ───

export function validateAdminRequest(req: Request): boolean {
  const token = req.headers.get('x-admin-token');
  if (!token) return false;
  return verifySessionToken(token);
}

export function adminUnauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

// ─── ユーティリティ ───

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
