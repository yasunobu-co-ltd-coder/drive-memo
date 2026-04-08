// POST /api/deals/migrate-calendar — primaryカレンダーの古いイベントを削除し、drive-memoカレンダーに再登録
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { getAccessToken, getCalendarId, createEvent } from '@/lib/google-calendar';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const accessToken = await getAccessToken(session.userId);
  if (!accessToken) return Response.json({ error: 'トークン取得失敗' }, { status: 400 });

  const calId = await getCalendarId(session.userId);
  const db = createServerClient();

  // 1. 既存のevent_idがある案件を取得
  const { data: synced } = await db
    .from('deals')
    .select('id, google_event_id')
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId)
    .not('google_event_id', 'is', null);

  // 2. primaryカレンダーから古いイベントを削除
  let deleted = 0;
  for (const deal of synced ?? []) {
    if (!deal.google_event_id) continue;
    try {
      // primaryカレンダーから削除を試行
      const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events/${deal.google_event_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok || res.status === 404) deleted++;
    } catch { /* ignore */ }
  }

  // 3. 全案件のevent_idをクリア
  await db
    .from('deals')
    .update({ google_event_id: null })
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId)
    .not('google_event_id', 'is', null);

  // 4. 対応中 & 期日ありの案件をdrive-memoカレンダーに再登録
  const { data: targets } = await db
    .from('deals')
    .select('id, client_name, contact_person, memo, due_date')
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId)
    .not('due_date', 'is', null)
    .neq('status', 'done')
    .limit(100);

  let created = 0;
  for (const deal of targets ?? []) {
    if (!deal.due_date) continue;
    const eventId = await createEvent(session.userId, {
      client_name: deal.client_name,
      contact_person: deal.contact_person,
      memo: deal.memo,
      due_date: deal.due_date,
    });
    if (eventId) {
      await db.from('deals').update({ google_event_id: eventId }).eq('id', deal.id);
      created++;
    }
  }

  return Response.json({
    deleted,
    cleared: synced?.length ?? 0,
    created,
    calendarId: calId,
  });
}
