// POST /api/admin/create-company
// 管理者用：会社 + 初期ユーザーを登録する
// ADMIN_SECRET ヘッダーで保護
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { code, name, password, users } = await req.json();
  // users: [{ name: '松田', sort_order: 1 }, ...]

  if (!code || !name || !password) {
    return Response.json({ error: 'code / name / password は必須です' }, { status: 400 });
  }

  const db = createServerClient();
  const passwordHash = await bcrypt.hash(password, 10);

  const { data: company, error: companyError } = await db
    .from('companies')
    .insert({ code: code.trim().toUpperCase(), name, password_hash: passwordHash })
    .select('id, code, name')
    .single();

  if (companyError) {
    return Response.json({ error: companyError.message }, { status: 500 });
  }

  let createdUsers: unknown[] = [];
  if (Array.isArray(users) && users.length > 0) {
    const userRows = users.map((u: { name: string; sort_order?: number }, i: number) => ({
      company_id: company.id,
      name:       u.name,
      sort_order: u.sort_order ?? i,
    }));
    const { data: ud } = await db.from('users').insert(userRows).select('id, name, sort_order');
    createdUsers = ud ?? [];
  }

  return Response.json({ company, users: createdUsers }, { status: 201 });
}
