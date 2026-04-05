// GET /api/auth/validate
// device_token を検証してセッション情報を返す（起動時の自動ログイン）
import { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }
  return Response.json(session);
}
