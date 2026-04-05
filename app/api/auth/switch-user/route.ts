// PATCH /api/auth/switch-user
// 端末のアクティブユーザーを切り替える
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const { user_id } = await req.json();
  if (!user_id) return Response.json({ error: 'user_id required' }, { status: 400 });

  const db = createServerClient();

  // 同じ会社のユーザーか確認
  const { data: user, error } = await db
    .from('users')
    .select('id, name')
    .eq('id', user_id)
    .eq('company_id', session.companyId)
    .single();

  if (error || !user) {
    return Response.json({ error: '無効なユーザーです' }, { status: 400 });
  }

  await db
    .from('device_registrations')
    .update({ last_user_id: user_id, last_active_at: new Date().toISOString() })
    .eq('device_token', session.deviceToken);

  return Response.json({ user_id: user.id, user_name: user.name });
}
