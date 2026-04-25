// POST /api/correct-memo
// 現在のフォーム内容 + 音声修正指示 → AIが変更箇所を判断して返す
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import OpenAI from 'openai';

// Vercel Proで30秒まで拡張（LLM応答の揺らぎ対策）
export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  // レートリミット: ユーザー単位で1分間に20回まで
  if (!checkRateLimit(`correct:${session.userId}`, 20, 60 * 1000)) {
    return rateLimitResponse();
  }

  const { current, instruction } = await req.json();

  if (!instruction || typeof instruction !== 'string') {
    return Response.json({ error: 'instruction is required' }, { status: 400 });
  }
  if (instruction.length > 1000) {
    return Response.json({ error: '指示が長すぎます' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `あなたは音声メモアプリの修正アシスタントです。
ユーザーの修正指示を解釈して、フォームのどのフィールドをどう変更すべきか判断してください。

【利用者本人の情報】
- 担当者名（自分）: ${session.userName}
- 会社名（自社）: ${session.companyName}

利用者本人を指す名前・自社名が修正指示に出てきても、client_name / contact_person には**絶対に入れない**。
client_name は「相手方の会社名」、contact_person は「相手方の担当者名」。自社名「${session.companyName}」とは別物。

現在のフォーム内容（client_name は相手方の会社名、contact_person は相手方の担当者名）:
- 相手方の会社名: "${current?.client_name ?? ''}"
- 相手方の担当者: "${current?.contact_person ?? ''}"
- メモ: "${current?.memo ?? ''}"
- 期日: "${current?.due_date ?? ''}"
- 開始時刻: "${current?.due_start_time ?? ''}"
- 終了時刻: "${current?.due_end_time ?? ''}"

今日の日付は ${today} です。

## ルール
- 修正指示に該当するフィールドだけを返してください
- 変更しないフィールドは含めないでください
- 「〜じゃなくて〜」「〜に変えて」「〜を修正」などの表現を解釈してください
- 「追記して」「追加して」はメモの末尾に追加してください
- 「期日は来週の金曜」など相対日付はYYYY-MM-DD形式に変換してください
- 時刻の指示（「14時から」「午後3時まで」「14時〜16時」）は due_start_time / due_end_time をHH:MM（24時間）形式で返してください。時刻を消したい場合は空文字 "" を返してください

## 漢字の修正
ユーザーは漢字の間違いを口頭で説明します。以下のようなパターンを理解してください:
- 「木材の木です」→ 現在のフィールドで最も近い文字を「木」に置き換え
- 「城じゃなくて木」→「城」を「木」に変更
- 「赤い色の赤です」→「赤」の字を使う
- 「さいとうの斉は斉藤の斉」→ 正しい「斉」を使う
- 「わたなべは渡辺の辺」→ 正しい「辺」の字を使う
- 「たかはしの高ははしごだか」→「髙」を使う
- 部首や熟語で説明する場合：「さんずいの〜」「にんべんの〜」「お城の城」なども解釈する
- どのフィールドの漢字かは、文脈と現在のフォーム内容から推測する
  例：担当者が「赤城」なのに「木材の木です」→ 担当者を「赤木」に修正

## 相手方の会社名の言い直し
ユーザーが相手方の会社名を丸ごと言い直す場合があります:
- 「会社名は岡山マティップ株式会社です」→ client_name を差し替え
- 「岡山の会社です、岡山マティップです」→ client_name を「岡山マティップ」に
- 「株式会社〇〇です」→ client_name を差し替え
- 会社名っぽい固有名詞がそのまま言われたら client_name の修正と判断する
- ただし自社名「${session.companyName}」が言われた場合は client_name に入れない（自社言及と判断）

## ラベル語の除去（重要）
client_name / contact_person の値には、以下のような「ラベル」「役割語」を**絶対に含めない**:
- 「相手方の」「取引先の」「先方の」「お客様の」「客先の」など
例:
- 「相手方の会社は岡山マティップ」→ client_name = "岡山マティップ"（× "相手方の岡山マティップ"）
- 「先方の担当者は山田さん」→ contact_person = "山田 様"（× "先方の山田 様"）

## 出力形式
変更するフィールドだけを含むJSONオブジェクト:
{
  "client_name": "新しい会社名",       // 変更する場合のみ
  "contact_person": "新しい担当者",    // 変更する場合のみ
  "memo": "新しいメモ",                // 変更する場合のみ
  "due_date": "YYYY-MM-DD",             // 変更する場合のみ
  "due_start_time": "HH:MM",            // 変更する場合のみ（空にする場合は ""）
  "due_end_time": "HH:MM"               // 変更する場合のみ（空にする場合は ""）
}
変更がない場合は空オブジェクト {} を返してください。`,
      },
      { role: 'user', content: instruction },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  try {
    const parsed = JSON.parse(raw);
    // AIが返したフィールドだけを安全な型に絞ってサニタイズ
    const changes: Record<string, string> = {};
    const strKey = (k: string) => {
      if (typeof parsed[k] === 'string') changes[k] = parsed[k];
    };
    strKey('client_name');
    strKey('contact_person');
    strKey('memo');
    // 日付は YYYY-MM-DD または空文字のみ許可
    if (typeof parsed.due_date === 'string' && (parsed.due_date === '' || DATE_RE.test(parsed.due_date))) {
      changes.due_date = parsed.due_date;
    }
    // 時刻は HH:MM または空文字のみ許可（空文字=消去指示）
    for (const k of ['due_start_time', 'due_end_time']) {
      const v = parsed[k];
      if (typeof v === 'string' && (v === '' || TIME_RE.test(v))) changes[k] = v;
    }
    return Response.json({ changes });
  } catch {
    return Response.json({ changes: {} });
  }
}
