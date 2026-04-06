// PATCH  /api/deals/[id] — 案件更新（部分更新対応）
// DELETE /api/deals/[id] — 案件削除
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { createEvent, updateEvent, deleteEvent } from '@/lib/google-calendar';

const FIELDS = 'id, created_at, company_id, created_by, client_name, contact_person, memo, due_date, importance, assignment_type, assignee, status, google_event_id';

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

  // Googleカレンダー同期（非同期、失敗しても無視）
  if (data) {
    const syncCalendar = async () => {
      if (data.status === 'done' && data.google_event_id) {
        // 完了 → カレンダー予定削除
        await deleteEvent(session.userId, data.google_event_id);
        await db.from('deals').update({ google_event_id: null }).eq('id', data.id);
      } else if (data.google_event_id) {
        // 既存予定を更新
        await updateEvent(session.userId, data.google_event_id, {
          client_name:    data.client_name,
          contact_person: data.contact_person,
          memo:           data.memo,
          due_date:       data.due_date,
        });
      } else if (data.due_date && data.status !== 'done') {
        // 期日が新たに追加された → 予定作成
        const eventId = await createEvent(session.userId, {
          client_name:    data.client_name,
          contact_person: data.contact_person,
          memo:           data.memo,
          due_date:       data.due_date,
        });
        if (eventId) {
          await db.from('deals').update({ google_event_id: eventId }).eq('id', data.id);
        }
      }
    };
    syncCalendar().catch(() => {});
  }

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

  // 削除前にカレンダーイベントIDを取得
  const { data: deal } = await db
    .from('deals')
    .select('google_event_id, created_by')
    .eq('id', id)
    .eq('company_id', session.companyId)
    .single();

  const { error } = await db
    .from('deals')
    .delete()
    .eq('id', id)
    .eq('company_id', session.companyId);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Googleカレンダーの予定も削除（非同期）
  if (deal?.google_event_id) {
    deleteEvent(deal.created_by ?? session.userId, deal.google_event_id).catch(() => {});
  }

  return Response.json({ ok: true });
}
