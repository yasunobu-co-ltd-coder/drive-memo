// ============================================================
// Google Calendar API ヘルパー（REST直接呼び出し）
// ============================================================
import { createServerClient } from './supabase-server';

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI!;

const SCOPES = 'https://www.googleapis.com/auth/calendar';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

// ─── OAuth URL生成 ───
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ─── 認可コードからトークン取得 ───
export async function exchangeCode(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  GOOGLE_REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

// ─── カレンダーIDを取得 ───
export async function getCalendarId(userId: string): Promise<string> {
  const db = createServerClient();
  const { data } = await db
    .from('google_tokens')
    .select('calendar_id')
    .eq('user_id', userId)
    .single();
  return data?.calendar_id || 'primary';
}

// ─── アクセストークン取得（必要ならリフレッシュ） ───
export async function getAccessToken(userId: string): Promise<string | null> {
  const db = createServerClient();

  const { data: token } = await db
    .from('google_tokens')
    .select('id, access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single();

  if (!token) return null;

  // 有効期限の5分前までOK
  if (new Date(token.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    return token.access_token;
  }

  // リフレッシュ
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('[GoogleCal] Token refresh failed:', res.status, errBody);
    // refresh_token 無効 → トークン削除
    await db.from('google_tokens').delete().eq('id', token.id);
    return null;
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await db
    .from('google_tokens')
    .update({
      access_token: data.access_token,
      expires_at:   expiresAt,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', token.id);

  return data.access_token;
}

// ─── トークン保存 ───
export async function saveTokens(userId: string, tokens: { access_token: string; refresh_token: string; expires_in: number }) {
  const db = createServerClient();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Googleアカウントのメールアドレスを取得
  let email: string | null = null;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (res.ok) {
      const info = await res.json();
      email = info.email ?? null;
    }
  } catch { /* ignore */ }

  // 「drive-memo」専用カレンダーを作成 or 取得
  let calendarId = 'primary';
  try {
    calendarId = await getOrCreateDriveCalendar(tokens.access_token);
  } catch { /* fallback to primary */ }

  await db
    .from('google_tokens')
    .upsert({
      user_id:       userId,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    expiresAt,
      email:         email,
      calendar_id:   calendarId,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id' });
}

// ─── 専用カレンダー作成 or 取得 ───
async function getOrCreateDriveCalendar(accessToken: string): Promise<string> {
  // 既存カレンダーを検索
  const listRes = await fetch(`${CALENDAR_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (listRes.ok) {
    const { items } = await listRes.json();
    const existing = items?.find((c: { summary: string }) => c.summary === 'drive-memo');
    if (existing) return existing.id;
  }

  // 新規作成
  const createRes = await fetch(`${CALENDAR_BASE}/calendars`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: 'drive-memo',
      description: 'driveアプリの案件メモから自動登録される予定',
      timeZone: 'Asia/Tokyo',
    }),
  });
  if (createRes.ok) {
    const cal = await createRes.json();
    return cal.id;
  }

  return 'primary'; // fallback
}

// ─── カレンダー予定作成 ───
export async function createEvent(userId: string, deal: {
  client_name: string;
  contact_person: string;
  memo: string;
  due_date: string;
}): Promise<string | null> {
  const accessToken = await getAccessToken(userId);
  if (!accessToken) return null;

  const calId = await getCalendarId(userId);
  const summary = deal.client_name || '案件';
  const descParts: string[] = [];
  if (deal.contact_person) descParts.push(`担当者: ${deal.contact_person}`);
  if (deal.memo) descParts.push(`\n${deal.memo}`);
  descParts.push('\n\ndrive-memo');

  const res = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary,
      description: descParts.join('') || undefined,
      start: { date: deal.due_date },
      end:   { date: deal.due_date },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 1440 }],
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('[GoogleCal] createEvent failed:', res.status, errBody, { userId, calId, due_date: deal.due_date });
    return null;
  }
  const event = await res.json();
  return event.id ?? null;
}

// ─── カレンダー予定更新 ───
export async function updateEvent(userId: string, eventId: string, deal: {
  client_name: string;
  contact_person: string;
  memo: string;
  due_date: string | null;
}): Promise<boolean> {
  if (!deal.due_date) {
    return deleteEvent(userId, eventId);
  }

  const accessToken = await getAccessToken(userId);
  if (!accessToken) return false;

  const calId = await getCalendarId(userId);
  const summary = deal.client_name || '案件';
  const descParts: string[] = [];
  if (deal.contact_person) descParts.push(`担当者: ${deal.contact_person}`);
  if (deal.memo) descParts.push(`\n${deal.memo}`);
  descParts.push('\n\ndrive-memo');

  const res = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events/${eventId}`, {
    method: 'PUT',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary,
      description: descParts.join('') || undefined,
      start: { date: deal.due_date },
      end:   { date: deal.due_date },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 1440 }],
      },
    }),
  });

  return res.ok;
}

// ─── カレンダー予定削除 ───
export async function deleteEvent(userId: string, eventId: string): Promise<boolean> {
  const accessToken = await getAccessToken(userId);
  if (!accessToken) return false;

  const calId = await getCalendarId(userId);
  const res = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return res.ok || res.status === 404; // 404 = 既に削除済み
}

// ─── 連携状態確認 ───
export async function isConnected(userId: string): Promise<{ connected: boolean; email?: string }> {
  const db = createServerClient();
  const { data } = await db
    .from('google_tokens')
    .select('id, email')
    .eq('user_id', userId)
    .single();
  if (!data) return { connected: false };
  return { connected: true, email: data.email ?? undefined };
}

// ─── 連携解除 ───
export async function disconnect(userId: string): Promise<void> {
  const db = createServerClient();

  // Googleのトークンを無効化
  const { data: token } = await db
    .from('google_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .single();

  // Google側でトークンをrevoke（失敗しても無視）+ DB削除を並列実行して完走を保証
  await Promise.all([
    token
      ? fetch(`https://oauth2.googleapis.com/revoke?token=${token.access_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }).catch(() => {})
      : Promise.resolve(),
    db.from('google_tokens').delete().eq('user_id', userId),
  ]);
}
