import { createClient, SupabaseClient } from '@supabase/supabase-js';

// サーバーサイド用（service_role key）
// API route 内でのみ使用する。RLS をバイパスして全操作が可能。
// シングルトンで使い回す（ステートレスなので安全）
let _client: SupabaseClient | null = null;

export function createServerClient() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return _client;
}
