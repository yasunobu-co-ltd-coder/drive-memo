-- ============================================================
-- drive v2 — Initial Schema
-- 作成日: 2026-04-05
-- 概要: マルチテナント対応の案件管理DB
--       companies / device_registrations / users / deals
-- ============================================================

-- 拡張機能（Supabase では既定で有効になっている場合が多い）
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. companies（会社マスタ）
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text        NOT NULL UNIQUE,       -- ログイン用会社コード（例: ANSIN001）
  name          text        NOT NULL,              -- 会社表示名
  password_hash text        NOT NULL,              -- bcrypt ハッシュ
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  companies              IS '会社マスタ。company.code でテナントを識別する。';
COMMENT ON COLUMN companies.code         IS '大文字英数字推奨。ログイン画面でユーザーが入力する。';
COMMENT ON COLUMN companies.password_hash IS 'bcryptjs で生成したハッシュ文字列を格納する。';

-- ============================================================
-- 2. device_registrations（登録端末）
-- ============================================================
CREATE TABLE IF NOT EXISTS device_registrations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token    text        NOT NULL UNIQUE,     -- クライアント localStorage に保存するトークン
  company_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  last_user_id    uuid,                            -- 最後にログインしたユーザー（初回選択後にセット）
  registered_at   timestamptz NOT NULL DEFAULT now(),
  last_active_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  device_registrations              IS '端末登録テーブル。device_token でセッションを管理する。';
COMMENT ON COLUMN device_registrations.device_token IS 'サーバー側で gen_random_uuid() 生成。クライアントに返却し localStorage へ保存。';

-- ============================================================
-- 3. users（社内ユーザー）
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS '各会社に紐付く社内ユーザー。PIN認証はなく、端末登録後にユーザーを選ぶだけ。';

CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);

-- ============================================================
-- 4. deals（案件メモ）
-- ============================================================
CREATE TABLE IF NOT EXISTS deals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  company_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by      uuid        NOT NULL REFERENCES users(id)     ON DELETE SET NULL,
  client_name     text        NOT NULL DEFAULT '',  -- 取引先会社名
  contact_person  text        NOT NULL DEFAULT '',  -- 担当者名（v2 新規追加）
  memo            text        NOT NULL DEFAULT '',
  due_date        date,
  importance      text        NOT NULL DEFAULT 'mid'  CHECK (importance IN ('high','mid','low')),
  assignment_type text        NOT NULL DEFAULT '任せる' CHECK (assignment_type IN ('任せる','自分で')),
  assignee        uuid        REFERENCES users(id) ON DELETE SET NULL,
  status          text        NOT NULL DEFAULT '未着手' CHECK (status IN ('未着手','対応中','done')),
  image_url       text
);

COMMENT ON TABLE  deals                IS '案件メモ本体。company_id で会社ごとに完全分離。';
COMMENT ON COLUMN deals.client_name    IS '取引先の会社名。音声入力辞書で補完する対象。';
COMMENT ON COLUMN deals.contact_person IS '担当者名。v1 の assignee フィールドと分けて管理。';
COMMENT ON COLUMN deals.importance     IS 'high=高 / mid=中 / low=低';
COMMENT ON COLUMN deals.status         IS '未着手 / 対応中 / done(完了)';

CREATE INDEX IF NOT EXISTS idx_deals_company   ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_assignee  ON deals(assignee);
CREATE INDEX IF NOT EXISTS idx_deals_status    ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_due_date  ON deals(due_date);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deals_updated_at ON deals;
CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. company_name_dict（音声入力辞書 — 後から投入可）
-- ============================================================
CREATE TABLE IF NOT EXISTS company_name_dict (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text    NOT NULL,          -- 正式会社名（例: 株式会社トヨタ自動車）
  reading      text    NOT NULL,          -- 読み（例: とよたじどうしゃ）
  alias        text[]  DEFAULT '{}',      -- 略称・別表記（例: {トヨタ, TOYOTA}）
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE company_name_dict IS '音声入力の候補サジェスト用辞書。国税庁法人マスタ等から投入する。';

CREATE INDEX IF NOT EXISTS idx_dict_reading ON company_name_dict USING gin(to_tsvector('simple', reading));
CREATE INDEX IF NOT EXISTS idx_dict_name    ON company_name_dict USING gin(to_tsvector('simple', company_name));
