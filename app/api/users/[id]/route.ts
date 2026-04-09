// DELETE /api/users/[id] — ユーザー削除
// メモ（deals）データがある場合は削除不可
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const { id } = await params;
  const db = createServerClient();

  // メモデータの有無を確認
  const { count } = await db
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', session.companyId)
    .or(`created_by.eq.${id},assignee.eq.${id}`);

  if (count && count > 0) {
    return Response.json(
      { error: `この担当者には ${count} 件のメモデータがあるため削除できません` },
      { status: 409 }
    );
  }

  const { error } = await db
    .from('users')
    .delete()
    .eq('id', id)
    .eq('company_id', session.companyId);

  if (error) return Response.json({ error: 'ユーザーの削除に失敗しました' }, { status: 500 });
  return Response.json({ ok: true });
}
