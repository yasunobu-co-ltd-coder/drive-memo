// ============================================================
// drive v2 — 認証ユーティリティ（サーバーサイド専用）
// ============================================================
import { after } from 'next/server';
import { createServerClient } from './supabase-server';

export const DEVICE_TOKEN_HEADER = 'x-device-token';
export const AUTH_KEY = 'drive_auth'; // localStorage キー

export type DeviceSession = {
  deviceToken: string;
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
};

/**
 * リクエストヘッダーから device_token を検証し、セッション情報を返す。
 * 検証失敗時は null を返す。
 */
export async function validateRequest(request: Request): Promise<DeviceSession | null> {
  const token = request.headers.get(DEVICE_TOKEN_HEADER);
  if (!token) return null;
  return validateToken(token);
}

// deviceTokenの有効期限（最終アクセスから30日）
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// ─── 認証キャッシュ（DBアクセスを大幅に削減） ───
type CachedSession = { session: DeviceSession; at: number };
const sessionCache = new Map<string, CachedSession>();
const SESSION_CACHE_TTL = 60 * 1000; // 60秒

// last_active_at の更新間隔（頻繁な書き込みを抑制）
const ACTIVE_UPDATE_INTERVAL = 5 * 60 * 1000; // 5分
const lastActiveUpdated = new Map<string, number>();

/**
 * device_token を検証してセッション情報を返す。
 * 60秒間のインメモリキャッシュでDBアクセスを削減。
 */
export async function validateToken(token: string): Promise<DeviceSession | null> {
  // キャッシュヒット → DBスキップ
  const cached = sessionCache.get(token);
  if (cached && Date.now() - cached.at < SESSION_CACHE_TTL) {
    throttledActiveUpdate(token);
    return cached.session;
  }

  const db = createServerClient();

  // 1クエリでJOIN取得を試行
  const { data: device, error } = await db
    .from('device_registrations')
    .select('company_id, last_user_id, last_active_at, companies(name), users!device_registrations_last_user_id_fkey(name)')
    .eq('device_token', token)
    .single();

  if (error || !device?.last_user_id) {
    // JOINが失敗した場合のフォールバック（FK未設定時）
    if (error?.code === 'PGRST200' || error?.message?.includes('could not find')) {
      return validateTokenFallback(token);
    }
    return null;
  }

  // 30日間未使用のトークンは無効
  if (device.last_active_at) {
    const lastActive = new Date(device.last_active_at).getTime();
    if (Date.now() - lastActive > TOKEN_MAX_AGE_MS) {
      after(async () => {
        try { await db.from('device_registrations').delete().eq('device_token', token); } catch {}
      });
      sessionCache.delete(token);
      return null;
    }
  }

  const companyName = (device as any).companies?.name;
  const userName    = (device as any).users?.name;
  if (!companyName || !userName) return null;

  const session: DeviceSession = {
    deviceToken: token,
    companyId:   device.company_id,
    companyName,
    userId:      device.last_user_id,
    userName,
  };

  // キャッシュに保存
  sessionCache.set(token, { session, at: Date.now() });
  throttledActiveUpdate(token);

  return session;
}

/** last_active_at の書き込みを5分に1回に間引く（レスポンス後にバックグラウンド実行） */
function throttledActiveUpdate(token: string) {
  const now = Date.now();
  const last = lastActiveUpdated.get(token) ?? 0;
  if (now - last < ACTIVE_UPDATE_INTERVAL) return;
  lastActiveUpdated.set(token, now);
  after(async () => {
    try {
      const db = createServerClient();
      await db.from('device_registrations')
        .update({ last_active_at: new Date().toISOString() })
        .eq('device_token', token);
    } catch {}
  });
}

/** キャッシュ無効化（ユーザー切替時に呼ぶ） */
export function invalidateSessionCache(token: string) {
  sessionCache.delete(token);
}

/** FK未設定時のフォールバック（並列クエリ） */
async function validateTokenFallback(token: string): Promise<DeviceSession | null> {
  const db = createServerClient();

  const { data: device, error } = await db
    .from('device_registrations')
    .select('company_id, last_user_id, last_active_at')
    .eq('device_token', token)
    .single();

  if (error || !device?.last_user_id) return null;

  // 30日間未使用のトークンは無効
  if (device.last_active_at) {
    const lastActive = new Date(device.last_active_at).getTime();
    if (Date.now() - lastActive > TOKEN_MAX_AGE_MS) {
      after(async () => {
        try { await db.from('device_registrations').delete().eq('device_token', token); } catch {}
      });
      return null;
    }
  }

  const [companyRes, userRes] = await Promise.all([
    db.from('companies').select('name').eq('id', device.company_id).single(),
    db.from('users').select('name').eq('id', device.last_user_id).single(),
  ]);

  if (!companyRes.data || !userRes.data) return null;

  const session: DeviceSession = {
    deviceToken: token,
    companyId:   device.company_id,
    companyName: companyRes.data.name,
    userId:      device.last_user_id,
    userName:    userRes.data.name,
  };

  // フォールバックもキャッシュ
  sessionCache.set(token, { session, at: Date.now() });
  throttledActiveUpdate(token);

  return session;
}

/**
 * 認証エラーレスポンスを返す共通関数
 */
export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
