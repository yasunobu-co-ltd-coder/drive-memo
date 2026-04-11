// POST /api/transcribe — 音声ファイルをテキストに変換（OpenAI Whisper）
// 過去の取引先名をプロンプトに含めて固有名詞の精度を上げる
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a'];

// 会社ごとの固有名詞キャッシュ（メモリ内、プロセス寿命）
type HintCache = { clients: string[]; contacts: string[]; at: number };
const clientNameCache = new Map<string, HintCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5分

/** 自社の過去案件から固有名詞を取得する */
async function getClientHints(companyId: string): Promise<{ clients: string[]; contacts: string[] }> {
  const cached = clientNameCache.get(companyId);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return { clients: cached.clients, contacts: cached.contacts };
  }

  const db = createServerClient();
  const { data } = await db
    .from('deals')
    .select('client_name, contact_person')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = data ?? [];
  const clients = [...new Set(rows.map(d => d.client_name).filter(Boolean))];
  const contacts = [...new Set(rows.map(d => d.contact_person).filter(Boolean))];

  clientNameCache.set(companyId, { clients, contacts, at: Date.now() });
  return { clients, contacts };
}

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  // レートリミット: ユーザー単位で1分間に10回まで
  if (!checkRateLimit(`transcribe:${session.userId}`, 10, 60 * 1000)) {
    return rateLimitResponse();
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return Response.json({ error: 'No file' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: 'ファイルサイズが大きすぎます（10MB以下）' }, { status: 400 });
  }

  // 音声ファイルのMIMEタイプ検証（type未設定 or 音声以外は拒否）
  if (file.type && !ALLOWED_AUDIO_TYPES.some(t => file.type.startsWith(t))) {
    return Response.json({ error: '音声ファイルのみアップロード可能です' }, { status: 400 });
  }

  // 過去の取引先名をWhisperプロンプトに含める（固有名詞の認識精度UP）
  // Whisperのpromptは「直前の発話テキスト」として扱われるため、
  // 会話文形式で固有名詞を含めると認識精度が上がる
  const { clients, contacts } = await getClientHints(session.companyId);

  let prompt = '営業メモの音声入力です。';
  if (clients.length > 0) {
    // 固有名詞を会話文に埋め込む（Whisperが文脈として認識しやすい形式）
    const sample = clients.slice(0, 5);
    prompt += sample.map(c => `${c}の案件について。`).join('');
    // 残りの固有名詞も含める
    const rest = clients.slice(5, 30);
    if (rest.length > 0) prompt += `他にも${rest.join('、')}などの取引先があります。`;
  }
  if (contacts.length > 0) {
    prompt += `担当者は${contacts.slice(0, 15).join('、')}。`;
  }

  const finalPrompt = prompt.slice(0, 500);
  console.log('[Whisper] companyId:', session.companyId, 'clients:', clients.length, 'contacts:', contacts.length, 'prompt:', finalPrompt);

  const transcription = await openai.audio.transcriptions.create({
    file,
    model:    'whisper-1',
    language: 'ja',
    prompt:   finalPrompt,
  });

  return Response.json({ text: transcription.text });
}
