// POST /api/deals/[id]/calendar — 既存案件をGoogleカレンダーに個別登録
// 一覧の「カレンダーに登録」ボタン用。
// - due_date 必須
// - 既に google_event_id が入っていれば 409 で二重登録を防ぐ
// - Google API 側のエラーはそのままレスポンスに載せる（UIで原因が分かるよう診断性を優先）
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { getAccessToken, getCalendarId, toHHMM } from '@/lib/google-calendar';

const CALENDAR_BASE  = 'https://www.googleapis.com/calendar/v3';
const EVENT_TIMEZONE = 'Asia/Tokyo';
const DEFAULT_START  = '08:00';
const DEFAULT_END    = '08:30';

const FIELDS = 'id, created_at, company_id, created_by, client_name, contact_person, memo, due_date, due_start_time, due_end_time, importance, assignment_type, assignee, status, google_event_id';

function addOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + 60;
  if (total >= 24 * 60) return '23:59';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

type CalCreateArgs = {
  accessToken: string;
  calId: string;
  deal: {
    client_name: string;
    contact_person: string;
    memo: string;
    due_date: string;
    due_start_time: string | null;
    due_end_time: string | null;
  };
};

async function createEventRaw({ accessToken, calId, deal }: CalCreateArgs) {
  // DB の time 型は 'HH:MM:SS' で返るため HH:MM に正規化してから使う
  const normStart = toHHMM(deal.due_start_time);
  const normEnd   = toHHMM(deal.due_end_time);
  const startT = normStart || DEFAULT_START;
  const endT   = normEnd
    || (normStart ? addOneHour(normStart) : DEFAULT_END);

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
      start: { dateTime: `${deal.due_date}T${startT}:00`, timeZone: EVENT_TIMEZONE },
      end:   { dateTime: `${deal.due_date}T${endT}:00`,   timeZone: EVENT_TIMEZONE },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
    }),
  });

  const bodyText = await res.text();
  return { status: res.status, ok: res.ok, body: bodyText };
}

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

  const accessToken = await getAccessToken(session.userId);
  if (!accessToken) {
    return Response.json(
      { error: 'Googleカレンダー未連携、またはトークンの更新に失敗しました。設定から再連携してください' },
      { status: 400 },
    );
  }

  let calId = await getCalendarId(session.userId);
  const dealArgs = {
    client_name:    deal.client_name,
    contact_person: deal.contact_person,
    memo:           deal.memo,
    due_date:       deal.due_date as string,
    due_start_time: deal.due_start_time,
    due_end_time:   deal.due_end_time,
  };

  let attempt = await createEventRaw({ accessToken, calId, deal: dealArgs });

  // カレンダー自体が消えている等 (404 / Not Found) の場合は primary にフォールバックして再試行
  if (!attempt.ok && (attempt.status === 404 || /notFound|deleted/i.test(attempt.body)) && calId !== 'primary') {
    console.error('[GoogleCal/individual] calendar_id invalid, falling back to primary:', { calId, body: attempt.body.slice(0, 300) });
    calId = 'primary';
    attempt = await createEventRaw({ accessToken, calId, deal: dealArgs });
  }

  if (!attempt.ok) {
    console.error('[GoogleCal/individual] createEvent failed:', {
      status: attempt.status,
      body: attempt.body.slice(0, 500),
      userId: session.userId,
      calId,
      dealId: id,
    });
    // Google のエラーメッセージを抜粋してUIに返す
    let reason = attempt.body.slice(0, 200);
    try {
      const j = JSON.parse(attempt.body) as { error?: { message?: string } };
      if (j?.error?.message) reason = j.error.message;
    } catch { /* JSON でなければ素のテキストを使う */ }
    return Response.json(
      { error: `Googleカレンダー登録失敗 (${attempt.status}): ${reason}` },
      { status: 502 },
    );
  }

  let eventId: string | null = null;
  try {
    const parsed = JSON.parse(attempt.body) as { id?: string };
    eventId = parsed?.id ?? null;
  } catch { /* noop */ }

  if (!eventId) {
    console.error('[GoogleCal/individual] no event id in response:', attempt.body.slice(0, 300));
    return Response.json({ error: 'Googleから予定IDが返されませんでした' }, { status: 502 });
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
