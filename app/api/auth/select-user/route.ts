// POST /api/auth/select-user
// 初回ユーザー選択。device_registrations.last_user_id をセットして登録完了にする
// device_token + company_id の一致で認証（初回はまだ last_user_id が未設定なので validateRequest は使えない）
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(`select-user:${ip}`, 20, 60 * 1000)) {
    return rateLimitResponse();
  }

  const { device_token, user_id, company_id } = await req.json();

  if (!device_token || !user_id || !company_id) {
    return Response.json({ error: 'Missing fields' }, { status: 400 });
  }

  const db = createServerClient();

  // device_token が実在し、正しい company_id に属するか検証
  const { data: device, error: deviceError } = await db
    .from('device_registrations')
    .select('device_token, company_id')
    .eq('device_token', device_token)
    .eq('company_id', company_id)
    .single();

  if (deviceError || !device) {
    return Response.json({ error: '無効な端末です' }, { status: 401 });
  }

  // ユーザーが正しい会社に属するか確認
  const { data: user, error: userError } = await db
    .from('users')
    .select('id, name')
    .eq('id', user_id)
    .eq('company_id', company_id)
    .single();

  if (userError || !user) {
    return Response.json({ error: '無効なユーザーです' }, { status: 400 });
  }

  // device_registrations の last_user_id を更新
  const { error } = await db
    .from('device_registrations')
    .update({ last_user_id: user_id, last_active_at: new Date().toISOString() })
    .eq('device_token', device_token)
    .eq('company_id', company_id);

  if (error) {
    return Response.json({ error: '更新に失敗しました' }, { status: 500 });
  }

  return Response.json({ user_id: user.id, user_name: user.name });
}
