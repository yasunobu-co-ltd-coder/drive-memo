// GET /api/auth/google/callback — Google OAuthコールバック
// 認可コードを受け取り、トークンを保存してアプリに戻る
import { NextRequest } from 'next/server';
import { validateToken } from '@/lib/auth';
import { exchangeCode, saveTokens } from '@/lib/google-calendar';

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

  // stateからセッション情報を復元
  let userId: string;
  let deviceToken: string;
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
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
  const icon = success ? '✅' : '❌';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>drive - カレンダー連携</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100dvh; margin: 0; background: #f8fafc; }
  .card { text-align: center; padding: 40px; border-radius: 20px; background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,.08); max-width: 360px; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  .msg { font-size: 18px; font-weight: 700; color: ${color}; margin-bottom: 20px; }
  .sub { font-size: 14px; color: #64748b; }
</style></head><body>
<div class="card">
  <div class="icon">${icon}</div>
  <div class="msg">${message}</div>
  <div class="sub">このタブを閉じてアプリに戻ってください</div>
</div>
<script>
  // 3秒後に自動で閉じる（PWAの場合）
  setTimeout(() => { try { window.close(); } catch {} }, 3000);
</script>
</body></html>`;
}
