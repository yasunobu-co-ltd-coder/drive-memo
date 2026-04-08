// GET /api/debug/calendar-test — Google Calendar API デバッグ用（本番では削除）
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { getAccessToken, getCalendarId } from '@/lib/google-calendar';
import { createServerClient } from '@/lib/supabase-server';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const steps: Record<string, unknown> = {};
  const db = createServerClient();

  // 0. 案件の状態を確認
  const { data: deals } = await db
    .from('deals')
    .select('id, client_name, due_date, status, google_event_id')
    .eq('company_id', session.companyId)
    .eq('created_by', session.userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const allDeals = deals ?? [];
  const withDueDate = allDeals.filter(d => d.due_date);
  const syncTargets = withDueDate.filter(d => !d.google_event_id && d.status !== 'done');

  steps.deals = {
    total: allDeals.length,
    withDueDate: withDueDate.length,
    alreadySynced: withDueDate.filter(d => d.google_event_id).length,
    done: withDueDate.filter(d => d.status === 'done').length,
    syncTargets: syncTargets.length,
    samples: allDeals.slice(0, 5).map(d => ({
      client: d.client_name,
      due: d.due_date,
      status: d.status,
      eventId: d.google_event_id,
    })),
  };

  // 1. アクセストークン取得
  const accessToken = await getAccessToken(session.userId);
  steps.accessToken = accessToken ? `${accessToken.slice(0, 10)}...` : null;

  if (!accessToken) {
    return Response.json({ error: 'トークン取得失敗', steps });
  }

  // 2. カレンダーID取得
  const calId = await getCalendarId(session.userId);
  steps.calendarId = calId;

  // 3. カレンダー存在確認
  try {
    const listRes = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    steps.calendarCheck = { status: listRes.status, ok: listRes.ok };
    if (listRes.ok) {
      const cal = await listRes.json();
      steps.calendarInfo = { summary: cal.summary, timeZone: cal.timeZone };
    } else {
      steps.calendarCheckBody = await listRes.text();
    }
  } catch (e) {
    steps.calendarCheck = { error: String(e) };
  }

  return Response.json({ userId: session.userId, steps });
}
