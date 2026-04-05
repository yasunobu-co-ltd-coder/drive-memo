// POST /api/auth/register
// 会社コード + パスワードを検証して device_token を発行する
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const { company_code, password } = await req.json();

  if (!company_code || !password) {
    return Response.json({ error: '会社コードとパスワードを入力してください' }, { status: 400 });
  }

  const db = createServerClient();

  // 会社コードで検索
  const { data: company, error } = await db
    .from('companies')
    .select('id, name, password_hash')
    .eq('code', company_code.trim().toUpperCase())
    .single();

  if (error || !company) {
    return Response.json({ error: '会社コードが見つかりません' }, { status: 401 });
  }

  // パスワード検証
  const valid = await bcrypt.compare(password, company.password_hash);
  if (!valid) {
    return Response.json({ error: 'パスワードが違います' }, { status: 401 });
  }

  // device_token 発行（UUID）
  const deviceToken = crypto.randomUUID();

  const { error: insertError } = await db.from('device_registrations').insert({
    device_token: deviceToken,
    company_id: company.id,
  });

  if (insertError) {
    return Response.json({ error: '端末登録に失敗しました' }, { status: 500 });
  }

  // 会社のユーザー一覧を返す（ユーザー選択画面に使用）
  const { data: users } = await db
    .from('users')
    .select('id, name, sort_order')
    .eq('company_id', company.id)
    .order('sort_order', { ascending: true });

  return Response.json({
    device_token: deviceToken,
    company_id:   company.id,
    company_name: company.name,
    users:        users ?? [],
  });
}
