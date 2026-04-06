// DELETE /api/admin/companies/[id]/users/[userId] — ユーザー削除
import { NextRequest } from 'next/server';
import { validateAdminRequest, adminUnauthorized } from '@/lib/admin-auth';
import { createServerClient } from '@/lib/supabase-server';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  if (!validateAdminRequest(req)) return adminUnauthorized();

  const { id, userId } = await params;
  const db = createServerClient();

  const { error } = await db
    .from('users')
    .delete()
    .eq('id', userId)
    .eq('company_id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
