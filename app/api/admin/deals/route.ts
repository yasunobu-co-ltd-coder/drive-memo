// GET /api/admin/deals — 全案件取得（管理者用）
import { NextRequest } from 'next/server';
import { validateAdminRequest, adminUnauthorized } from '@/lib/admin-auth';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  if (!validateAdminRequest(req)) return adminUnauthorized();

  const db = createServerClient();
  const companyId = req.nextUrl.searchParams.get('company_id');

  let query = db
    .from('deals')
    .select('id, created_at, company_id, created_by, client_name, contact_person, memo, due_date, importance, status, google_event_id')
    .order('created_at', { ascending: false })
    .limit(500);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: 'データ取得に失敗しました' }, { status: 500 });
  return Response.json({ deals: data ?? [] });
}
