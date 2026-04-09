// PATCH  /api/admin/companies/[id] — 会社情報更新（コード・パスワード）
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
  const body = await req.json();
  const db = createServerClient();
  const updates: Record<string, unknown> = {};

  // パスワード変更
  if (body.password) {
    if (typeof body.password !== 'string' || body.password.length < 8) {
      return Response.json({ error: 'パスワードは8文字以上で入力してください' }, { status: 400 });
    }
    updates.password_hash = hashPassword(body.password);
  }

  // コード変更
  if (body.code) {
    if (typeof body.code !== 'string' || body.code.trim().length < 1) {
      return Response.json({ error: 'コードを入力してください' }, { status: 400 });
    }
    // 重複チェック
    const { data: existing } = await db
      .from('companies')
      .select('id')
      .eq('code', body.code.trim())
      .neq('id', id)
      .single();
    if (existing) {
      return Response.json({ error: 'このコードは既に使用されています' }, { status: 409 });
    }
    updates.code = body.code.trim();
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: '変更内容がありません' }, { status: 400 });
  }

  const { error } = await db.from('companies').update(updates).eq('id', id);
  if (error) return Response.json({ error: '操作に失敗しました' }, { status: 500 });
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
  if (error) return Response.json({ error: '操作に失敗しました' }, { status: 500 });

  return Response.json({ ok: true });
}
