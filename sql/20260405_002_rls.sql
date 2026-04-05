-- ============================================================
-- drive v2 — Row Level Security (RLS) ポリシー
-- 作成日: 2026-04-05
-- 概要: 全テーブルで RLS を有効化し、anon key では読み書き不可にする。
--       データへのアクセスは全て Next.js API route (service_role key) 経由。
-- ============================================================

-- ============================================================
-- RLS 有効化
-- ============================================================
ALTER TABLE companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_name_dict    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 既存ポリシーをクリア（再実行時の安全のため）
-- ============================================================
DROP POLICY IF EXISTS "no_anon_companies"            ON companies;
DROP POLICY IF EXISTS "no_anon_device_registrations" ON device_registrations;
DROP POLICY IF EXISTS "no_anon_users"                ON users;
DROP POLICY IF EXISTS "no_anon_deals"                ON deals;
DROP POLICY IF EXISTS "dict_public_read"             ON company_name_dict;

-- ============================================================
-- companies: anon/authenticated どちらも直接アクセス禁止
-- （service_role key を持つ API route のみ操作可）
-- ============================================================
CREATE POLICY "no_anon_companies"
  ON companies
  FOR ALL
  TO anon, authenticated
  USING (false);

-- ============================================================
-- device_registrations: 同上
-- ============================================================
CREATE POLICY "no_anon_device_registrations"
  ON device_registrations
  FOR ALL
  TO anon, authenticated
  USING (false);

-- ============================================================
-- users: 同上
-- ============================================================
CREATE POLICY "no_anon_users"
  ON users
  FOR ALL
  TO anon, authenticated
  USING (false);

-- ============================================================
-- deals: 同上
-- ============================================================
CREATE POLICY "no_anon_deals"
  ON deals
  FOR ALL
  TO anon, authenticated
  USING (false);

-- ============================================================
-- company_name_dict: 読み取りは公開（音声補完）
-- 書き込みは service_role のみ
-- ============================================================
CREATE POLICY "dict_public_read"
  ON company_name_dict
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- 備考
-- ============================================================
-- API route では SUPABASE_SERVICE_ROLE_KEY を使った supabase-server.ts
-- クライアントを使うため、RLS をバイパスして全操作が可能。
-- クライアントサイドの supabase.ts (anon key) は直接 DB 操作には使わない。
