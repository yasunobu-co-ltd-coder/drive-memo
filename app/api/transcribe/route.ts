// POST /api/transcribe — 音声ファイルをテキストに変換（OpenAI Whisper）
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return Response.json({ error: 'No file' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: 'ファイルサイズが大きすぎます（10MB以下）' }, { status: 400 });
  }

  const transcription = await openai.audio.transcriptions.create({
    file,
    model:    'whisper-1',
    language: 'ja',
    prompt:   '株式会社、有限会社、合同会社、担当者、案件、見積もり、打ち合わせ、確認、連絡',
  });

  return Response.json({ text: transcription.text });
}
