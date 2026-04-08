// ============================================================
// drive v2 — 認証ユーティリティ（サーバーサイド専用）
// ============================================================
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

/**
 * device_token を検証してセッション情報を返す。
 * JOINで1クエリに最適化（device_registrations → companies, users）。
 * ※ last_user_id に FK制約が必要（20260408_011_performance_indexes.sql）
 * FK未設定の場合はフォールバックで並列取得。
 */
export async function validateToken(token: string): Promise<DeviceSession | null> {
  const db = createServerClient();

  // 1クエリでJOIN取得を試行
  const { data: device, error } = await db
    .from('device_registrations')
    .select('company_id, last_user_id, companies(name), users!device_registrations_last_user_id_fkey(name)')
    .eq('device_token', token)
    .single();

  if (error || !device?.last_user_id) {
    // JOINが失敗した場合のフォールバック（FK未設定時）
    if (error?.code === 'PGRST200' || error?.message?.includes('could not find')) {
      return validateTokenFallback(token);
    }
    return null;
  }

  const companyName = (device as any).companies?.name;
  const userName    = (device as any).users?.name;
  if (!companyName || !userName) return null;

  // last_active_at を非同期更新（レスポンスを待たない）
  db.from('device_registrations')
    .update({ last_active_at: new Date().toISOString() })
    .eq('device_token', token)
    .then(() => {});

  return {
    deviceToken: token,
    companyId:   device.company_id,
    companyName,
    userId:      device.last_user_id,
    userName,
  };
}

/** FK未設定時のフォールバック（並列クエリ） */
async function validateTokenFallback(token: string): Promise<DeviceSession | null> {
  const db = createServerClient();

  const { data: device, error } = await db
    .from('device_registrations')
    .select('company_id, last_user_id')
    .eq('device_token', token)
    .single();

  if (error || !device?.last_user_id) return null;

  const [companyRes, userRes] = await Promise.all([
    db.from('companies').select('name').eq('id', device.company_id).single(),
    db.from('users').select('name').eq('id', device.last_user_id).single(),
  ]);

  if (!companyRes.data || !userRes.data) return null;

  db.from('device_registrations')
    .update({ last_active_at: new Date().toISOString() })
    .eq('device_token', token)
    .then(() => {});

  return {
    deviceToken: token,
    companyId:   device.company_id,
    companyName: companyRes.data.name,
    userId:      device.last_user_id,
    userName:    userRes.data.name,
  };
}

/**
 * 認証エラーレスポンスを返す共通関数
 */
export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
