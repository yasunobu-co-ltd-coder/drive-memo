// GET /api/cron/keep-alive
// Vercel Cron が毎日叩くヘルスチェック。
// 軽い SELECT を1回投げて Supabase Free プランの自動pause（無アクセス期間判定）を回避する。
//
// セキュリティ:
// - Vercel Cron 経由のリクエストには `Authorization: Bearer ${CRON_SECRET}` が付与される
//   （`vercel.json` に `crons` を定義すると Vercel が CRON_SECRET を自動生成して環境変数に注入）
// - 一致しないリクエストは 401 を返す
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // 認可：Vercel Cron からの呼び出しのみ許可
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 軽量な DB ping：companies テーブルの件数だけ取る（行データは取得しない）
  try {
    const db = createServerClient();
    const { error, count } = await db
      .from('companies')
      .select('id', { head: true, count: 'exact' });

    if (error) {
      return Response.json(
        { ok: false, at: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    return Response.json({
      ok: true,
      at: new Date().toISOString(),
      companies: count ?? 0,
    });
  } catch (e) {
    return Response.json(
      { ok: false, at: new Date().toISOString(), error: String(e) },
      { status: 500 },
    );
  }
}
