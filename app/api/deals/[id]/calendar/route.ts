// POST /api/deals/[id]/calendar — 既存案件をGoogleカレンダーに個別登録
// 一覧の「カレンダーに登録」ボタン用。
// - due_date 必須
// - 既に google_event_id が入っていれば 409 で二重登録を防ぐ
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { createEvent } from '@/lib/google-calendar';

const FIELDS = 'id, created_at, company_id, created_by, client_name, contact_person, memo, due_date, due_start_time, due_end_time, importance, assignment_type, assignee, status, google_event_id';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const { id } = await params;
  const db = createServerClient();

  // 自分が作成した案件のみ対象
  const { data: deal, error } = await db
    .from('deals')
    .select(FIELDS)
    .eq('id', id)
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId)
    .single();

  if (error || !deal) {
    return Response.json({ error: '案件が見つかりません' }, { status: 404 });
  }

  if (!deal.due_date) {
    return Response.json({ error: '期日が設定されていません' }, { status: 400 });
  }

  // 二重登録防止
  if (deal.google_event_id) {
    return Response.json({ error: '既にカレンダーに登録済みです' }, { status: 409 });
  }

  const eventId = await createEvent(session.userId, {
    client_name:    deal.client_name,
    contact_person: deal.contact_person,
    memo:           deal.memo,
    due_date:       deal.due_date,
    due_start_time: deal.due_start_time,
    due_end_time:   deal.due_end_time,
  });

  if (!eventId) {
    return Response.json({ error: 'カレンダーへの登録に失敗しました（連携状態を確認してください）' }, { status: 502 });
  }

  const { data: updated, error: updateErr } = await db
    .from('deals')
    .update({ google_event_id: eventId })
    .eq('id', id)
    .select(FIELDS)
    .single();

  if (updateErr) {
    return Response.json({ error: 'DB更新に失敗しました' }, { status: 500 });
  }

  return Response.json({ deal: updated });
}
