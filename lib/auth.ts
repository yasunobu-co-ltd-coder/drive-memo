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
 */
export async function validateToken(token: string): Promise<DeviceSession | null> {
  const db = createServerClient();

  const { data, error } = await db
    .from('device_registrations')
    .select(`
      device_token,
      company_id,
      last_user_id,
      companies ( name ),
      users!device_registrations_last_user_id_fkey ( name )
    `)
    .eq('device_token', token)
    .single();

  if (error || !data) return null;

  // last_active_at を更新（非同期・エラーは無視）
  db.from('device_registrations')
    .update({ last_active_at: new Date().toISOString() })
    .eq('device_token', token)
    .then(() => {});

  const company = data.companies as unknown as { name: string } | null;
  const user    = data.users    as unknown as { name: string } | null;

  if (!data.last_user_id || !user || !company) return null;

  return {
    deviceToken:  token,
    companyId:    data.company_id,
    companyName:  company.name,
    userId:       data.last_user_id,
    userName:     user.name,
  };
}

/**
 * 認証エラーレスポンスを返す共通関数
 */
export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
