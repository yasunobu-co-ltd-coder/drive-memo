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

  // 利用者本人の情報（メールの宛名や自社名として現れるため、除外のヒントとして渡す）
  const selfContext =
    `\n\n【テキストを送信/入力している利用者本人】\n` +
    `- 氏名: ${session.userName}\n` +
    `- 所属: ${session.companyName}\n` +
    `入力テキスト中にこれらの名前（表記ゆれ含む: 姓のみ/名のみ/敬称付き等）が登場しても、` +
    `それは利用者自身を指すので **client_name や contact_person に絶対に使わない**。` +
    `もし入力テキストに本人以外の人名・社名が登場していれば、それが相手（取引先）である可能性が高い。`;

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

- client_name: 会社名・取引先名（「株式会社」「有限会社」等を含む正式名称）。メール/テキストなら**送信元ドメインや署名欄の所属**から推測。自社名ではなく**相手の会社名**を入れること。言及がなければ空文字。
- contact_person: **相手（送信者）の名前**。「様」「さん」は残す。
  - メールの場合、**冒頭の「○○様」は自分（受信者）宛の宛名なので絶対に使わない**。相手の名前は**本文末尾の署名欄、送信者欄（From）、「〜より」**などから抽出する。
  - 例: 冒頭「佐藤様」本文末尾「田中商事 山田太郎」→ contact_personは「山田 様」（宛名の佐藤ではなく、署名の山田）
  - 言及がなければ空文字。
- memo: メモ・案件内容。各要点をマークダウンの箇条書き（「- 」始まり）で簡潔にまとめてください。
  - 音声入力の場合: 口語を体言止めに変換。「見積書を送付します」→「- 見積書の提示」
  - メール/テキストの場合: 本文の要点だけを抽出。引用部分（「>」や「---Original---」以降）、定型の挨拶文、署名欄、免責事項は除外して、実質的な連絡事項のみを箇条書きに。
- due_date: 期日。「明日」「来週月曜」「4月10日」「MM/DD」など日付の言及があればYYYY-MM-DD形式に変換。メールに明示的な期日がない場合や、言及がなければ今日の日付 "${today}" を入れてください。

今日の日付は ${today} です。${selfContext}${knownContext}`,
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
