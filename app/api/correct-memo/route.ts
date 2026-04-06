// POST /api/correct-memo
// 現在のフォーム内容 + 音声修正指示 → AIが変更箇所を判断して返す
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const { current, instruction } = await req.json();

  if (!instruction || typeof instruction !== 'string') {
    return Response.json({ error: 'instruction is required' }, { status: 400 });
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

現在のフォーム内容:
- 会社名: "${current?.client_name ?? ''}"
- 担当者: "${current?.contact_person ?? ''}"
- メモ: "${current?.memo ?? ''}"
- 期日: "${current?.due_date ?? ''}"

今日の日付は ${today} です。

## ルール
- 修正指示に該当するフィールドだけを返してください
- 変更しないフィールドは含めないでください
- 「〜じゃなくて〜」「〜に変えて」「〜を修正」などの表現を解釈してください
- 「追記して」「追加して」はメモの末尾に追加してください
- 「期日は来週の金曜」など相対日付はYYYY-MM-DD形式に変換してください

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

## 会社名の言い直し
ユーザーが会社名を丸ごと言い直す場合があります:
- 「会社名は岡山マティップ株式会社です」→ client_name を差し替え
- 「岡山の会社です、岡山マティップです」→ client_name を「岡山マティップ」に
- 「株式会社〇〇です」→ client_name を差し替え
- 会社名っぽい固有名詞がそのまま言われたら client_name の修正と判断する

## 出力形式
変更するフィールドだけを含むJSONオブジェクト:
{
  "client_name": "新しい会社名",     // 変更する場合のみ
  "contact_person": "新しい担当者",   // 変更する場合のみ
  "memo": "新しいメモ",              // 変更する場合のみ
  "due_date": "2026-04-11"           // 変更する場合のみ
}
変更がない場合は空オブジェクト {} を返してください。`,
      },
      { role: 'user', content: instruction },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  try {
    const changes = JSON.parse(raw);
    return Response.json({ changes });
  } catch {
    return Response.json({ changes: {} });
  }
}
