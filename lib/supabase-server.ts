import { createClient } from '@supabase/supabase-js';

// サーバーサイド用（service_role key）
// API route 内でのみ使用する。RLS をバイパスして全操作が可能。
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
