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
- 担当者名の漢字修正も対応してください

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
