// PATCH  /api/deals/[id] — 案件更新
// DELETE /api/deals/[id] — 案件削除
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';

const DEAL_SELECT = `
  *,
  created_user:users!deals_created_by_fkey(name),
  assignee_user:users!deals_assignee_fkey(name)
`;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const { id } = await params;
  const body = await req.json();
  const db = createServerClient();

  // company_id で所有権チェック
  const { data, error } = await db
    .from('deals')
    .update({
      client_name:     body.client_name,
      contact_person:  body.contact_person,
      memo:            body.memo,
      due_date:        body.due_date || null,
      importance:      body.importance,
      assignment_type: body.assignment_type,
      assignee:        body.assignee || null,
      status:          body.status,
      image_url:       body.image_url || null,
    })
    .eq('id', id)
    .eq('company_id', session.companyId)
    .select(DEAL_SELECT)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deal: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const { id } = await params;
  const db = createServerClient();

  const { error } = await db
    .from('deals')
    .delete()
    .eq('id', id)
    .eq('company_id', session.companyId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
