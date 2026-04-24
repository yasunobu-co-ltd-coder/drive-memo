// PATCH  /api/deals/[id] — 案件更新（部分更新対応）
// DELETE /api/deals/[id] — 案件削除
import { NextRequest, after } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { createEvent, updateEvent, deleteEvent } from '@/lib/google-calendar';

const FIELDS = 'id, created_at, company_id, created_by, client_name, contact_person, memo, due_date, due_start_time, due_end_time, importance, assignment_type, assignee, status, google_event_id';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const { id } = await params;
  const body = await req.json();
  const db = createServerClient();

  // 送られたフィールドだけ更新（部分更新）+ バリデーション
  const MAX_LEN: Record<string, number> = { client_name: 200, contact_person: 100, memo: 5000 };
  const updates: Record<string, unknown> = {};
  const allowed = ['client_name', 'contact_person', 'memo', 'due_date', 'due_start_time', 'due_end_time', 'importance', 'assignment_type', 'assignee', 'status'] as const;
  const NULLABLE = new Set(['due_date', 'assignee', 'due_start_time', 'due_end_time']);
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const key of allowed) {
    if (key in body) {
      let val = NULLABLE.has(key) ? (body[key] || null) : body[key];
      // 文字列長制限
      if (typeof val === 'string' && MAX_LEN[key]) {
        val = val.slice(0, MAX_LEN[key]);
      }
      // 期日フォーマット検証
      if (key === 'due_date' && val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) continue;
      // 時刻フォーマット検証
      if ((key === 'due_start_time' || key === 'due_end_time') && val && !TIME_RE.test(val)) continue;
      // ステータス値制限
      if (key === 'status' && val !== '対応中' && val !== 'done') continue;
      updates[key] = val;
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  // 同じ会社でも他ユーザーの案件は編集不可（作成者のみ編集可）
  const { data, error } = await db
    .from('deals')
    .update(updates)
    .eq('id', id)
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId)
    .select(FIELDS)
    .single();

  if (error) return Response.json({ error: '案件の更新に失敗しました' }, { status: 500 });

  // Googleカレンダー同期（レスポンス後にバックグラウンド実行）
  if (data) {
    after(async () => {
      try {
        if (data.status === 'done' && data.google_event_id) {
          await deleteEvent(session.userId, data.google_event_id);
          await db.from('deals').update({ google_event_id: null }).eq('id', data.id);
        } else if (data.google_event_id) {
          await updateEvent(session.userId, data.google_event_id, {
            client_name:    data.client_name,
            contact_person: data.contact_person,
            memo:           data.memo,
            due_date:       data.due_date,
            due_start_time: data.due_start_time,
            due_end_time:   data.due_end_time,
          });
        } else if (data.due_date && data.status !== 'done') {
          const eventId = await createEvent(session.userId, {
            client_name:    data.client_name,
            contact_person: data.contact_person,
            memo:           data.memo,
            due_date:       data.due_date,
            due_start_time: data.due_start_time,
            due_end_time:   data.due_end_time,
          });
          if (eventId) {
            await db.from('deals').update({ google_event_id: eventId }).eq('id', data.id);
          }
        }
      } catch {}
    });
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

  // 削除前にカレンダーイベントIDを取得（作成者のみ削除可）
  const { data: deal } = await db
    .from('deals')
    .select('google_event_id, created_by')
    .eq('id', id)
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId)
    .single();

  const { error } = await db
    .from('deals')
    .delete()
    .eq('id', id)
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId);

  if (error) return Response.json({ error: '案件の削除に失敗しました' }, { status: 500 });

  // Googleカレンダーの予定も削除（レスポンス後にバックグラウンド実行）
  if (deal?.google_event_id) {
    const eventId = deal.google_event_id;
    const ownerId = deal.created_by ?? session.userId;
    after(async () => {
      try { await deleteEvent(ownerId, eventId); } catch {}
    });
  }

  return Response.json({ ok: true });
}
