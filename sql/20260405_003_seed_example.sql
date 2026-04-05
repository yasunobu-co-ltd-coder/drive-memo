-- ============================================================
-- drive v2 — Seed Example（初期データ投入例）
-- 作成日: 2026-04-05
-- 概要: 最初の会社・ユーザーを登録する手順のサンプル。
--       本番では /api/admin/create-company エンドポイントを使う方が楽。
-- ============================================================

-- ============================================================
-- !! 注意 !!
-- password_hash は bcryptjs で生成したハッシュを入れること。
--
-- Node.js での生成例:
--   import bcrypt from 'bcryptjs';
--   const hash = await bcrypt.hash('your_password', 10);
--   console.log(hash);
--
-- 以下の '$2a$10$...' はプレースホルダー。実際のハッシュに差し替えること。
-- ============================================================

-- 1. 会社登録
INSERT INTO companies (code, name, password_hash) VALUES
  ('ANSIN001', '安信工業株式会社', '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH_HERE_________________________________________');

-- 2. ユーザー登録（会社に紐付け）
-- company_id は上で INSERT した companies.id を参照
INSERT INTO users (company_id, name, sort_order)
SELECT id, '松田',  1 FROM companies WHERE code = 'ANSIN001'
UNION ALL
SELECT id, '山田',  2 FROM companies WHERE code = 'ANSIN001'
UNION ALL
SELECT id, '田中',  3 FROM companies WHERE code = 'ANSIN001';

-- ============================================================
-- 動作確認クエリ
-- ============================================================
-- SELECT * FROM companies;
-- SELECT u.name, c.code FROM users u JOIN companies c ON c.id = u.company_id;
