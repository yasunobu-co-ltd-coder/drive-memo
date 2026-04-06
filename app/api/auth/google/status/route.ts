// GET /api/auth/google/status — Googleカレンダー連携状態確認
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { isConnected } from '@/lib/google-calendar';

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const connected = await isConnected(session.userId);
  return Response.json({ connected });
}
