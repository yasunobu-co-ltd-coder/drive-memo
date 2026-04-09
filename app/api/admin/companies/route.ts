// GET  /api/admin/companies — 会社一覧
// POST /api/admin/companies — 会社追加
import { NextRequest } from 'next/server';
import { validateAdminRequest, adminUnauthorized } from '@/lib/admin-auth';
import { hashPassword } from '@/lib/password';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  if (!validateAdminRequest(req)) return adminUnauthorized();

  const db = createServerClient();
  const { data, error } = await db
    .from('companies')
    .select('id, code, name, created_at')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: 'データ取得に失敗しました' }, { status: 500 });
  return Response.json({ companies: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!validateAdminRequest(req)) return adminUnauthorized();

  const { code, name, password, users } = await req.json();

  if (!code || !name || !password) {
    return Response.json({ error: 'code / name / password は必須です' }, { status: 400 });
  }

  const db = createServerClient();
  const passwordHash = hashPassword(password);

  const { data: company, error: companyError } = await db
    .from('companies')
    .insert({ code: code.trim().toUpperCase(), name, password_hash: passwordHash })
    .select('id, code, name')
    .single();

  if (companyError) {
    return Response.json({ error: '会社の登録に失敗しました' }, { status: 500 });
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
