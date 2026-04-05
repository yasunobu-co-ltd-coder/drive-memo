// POST /api/transcribe — 音声ファイルをテキストに変換（OpenAI Whisper）
import { NextRequest } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return Response.json({ error: 'No file' }, { status: 400 });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model:    'whisper-1',
    language: 'ja',
    prompt:   '株式会社、有限会社、合同会社、担当者、案件、見積もり、打ち合わせ、確認、連絡',
  });

  return Response.json({ text: transcription.text });
}
