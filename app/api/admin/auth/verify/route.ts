// POST /api/admin/auth/verify
// メール認証トークンを検証し、管理者セッショントークンを発行する
import { NextRequest } from 'next/server';
import { verifyEmailToken, generateSessionToken } from '@/lib/admin-auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // レートリミット: IP単位で10分間に10回まで（HMACブルートフォース抑止）
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(`admin-verify:${ip}`, 10, 10 * 60 * 1000)) {
    return rateLimitResponse();
  }

  const { token } = await req.json();

  if (!token || typeof token !== 'string') {
    return Response.json({ error: 'トークンがありません' }, { status: 400 });
  }

  if (!verifyEmailToken(token)) {
    return Response.json({ error: 'リンクが無効か期限切れです。再度ログインしてください。' }, { status: 401 });
  }

  // 管理者セッショントークンを発行（24時間有効）
  const sessionToken = generateSessionToken();

  return Response.json({ ok: true, token: sessionToken });
}
