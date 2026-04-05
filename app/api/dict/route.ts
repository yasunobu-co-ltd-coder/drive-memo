// GET /api/dict?q=... — 会社名辞書サジェスト検索
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.length < 1) return Response.json({ results: [] });

  const db = createServerClient();

  const { data } = await db
    .from('company_name_dict')
    .select('company_name, reading, alias')
    .or(`company_name.ilike.%${q}%,reading.ilike.%${q}%`)
    .limit(5);

  return Response.json({ results: data ?? [] });
}
