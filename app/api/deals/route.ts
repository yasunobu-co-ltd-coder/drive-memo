// GET  /api/deals  — 案件一覧取得（自分の案件のみ）
// POST /api/deals  — 案件新規作成
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { createEvent } from '@/lib/google-calendar';

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const db = createServerClient();

  // 自分が作成 or 担当の案件のみ取得（クライアント側フィルタ不要に）
  const { data, error } = await db
    .from('deals')
    .select('id, created_at, company_id, created_by, client_name, contact_person, memo, due_date, importance, assignment_type, assignee, status, google_event_id')
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return Response.json({ error: 'データ取得に失敗しました' }, { status: 500 });
  return Response.json({ deals: data ?? [] });
}

// 文字列を安全な長さに切り詰め
function truncate(s: string | undefined | null, max: number): string {
  return (s ?? '').slice(0, max);
}

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const body = await req.json();
  const db = createServerClient();

  // 入力バリデーション：長さ制限
  const clientName    = truncate(body.client_name, 200);
  const contactPerson = truncate(body.contact_person, 100);
  const memo          = truncate(body.memo, 5000);
  const dueDate       = body.due_date || null;
  const status        = body.status === 'done' ? 'done' : '対応中';

  // 期日フォーマット検証（YYYY-MM-DD）
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return Response.json({ error: '期日の形式が不正です' }, { status: 400 });
  }

  const { data, error } = await db
    .from('deals')
    .insert({
      company_id:      session.companyId,
      created_by:      session.userId,
      client_name:     clientName,
      contact_person:  contactPerson,
      memo,
      due_date:        dueDate,
      assignment_type: body.assignment_type ?? '自分で',
      assignee:        body.assignee        || null,
      status,
    })
    .select('id, created_at, company_id, created_by, client_name, contact_person, memo, due_date, importance, assignment_type, assignee, status, google_event_id')
    .single();

  if (error) return Response.json({ error: '案件の登録に失敗しました' }, { status: 500 });

  // Googleカレンダーに予定作成（期日がある場合、非同期で失敗しても無視）
  if (data && data.due_date) {
    createEvent(session.userId, {
      client_name:    data.client_name,
      contact_person: data.contact_person,
      memo:           data.memo,
      due_date:       data.due_date,
    }).then(async (eventId) => {
      if (eventId) {
        await db.from('deals').update({ google_event_id: eventId }).eq('id', data.id);
      }
    }).catch(() => {});
  }

  return Response.json({ deal: data }, { status: 201 });
}
