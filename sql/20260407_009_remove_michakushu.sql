-- 未着手ステータスを廃止し、対応中とdoneの2種類のみに変更
-- 既存の未着手レコードは対応中に更新

-- 1. 既存データを更新
UPDATE deals SET status = '対応中' WHERE status = '未着手';

-- 2. CHECK制約を更新
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_status_check;
ALTER TABLE deals ADD CONSTRAINT deals_status_check CHECK (status IN ('対応中', 'done'));

-- 3. デフォルト値を変更
ALTER TABLE deals ALTER COLUMN status SET DEFAULT '対応中';
