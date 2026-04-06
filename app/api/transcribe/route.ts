// POST /api/transcribe — 音声ファイルをテキストに変換（OpenAI Whisper）
// 過去の取引先名をプロンプトに含めて固有名詞の精度を上げる
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// 会社ごとの取引先名キャッシュ（メモリ内、プロセス寿命）
const clientNameCache = new Map<string, { names: string; at: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分

/** 過去の取引先名を取得してWhisperプロンプト用文字列にする */
async function getClientHints(companyId: string): Promise<string> {
  const cached = clientNameCache.get(companyId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.names;

  const db = createServerClient();
  const { data } = await db
    .from('deals')
    .select('client_name')
    .eq('company_id', companyId)
    .not('client_name', 'eq', '')
    .order('created_at', { ascending: false })
    .limit(100);

  // ユニークな会社名を抽出
  const unique = [...new Set((data ?? []).map(d => d.client_name).filter(Boolean))];
  const names = unique.slice(0, 50).join('、');

  clientNameCache.set(companyId, { names, at: Date.now() });
  return names;
}

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return Response.json({ error: 'No file' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: 'ファイルサイズが大きすぎます（10MB以下）' }, { status: 400 });
  }

  // 過去の取引先名をWhisperプロンプトに含める（固有名詞の認識精度UP）
  const clientHints = await getClientHints(session.companyId);

  const basePrompt = '営業メモの音声入力です。株式会社、有限会社、合同会社、担当者、案件、見積もり、打ち合わせ、確認、連絡';
  const prompt = clientHints
    ? `${basePrompt}。取引先: ${clientHints}`
    : basePrompt;

  const transcription = await openai.audio.transcriptions.create({
    file,
    model:    'whisper-1',
    language: 'ja',
    prompt:   prompt.slice(0, 500), // Whisper promptは上限あり
  });

  return Response.json({ text: transcription.text });
}
