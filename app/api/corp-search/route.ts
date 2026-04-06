// GET /api/corp-search?q=xxx
// 法人辞書からリアルタイム前方一致検索（音声入力中に並列で呼ばれる）
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// ひらがな → カタカナ変換
function hiraToKata(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

// 会社形態の接頭辞・接尾辞を除去（検索精度向上）
const CORP_PREFIXES = [
  '株式会社', '有限会社', '合同会社', '合名会社', '合資会社',
  'かぶしきがいしゃ', 'ゆうげんがいしゃ', 'ごうどうがいしゃ',
  'カブシキガイシャ', 'ユウゲンガイシャ', 'ゴウドウガイシャ',
];

function stripCorpPrefix(s: string): string {
  for (const p of CORP_PREFIXES) {
    if (s.startsWith(p)) return s.slice(p.length);
  }
  return s;
}

// LIKE で使う特殊文字をエスケープ
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, c => '\\' + c);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return Response.json({ results: [] });
  }

  // 前処理：法人形態を除去 → カタカナ変換
  const cleaned = stripCorpPrefix(q);
  if (cleaned.length < 2) return Response.json({ results: [] });

  const kata = hiraToKata(cleaned);
  const escaped = escapeLike(kata);
  const escapedName = escapeLike(cleaned);

  const db = createServerClient();

  // フリガナ前方一致 OR 法人名前方一致（どちらかでヒット）
  const { data, error } = await db
    .from('corp_dict')
    .select('name, furi')
    .or(`furi.like.${escaped}%,name.like.%${escapedName}%`)
    .limit(8);

  if (error) {
    return Response.json({ results: [] });
  }

  return Response.json({ results: data ?? [] });
}
