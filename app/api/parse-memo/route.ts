// POST /api/parse-memo
// 音声テキストをAIで解析し、会社名・担当者・メモ・期日に分類する
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const { text } = await req.json();
  if (!text || typeof text !== 'string') {
    return Response.json({ error: 'text is required' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `あなたは営業担当者の音声メモを構造化するアシスタントです。
音声入力されたテキストから以下のフィールドを抽出してJSON形式で返してください。

- client_name: 会社名・取引先名（「株式会社」「有限会社」等を含む正式名称）。言及がなければ空文字。
- contact_person: 担当者名・相手の名前（「様」「さん」は残す）。言及がなければ空文字。
- memo: メモ・案件内容。原文の意味を保ちつつ、読みやすく簡潔に整えてください。句読点や改行を適切に補い、口語的な部分は自然な書き言葉にしてください。ただし大幅な書き換えはせず、原文に忠実な加筆に留めてください。
- due_date: 期日。「明日」「来週月曜」「4月10日」など日付の言及があればYYYY-MM-DD形式に変換。言及がなければ今日の日付 "${today}" を入れてください。

今日の日付は ${today} です。`,
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
