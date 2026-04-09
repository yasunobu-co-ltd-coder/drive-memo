// GET /api/dict?q=... — 会社名辞書サジェスト検索
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const raw = req.nextUrl.searchParams.get('q') ?? '';
  if (raw.length < 1) return Response.json({ results: [] });

  // 特殊文字をエスケープ（LIKE用 + PostgREST filter構文用）
  const q = raw.replace(/[%_\\]/g, c => `\\${c}`)
    .replace(/[.,()]/g, ''); // PostgRESTフィルタ構文で誤解釈される文字を除去

  if (!q) return Response.json({ results: [] });

  const db = createServerClient();

  const { data } = await db
    .from('company_name_dict')
    .select('company_name, reading, alias')
    .or(`company_name.ilike.%${q}%,reading.ilike.%${q}%`)
    .limit(5);

  return Response.json({ results: data ?? [] });
}
