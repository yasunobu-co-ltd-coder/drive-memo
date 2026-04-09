// GET  /api/admin/companies/[id]/users — ユーザー一覧
// POST /api/admin/companies/[id]/users — ユーザー追加
import { NextRequest } from 'next/server';
import { validateAdminRequest, adminUnauthorized } from '@/lib/admin-auth';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminRequest(req)) return adminUnauthorized();

  const { id } = await params;
  const db = createServerClient();

  const { data, error } = await db
    .from('users')
    .select('id, name, sort_order')
    .eq('company_id', id)
    .order('sort_order', { ascending: true });

  if (error) return Response.json({ error: '操作に失敗しました' }, { status: 500 });
  return Response.json({ users: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminRequest(req)) return adminUnauthorized();

  const { id } = await params;
  const { name } = await req.json();
  if (!name) return Response.json({ error: '名前は必須です' }, { status: 400 });

  const db = createServerClient();

  // 現在の最大 sort_order を取得
  const { data: existing } = await db
    .from('users')
    .select('sort_order')
    .eq('company_id', id)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await db
    .from('users')
    .insert({ company_id: id, name, sort_order: nextOrder })
    .select('id, name, sort_order')
    .single();

  if (error) return Response.json({ error: '操作に失敗しました' }, { status: 500 });
  return Response.json({ user: data }, { status: 201 });
}
