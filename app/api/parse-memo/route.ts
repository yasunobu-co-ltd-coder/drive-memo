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
    `- 担当者名（自分）: ${session.userName}\n` +
    `- 会社名（自社）: ${session.companyName}\n` +
    `入力テキスト中にこれらの名前（表記ゆれ含む: 姓のみ/名のみ/敬称付き/法人格の有無等）が登場しても、` +
    `それは利用者自身および自社を指すので **client_name や contact_person に絶対に使わない**。` +
    `\n` +
    `**重要**: client_name は「相手方の会社名」、contact_person は「相手方の担当者名」。` +
    `自社名「${session.companyName}」と相手方の会社名は別物として扱うこと。` +
    `もし入力テキストに本人以外の人名・社名が登場していれば、それが相手（取引先）である可能性が高い。`;

  // 自社名も既知の社名として参照リストに含める（表記ゆれの正規化用）。
  // selfContext で「client_name には使わない」と明示済み。
  const knownClients = [
    session.companyName,
    ...clients.filter(c => c !== session.companyName),
  ];

  let knownContext = '';
  if (knownClients.length > 0) {
    knownContext += `\n\n【登録済み社名一覧（自社含む）】\n${knownClients.join('、')}\n音声テキスト内の会社名がこの一覧と一致または類似する場合、一覧の正式表記をそのまま使ってください。ただし自社「${session.companyName}」は client_name には使わないこと。一覧にない会社名はテキストから新規抽出してください。`;
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

- client_name: **相手方の会社名（取引先）**。「株式会社」「有限会社」等を含む正式名称。メール/テキストなら**送信元ドメインや署名欄の所属**から推測。利用者の自社名ではなく**相手方の会社名のみ**を入れること。言及がなければ空文字。
  - **重要**: 値には「相手方の」「取引先の」「先方の」「お客様の」などのラベル/役割語を**絶対に含めない**。「相手方の岡山マティップ」と発話されても client_name は **"岡山マティップ"**。
- contact_person: **相手方の担当者名（送信者）**。「様」「さん」は残す。
  - 同様に「相手方の」「取引先の」「先方の」「お客様の」などのラベル/役割語は値に含めない。「相手方の山田さん」→ contact_person は **"山田 様"**。
  - メールの場合、**冒頭の「○○様」は自分（受信者）宛の宛名なので絶対に使わない**。相手の名前は**本文末尾の署名欄、送信者欄（From）、「〜より」**などから抽出する。
  - 例: 冒頭「佐藤様」本文末尾「田中商事 山田太郎」→ contact_personは「山田 様」（宛名の佐藤ではなく、署名の山田）
  - 言及がなければ空文字。
- memo: メモ・案件内容。各要点をマークダウンの箇条書き（「- 」始まり）で簡潔にまとめてください。
  - 音声入力の場合: 口語を体言止めに変換。「見積書を送付します」→「- 見積書の提示」
  - メール/テキストの場合: 本文の要点だけを抽出。引用部分（「>」や「---Original---」以降）、定型の挨拶文、署名欄、免責事項は除外して、実質的な連絡事項のみを箇条書きに。
- due_date: 期日。「明日」「来週月曜」「4月10日」「MM/DD」など日付の言及があればYYYY-MM-DD形式に変換。メールに明示的な期日がない場合や、言及がなければ今日の日付 "${today}" を入れてください。
- due_start_time: 開始時刻。「HH:MM」形式（24時間、2桁0埋め）。
  - 「14時」「14:00」「午後2時」→ "14:00"
  - 「朝10時」→ "10:00"、「夜7時」→ "19:00"
  - 「13時から」「14時〜」のように開始だけ言及されたらその時刻
  - 時刻の明示がなければ空文字 ""
- due_end_time: 終了時刻。「HH:MM」形式（24時間、2桁0埋め）。
  - 「〜16時まで」「14時〜16時」→ "16:00"
  - 「1時間」「30分」など所要時間だけ指定の場合はdue_start_timeにその時間を加算した値を入れる
  - 終了の言及がなければ空文字 ""（カレンダー登録時は開始+1時間が自動設定される）

今日の日付は ${today} です。${selfContext}${knownContext}`,
      },
      { role: 'user', content: text },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  try {
    const parsed = JSON.parse(raw);
    // 時刻は形式が正しい場合のみ返す
    const st = typeof parsed.due_start_time === 'string' && TIME_RE.test(parsed.due_start_time) ? parsed.due_start_time : '';
    const et = typeof parsed.due_end_time   === 'string' && TIME_RE.test(parsed.due_end_time)   ? parsed.due_end_time   : '';
    return Response.json({
      client_name: parsed.client_name ?? '',
      contact_person: parsed.contact_person ?? '',
      memo: parsed.memo ?? '',
      due_date: parsed.due_date ?? today,
      due_start_time: st,
      due_end_time: et,
    });
  } catch {
    return Response.json({ error: 'AI parse failed' }, { status: 500 });
  }
}
