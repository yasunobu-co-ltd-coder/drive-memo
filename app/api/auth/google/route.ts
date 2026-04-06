// GET /api/auth/google — Google OAuth認証開始
// device_token をstateに含めてリダイレクト
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { getAuthUrl } from '@/lib/google-calendar';

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  // stateにuserIdを含める（callbackで使う）
  const state = Buffer.from(JSON.stringify({
    userId: session.userId,
    deviceToken: session.deviceToken,
  })).toString('base64url');

  const url = getAuthUrl(state);
  return Response.json({ url });
}
