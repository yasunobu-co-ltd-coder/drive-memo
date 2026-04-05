import { createClient } from '@supabase/supabase-js';

// クライアントサイド用（anon key）
// 直接DBアクセスはせず、API route 経由でのみ使用する
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnon);
