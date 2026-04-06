// PATCH  /api/deals/[id] — 案件更新（部分更新対応）
// DELETE /api/deals/[id] — 案件削除
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';

const FIELDS = 'id, created_at, company_id, created_by, client_name, contact_person, memo, due_date, importance, assignment_type, assignee, status';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const { id } = await params;
  const body = await req.json();
  const db = createServerClient();

  // 送られたフィールドだけ更新（部分更新）
  const updates: Record<string, unknown> = {};
  const allowed = ['client_name', 'contact_person', 'memo', 'due_date', 'importance', 'assignment_type', 'assignee', 'status'] as const;
  for (const key of allowed) {
    if (key in body) {
      updates[key] = (key === 'due_date' || key === 'assignee') ? (body[key] || null) : body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await db
    .from('deals')
    .update(updates)
    .eq('id', id)
    .eq('company_id', session.companyId)
    .select(FIELDS)
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
