// GET /api/debug/calendar-test — Google Calendar API デバッグ用（本番では削除）
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { getAccessToken, getCalendarId } from '@/lib/google-calendar';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const steps: Record<string, unknown> = {};

  // 1. アクセストークン取得
  const accessToken = await getAccessToken(session.userId);
  steps.accessToken = accessToken ? `${accessToken.slice(0, 10)}...` : null;

  if (!accessToken) {
    return Response.json({ error: 'トークン取得失敗（リフレッシュ失敗の可能性）', steps });
  }

  // 2. カレンダーID取得
  const calId = await getCalendarId(session.userId);
  steps.calendarId = calId;

  // 3. カレンダーリスト取得（そのカレンダーが存在するか）
  try {
    const listRes = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    steps.calendarCheck = { status: listRes.status, ok: listRes.ok };
    if (!listRes.ok) {
      steps.calendarCheckBody = await listRes.text();
    } else {
      const cal = await listRes.json();
      steps.calendarInfo = { summary: cal.summary, timeZone: cal.timeZone, id: cal.id };
    }
  } catch (e) {
    steps.calendarCheck = { error: String(e) };
  }

  // 4. テストイベント作成
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const createRes = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: '[テスト] drive-memo デバッグ',
        description: 'このイベントは自動テストです。削除して構いません。',
        start: { date: dateStr },
        end: { date: dateStr },
      }),
    });
    steps.createEvent = { status: createRes.status, ok: createRes.ok };
    const body = await createRes.text();
    try {
      const json = JSON.parse(body);
      steps.createEventResult = createRes.ok
        ? { eventId: json.id, htmlLink: json.htmlLink }
        : json;
    } catch {
      steps.createEventResult = body;
    }
  } catch (e) {
    steps.createEvent = { error: String(e) };
  }

  return Response.json({ userId: session.userId, steps });
}
