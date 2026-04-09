// GET /api/auth/google — Google OAuth認証開始
// device_token をstateに含めてリダイレクト（HMAC署名付き）
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { getAuthUrl } from '@/lib/google-calendar';

function signState(payload: string): string {
  const secret = process.env.ADMIN_SECRET || process.env.GOOGLE_CLIENT_SECRET!;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  // stateにuserIdを含める（HMAC署名付きでdeviceToken漏洩を防止）
  const payload = Buffer.from(JSON.stringify({
    userId: session.userId,
    deviceToken: session.deviceToken,
  })).toString('base64url');
  const sig = signState(payload);
  const state = `${payload}.${sig}`;

  const url = getAuthUrl(state);
  return Response.json({ url });
}
