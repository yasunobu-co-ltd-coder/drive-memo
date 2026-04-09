// POST /api/admin/auth/request
// 管理者コード+パスワードを検証し、承認リンクをメール送信する
import { NextRequest } from 'next/server';
import { generateEmailToken } from '@/lib/admin-auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // レートリミット: IP単位で15分間に5回まで
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(`admin-auth:${ip}`, 5, 15 * 60 * 1000)) {
    return rateLimitResponse();
  }

  const { code, password } = await req.json();

  if (!code || !password) {
    return Response.json({ error: '管理者コードとパスワードを入力してください' }, { status: 400 });
  }

  // 環境変数と照合
  if (code !== process.env.ADMIN_CODE || password !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: '管理者コードまたはパスワードが違います' }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (!adminEmail || !resendKey) {
    return Response.json({ error: 'メール設定が未完了です' }, { status: 500 });
  }

  // 認証トークン生成
  const token = generateEmailToken();
  const origin = new URL(req.url).origin;
  const verifyUrl = `${origin}/admin/verify?token=${encodeURIComponent(token)}`;

  // Resend REST API でメール送信（SDKなし）
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'drive <onboarding@resend.dev>',
      to: adminEmail,
      subject: 'drive 管理者認証リンク',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
          <h2 style="color:#0f172a;margin-bottom:8px;">drive 管理者認証</h2>
          <p style="color:#64748b;font-size:15px;">以下のボタンをクリックして管理者画面にアクセスしてください。</p>
          <p style="color:#94a3b8;font-size:13px;">このリンクは10分間有効です。</p>
          <a href="${verifyUrl}" style="
            display:inline-block;
            margin:24px 0;
            padding:16px 32px;
            background:#2563eb;
            color:#fff;
            border-radius:12px;
            text-decoration:none;
            font-weight:700;
            font-size:16px;
          ">管理者画面を開く</a>
          <p style="color:#cbd5e1;font-size:12px;margin-top:32px;">
            このメールに心当たりがない場合は無視してください。
          </p>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.text();
    console.error('Resend error:', err);
    return Response.json({ error: 'メール送信に失敗しました' }, { status: 500 });
  }

  // メールアドレスの一部をマスクして返す
  const [local, domain] = adminEmail.split('@');
  const masked = local.slice(0, 2) + '***@' + domain;

  return Response.json({ ok: true, email: masked });
}
