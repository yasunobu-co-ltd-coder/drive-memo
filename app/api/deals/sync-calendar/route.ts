// POST /api/deals/sync-calendar — 既存の期日付き案件をGoogleカレンダーに一括登録
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { getAccessToken, getCalendarId } from '@/lib/google-calendar';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

type DealRow = {
  id: string;
  client_name: string;
  contact_person: string;
  memo: string;
  due_date: string;
};

async function createOneEvent(accessToken: string, calId: string, deal: DealRow): Promise<string | null> {
  const descParts: string[] = [];
  if (deal.contact_person) descParts.push(`担当者: ${deal.contact_person}`);
  if (deal.memo) descParts.push(`\n${deal.memo}`);
  descParts.push('\n\ndrive-memo');

  const res = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: deal.client_name || '案件',
      description: descParts.join('') || undefined,
      start: { date: deal.due_date },
      end:   { date: deal.due_date },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }] },
    }),
  });
  if (!res.ok) return null;
  const event = await res.json();
  return event.id ?? null;
}

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  // アクセストークン・カレンダーIDを一度だけ取得（N+1回避）
  const [accessToken, calId] = await Promise.all([
    getAccessToken(session.userId),
    getCalendarId(session.userId),
  ]);
  if (!accessToken) {
    return Response.json({ error: 'Googleカレンダー未連携' }, { status: 400 });
  }

  const db = createServerClient();

  // 期日あり & google_event_id未設定 & 未完了の案件を取得
  // Vercel Hobbyの10秒タイムアウト内に収まるよう上限を25件に抑える
  const { data: deals, error } = await db
    .from('deals')
    .select('id, client_name, contact_person, memo, due_date')
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId)
    .not('due_date', 'is', null)
    .is('google_event_id', null)
    .neq('status', 'done')
    .limit(25);

  if (error) return Response.json({ error: 'カレンダー同期に失敗しました' }, { status: 500 });

  const rows = (deals ?? []).filter((d): d is DealRow => !!d.due_date);

  // 全件並列でカレンダー登録（Google APIは十分並列に耐える）
  const results = await Promise.all(
    rows.map(deal => createOneEvent(accessToken, calId, deal)),
  );

  // DB更新も並列
  await Promise.all(
    results.map((eventId, i) =>
      eventId
        ? db.from('deals').update({ google_event_id: eventId }).eq('id', rows[i].id)
        : Promise.resolve(),
    ),
  );

  const synced = results.filter(Boolean).length;
  return Response.json({ synced, total: rows.length });
}
