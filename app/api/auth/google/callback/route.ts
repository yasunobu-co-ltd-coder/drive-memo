// GET /api/auth/google/callback — Google OAuthコールバック
// 認可コードを受け取り、トークンを保存してアプリに戻る
import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { validateToken } from '@/lib/auth';
import { exchangeCode, saveTokens } from '@/lib/google-calendar';

function verifyState(payload: string, sig: string): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.GOOGLE_CLIENT_SECRET!;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  // エラーまたはキャンセル
  if (error || !code || !state) {
    return new Response(html('カレンダー連携がキャンセルされました', false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // stateからセッション情報を復元（HMAC署名を検証）
  let userId: string;
  let deviceToken: string;
  try {
    const dotIdx = state.lastIndexOf('.');
    if (dotIdx === -1) throw new Error('no signature');
    const payload = state.slice(0, dotIdx);
    const sig = state.slice(dotIdx + 1);
    if (!verifyState(payload, sig)) throw new Error('invalid signature');
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    userId = parsed.userId;
    deviceToken = parsed.deviceToken;
  } catch {
    return new Response(html('無効なリクエストです', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // device_tokenの再検証
  const session = await validateToken(deviceToken);
  if (!session || session.userId !== userId) {
    return new Response(html('認証エラー', false), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 認可コード → トークン交換
  try {
    const tokens = await exchangeCode(code);
    await saveTokens(userId, tokens);
  } catch {
    return new Response(html('トークン取得に失敗しました', false), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new Response(html('Googleカレンダー連携が完了しました！', true), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function html(message: string, success: boolean) {
  const color = success ? '#10b981' : '#ef4444';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>drive - カレンダー連携</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100dvh; margin: 0; background: #f8fafc; }
  .card { text-align: center; padding: 40px; border-radius: 20px; background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,.08); max-width: 360px; width: 90vw; }
  .icon { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .icon-ok { background: #d1fae5; }
  .icon-ng { background: #fee2e2; }
  .icon svg { width: 28px; height: 28px; }
  .msg { font-size: 18px; font-weight: 700; color: ${color}; margin-bottom: 20px; }
  .home-btn { display: inline-block; margin-top: 8px; padding: 14px 32px; border-radius: 14px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #fff; font-weight: 700; font-size: 16px; text-decoration: none; box-shadow: 0 4px 14px rgba(37,99,235,.35); }
</style></head><body>
<div class="card">
  <div class="icon ${success ? 'icon-ok' : 'icon-ng'}">
    ${success
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'
    }
  </div>
  <div class="msg">${message}</div>
  <a href="/" class="home-btn">ホームに戻る</a>
</div>
<script>
  // ポップアップで開かれた場合、親ウィンドウに完了通知を送って閉じる
  if (window.opener) {
    try { window.opener.postMessage('google-auth-done', window.location.origin); } catch {}
    setTimeout(() => { try { window.close(); } catch {} }, 3000);
  }
</script>
</body></html>`;
}
