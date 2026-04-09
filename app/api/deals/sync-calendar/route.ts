// POST /api/deals/sync-calendar — 既存の期日付き案件をGoogleカレンダーに一括登録
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { createEvent, isConnected } from '@/lib/google-calendar';

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  // カレンダー連携チェック
  const { connected } = await isConnected(session.userId);
  if (!connected) {
    return Response.json({ error: 'Googleカレンダー未連携' }, { status: 400 });
  }

  const db = createServerClient();

  // 期日あり & google_event_id未設定 & 未完了の案件を取得
  const { data: deals, error } = await db
    .from('deals')
    .select('id, client_name, contact_person, memo, due_date')
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId)
    .not('due_date', 'is', null)
    .is('google_event_id', null)
    .neq('status', 'done')
    .limit(50);

  if (error) return Response.json({ error: 'カレンダー同期に失敗しました' }, { status: 500 });

  let synced = 0;
  for (const deal of deals ?? []) {
    if (!deal.due_date) continue;
    const eventId = await createEvent(session.userId, {
      client_name:    deal.client_name,
      contact_person: deal.contact_person,
      memo:           deal.memo,
      due_date:       deal.due_date,
    });
    if (eventId) {
      await db.from('deals').update({ google_event_id: eventId }).eq('id', deal.id);
      synced++;
    }
  }

  return Response.json({ synced, total: deals?.length ?? 0 });
}
