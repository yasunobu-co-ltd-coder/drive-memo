-- ============================================================
-- drive v2 — Seed Example（デモ初期データ）
-- 作成日: 2026-04-05
-- 概要: 安信工業デモ用の会社・ユーザーを登録する
-- パスワード方式: Node.js crypto (scrypt)  salt:hash 形式
-- ============================================================

-- 1. 会社登録
INSERT INTO companies (code, name, password_hash) VALUES
  (
    'ANSIN001',
    '安信工業株式会社',
    '07e3e91a1c6034e076aad91edd6c7304:4f9f6e0a8084d6b3fef8a652d532598d546136caaab1b173a4e7362d8d26e107cf4332cd188db8baca2ad446f6026e86dd103f50e0f532ce7b4b27f6c12f13e2'
  );

-- 2. ユーザー登録
INSERT INTO users (company_id, name, sort_order)
SELECT id, '松田', 1 FROM companies WHERE code = 'ANSIN001'
UNION ALL
SELECT id, '山田', 2 FROM companies WHERE code = 'ANSIN001'
UNION ALL
SELECT id, '田中', 3 FROM companies WHERE code = 'ANSIN001';

-- ============================================================
-- 動作確認クエリ
-- ============================================================
-- SELECT * FROM companies;
-- SELECT u.name, c.code FROM users u JOIN companies c ON c.id = u.company_id;
