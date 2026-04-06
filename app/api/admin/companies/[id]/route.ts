// PATCH  /api/admin/companies/[id] — パスワード変更
// DELETE /api/admin/companies/[id] — 会社削除
import { NextRequest } from 'next/server';
import { validateAdminRequest, adminUnauthorized } from '@/lib/admin-auth';
import { hashPassword } from '@/lib/password';
import { createServerClient } from '@/lib/supabase-server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminRequest(req)) return adminUnauthorized();

  const { id } = await params;
  const { password } = await req.json();

  if (!password || typeof password !== 'string' || password.length < 4) {
    return Response.json({ error: 'パスワードは4文字以上で入力してください' }, { status: 400 });
  }

  const db = createServerClient();
  const { error } = await db
    .from('companies')
    .update({ password_hash: hashPassword(password) })
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminRequest(req)) return adminUnauthorized();

  const { id } = await params;
  const db = createServerClient();

  // 関連データを先に削除（FK制約対応）
  await db.from('deals').delete().eq('company_id', id);
  await db.from('device_registrations').delete().eq('company_id', id);
  await db.from('users').delete().eq('company_id', id);

  const { error } = await db.from('companies').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
