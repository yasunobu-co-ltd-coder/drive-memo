// GET  /api/deals  — 案件一覧取得（自分の案件のみ）
// POST /api/deals  — 案件新規作成
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const db = createServerClient();

  // 自分が作成 or 担当の案件のみ取得（クライアント側フィルタ不要に）
  const { data, error } = await db
    .from('deals')
    .select('id, created_at, company_id, created_by, client_name, contact_person, memo, due_date, importance, assignment_type, assignee, status')
    .eq('company_id', session.companyId)
    .or(`created_by.eq.${session.userId},assignee.eq.${session.userId}`)
    .order('created_at', { ascending: false })
    .limit(200);

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
      assignment_type: body.assignment_type ?? '自分で',
      assignee:        body.assignee        || null,
      status:          body.status          ?? '未着手',
    })
    .select('id, created_at, company_id, created_by, client_name, contact_person, memo, due_date, importance, assignment_type, assignee, status')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deal: data }, { status: 201 });
}
