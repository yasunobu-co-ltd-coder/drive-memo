// POST /api/parse-memo
// 音声テキストをAIで解析し、会社名・担当者・メモ・期日に分類する
// 過去の取引先名を参照し、既知の会社名があればそれを優先する
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import OpenAI from 'openai';

// Vercel Proで30秒まで拡張（LLM応答の揺らぎ対策）
export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 会社ごとのキャッシュ
type KnownNames = { clients: string[]; contacts: string[]; at: number };
const nameCache = new Map<string, KnownNames>();
const CACHE_TTL = 5 * 60 * 1000;

async function getKnownNames(companyId: string): Promise<{ clients: string[]; contacts: string[] }> {
  const cached = nameCache.get(companyId);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return { clients: cached.clients, contacts: cached.contacts };
  }

  const db = createServerClient();
  const { data } = await db
    .from('deals')
    .select('client_name, contact_person')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (data ?? []) as { client_name: string | null; contact_person: string | null }[];
  const clients = [...new Set(rows.map(d => d.client_name).filter((v): v is string => !!v))];
  const contacts = [...new Set(rows.map(d => d.contact_person).filter((v): v is string => !!v))];

  nameCache.set(companyId, { clients, contacts, at: Date.now() });
  return { clients, contacts };
}

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  // レートリミット: ユーザー単位で1分間に10回まで
  if (!checkRateLimit(`parse:${session.userId}`, 10, 60 * 1000)) {
    return rateLimitResponse();
  }

  const { text } = await req.json();
  if (!text || typeof text !== 'string') {
    return Response.json({ error: 'text is required' }, { status: 400 });
  }
  // 長尺録音（〜60分チャンク分割）を想定して20000字まで許容
  if (text.length > 20000) {
    return Response.json({ error: 'テキストが長すぎます（20000文字以下）' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // 過去の取引先名・担当者名を取得
  const { clients, contacts } = await getKnownNames(session.companyId);

  let knownContext = '';
  if (clients.length > 0) {
    knownContext += `\n\n【登録済み取引先一覧】\n${clients.join('、')}\n音声テキスト内の会社名がこの一覧と一致または類似する場合、一覧の正式名称をそのまま使ってください。一致しない場合は音声テキストから新しい会社名として抽出してください。`;
  }
  if (contacts.length > 0) {
    knownContext += `\n\n【登録済み担当者一覧】\n${contacts.join('、')}\n音声テキスト内の人名がこの一覧と一致または類似する場合、一覧の表記をそのまま使ってください。`;
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `あなたは営業担当者のメモを構造化するアシスタントです。
入力テキストは「音声メモ」または「メール本文・業務チャット等の貼り付けテキスト」のいずれかです。どちらの場合も以下のフィールドを抽出してJSON形式で返してください。

- client_name: 会社名・取引先名（「株式会社」「有限会社」等を含む正式名称）。メールなら送信元ドメインや署名欄からも推測可。言及がなければ空文字。
- contact_person: 担当者名・相手の名前（「様」「さん」は残す）。メールなら送信者名・署名・本文の「○○様」宛名から抽出。言及がなければ空文字。
- memo: メモ・案件内容。各要点をマークダウンの箇条書き（「- 」始まり）で簡潔にまとめてください。
  - 音声入力の場合: 口語を体言止めに変換。「見積書を送付します」→「- 見積書の提示」
  - メール/テキストの場合: 本文の要点だけを抽出。引用部分（「>」や「---Original---」以降）、定型の挨拶文、署名欄、免責事項は除外して、実質的な連絡事項のみを箇条書きに。
- due_date: 期日。「明日」「来週月曜」「4月10日」「MM/DD」など日付の言及があればYYYY-MM-DD形式に変換。メールに明示的な期日がない場合や、言及がなければ今日の日付 "${today}" を入れてください。

今日の日付は ${today} です。${knownContext}`,
      },
      { role: 'user', content: text },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(raw);
    return Response.json({
      client_name: parsed.client_name ?? '',
      contact_person: parsed.contact_person ?? '',
      memo: parsed.memo ?? '',
      due_date: parsed.due_date ?? today,
    });
  } catch {
    return Response.json({ error: 'AI parse failed' }, { status: 500 });
  }
}
