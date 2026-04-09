// GET  /api/users — ユーザー一覧
// POST /api/users — ユーザー追加
import { NextRequest } from 'next/server';
import { validateRequest, unauthorizedResponse } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const db = createServerClient();
  const { data, error } = await db
    .from('users')
    .select('id, name, sort_order')
    .eq('company_id', session.companyId)
    .order('sort_order', { ascending: true });

  if (error) return Response.json({ error: 'ユーザー一覧の取得に失敗しました' }, { status: 500 });
  return Response.json({ users: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return unauthorizedResponse();

  const { name, sort_order } = await req.json();
  if (!name || typeof name !== 'string') return Response.json({ error: '名前は必須です' }, { status: 400 });
  if (name.length > 50) return Response.json({ error: '名前が長すぎます' }, { status: 400 });

  const db = createServerClient();
  const { data, error } = await db
    .from('users')
    .insert({ company_id: session.companyId, name: name.slice(0, 50), sort_order: sort_order ?? 0 })
    .select('id, name, sort_order')
    .single();

  if (error) return Response.json({ error: 'ユーザーの追加に失敗しました' }, { status: 500 });
  return Response.json({ user: data }, { status: 201 });
}
