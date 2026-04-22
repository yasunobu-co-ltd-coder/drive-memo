// DELETE /api/admin/companies/[id]/users/[userId] — ユーザー削除
// メモ（deals）データがある場合は削除不可
import { NextRequest } from 'next/server';
import { validateAdminRequest, adminUnauthorized } from '@/lib/admin-auth';
import { createServerClient } from '@/lib/supabase-server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  if (!validateAdminRequest(req)) return adminUnauthorized();

  const { id, userId } = await params;
  // URL由来のIDを.or()に埋め込むためUUID形式を検証（PostgRESTフィルタDSL注入対策）
  if (!UUID_RE.test(id) || !UUID_RE.test(userId)) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const db = createServerClient();

  // メモデータの有無を確認（created_by または assignee）
  const { count } = await db
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', id)
    .or(`created_by.eq.${userId},assignee.eq.${userId}`);

  if (count && count > 0) {
    return Response.json(
      { error: `この担当者には ${count} 件のメモデータがあるため削除できません` },
      { status: 409 }
    );
  }

  const { error } = await db
    .from('users')
    .delete()
    .eq('id', userId)
    .eq('company_id', id);

  if (error) return Response.json({ error: 'ユーザーの削除に失敗しました' }, { status: 500 });
  return Response.json({ ok: true });
}
