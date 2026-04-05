// GET  /api/deals  — 案件一覧取得
// POST /api/deals  — 案件新規作成
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';

const DEAL_SELECT = `
  *,
  created_user:users!deals_created_by_fkey(name),
  assignee_user:users!deals_assignee_fkey(name)
`;

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const db = createServerClient();

  const { data, error } = await db
    .from('deals')
    .select(DEAL_SELECT)
    .eq('company_id', session.companyId)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deals: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const body = await req.json();
  const db = createServerClient();

  const { data, error } = await db
    .from('deals')
    .insert({
      company_id:      session.companyId,
      created_by:      session.userId,
      client_name:     body.client_name     ?? '',
      contact_person:  body.contact_person  ?? '',
      memo:            body.memo            ?? '',
      due_date:        body.due_date        || null,
      importance:      body.importance      ?? 'mid',
      assignment_type: body.assignment_type ?? '任せる',
      assignee:        body.assignee        || null,
      status:          body.status          ?? '未着手',
      image_url:       body.image_url       || null,
    })
    .select(DEAL_SELECT)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deal: data }, { status: 201 });
}
