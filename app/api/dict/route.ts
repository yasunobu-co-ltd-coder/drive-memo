// GET /api/dict?q=... — 会社名辞書サジェスト検索
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('q') ?? '';
  if (raw.length < 1) return Response.json({ results: [] });

  // 特殊文字をエスケープしてSQLインジェクションを防止
  const q = raw.replace(/[%_\\]/g, c => `\\${c}`);

  const db = createServerClient();

  const { data } = await db
    .from('company_name_dict')
    .select('company_name, reading, alias')
    .or(`company_name.ilike.%${q}%,reading.ilike.%${q}%`)
    .limit(5);

  return Response.json({ results: data ?? [] });
}
