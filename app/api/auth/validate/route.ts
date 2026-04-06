// GET /api/auth/validate
// device_token を検証してセッション情報 + ユーザー一覧を返す（起動時の自動ログイン）
import { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  // ユーザー一覧も一緒に返す（起動時に /api/users を別途叩く必要をなくす）
  const db = createServerClient();
  const { data: users } = await db
    .from('users')
    .select('id, name, sort_order')
    .eq('company_id', session.companyId)
    .order('sort_order', { ascending: true });

  return Response.json({ ...session, users: users ?? [] });
}
