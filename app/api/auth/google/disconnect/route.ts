// DELETE /api/auth/google/disconnect — Googleカレンダー連携解除
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { disconnect } from '@/lib/google-calendar';

export async function DELETE(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  await disconnect(session.userId);
  return Response.json({ ok: true });
}
