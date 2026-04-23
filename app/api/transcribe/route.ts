// POST /api/transcribe — 音声ファイルをテキストに変換
// 優先: Groq (Whisper Large v3 Turbo) → 失敗時: OpenAI (whisper-1)
// 過去の取引先名をプロンプトに含めて固有名詞の精度を上げる
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import OpenAI from 'openai';

// Vercel Pro: 関数実行時間を60秒まで拡張（Hobbyでは無視される）
// これにより15〜20分の音声でもWhisperがタイムアウトせずに処理できる
export const maxDuration = 60;

// Groq（OpenAI互換API）— 最新のWhisper Large v3、高速・安価・高精度
// GROQ_API_KEYが未設定なら常にOpenAIを使用
const groq = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey:  process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  : null;

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

  const rows = (data ?? []) as { client_name: string | null; contact_person: string | null }[];
  const clients = [...new Set(rows.map(d => d.client_name).filter((v): v is string => !!v))];
  const contacts = [...new Set(rows.map(d => d.contact_person).filter((v): v is string => !!v))];

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

  // Groq → OpenAI のフォールバック
  // Groq側のレート超過(429) / サーバーエラー(5xx) / ネットワークエラーでOpenAIに切り替え
  // 4xxクライアントエラー(不正ファイル等)は切り替えても同じなのでそのまま返す
  const text = await transcribeWithFallback(file, prompt);
  return Response.json({ text });
}

async function transcribeWithFallback(file: File, prompt: string): Promise<string> {
  // Groqのprompt上限は224トークン(OpenAIより厳しい)なので短めに
  const groqPrompt   = prompt.slice(0, 200);
  const openaiPrompt = prompt.slice(0, 500);

  if (groq) {
    try {
      const res = await groq.audio.transcriptions.create({
        file,
        model:    'whisper-large-v3-turbo',
        language: 'ja',
        prompt:   groqPrompt,
      });
      return res.text ?? '';
    } catch (err: unknown) {
      if (!shouldFallback(err)) throw err;
      console.warn('[transcribe] Groq failed, falling back to OpenAI:', getErrStatus(err));
    }
  }

  const res = await openai.audio.transcriptions.create({
    file,
    model:    'whisper-1',
    language: 'ja',
    prompt:   openaiPrompt,
  });
  return res.text ?? '';
}

function getErrStatus(err: unknown): number {
  const e = err as { status?: number };
  return e?.status ?? 0;
}

function shouldFallback(err: unknown): boolean {
  const status = getErrStatus(err);
  // レート超過・サーバー障害・ネットワーク(statusなし)はフォールバック対象
  // 401/403は設定ミスなのでフォールバックで救うべき(キーがおかしいだけかも)
  if (status === 0)                     return true;   // ネットワーク/SDKレベルのエラー
  if (status === 429)                   return true;   // レート超過
  if (status >= 500)                    return true;   // Groq側の障害
  if (status === 401 || status === 403) return true;   // 認証エラーもOpenAIに逃がす
  return false;
}
