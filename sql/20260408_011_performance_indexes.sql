-- パフォーマンス改善用インデックス + FK追加

-- deals: created_by でのフィルタ高速化（GET /api/deals の or フィルタ）
CREATE INDEX IF NOT EXISTS idx_deals_created_by ON deals(created_by);

-- deals: company_id + status の複合インデックス（フィルタ + ソート最適化）
CREATE INDEX IF NOT EXISTS idx_deals_company_status ON deals(company_id, status);

-- deals: company_id + created_by の複合インデックス
CREATE INDEX IF NOT EXISTS idx_deals_company_created_by ON deals(company_id, created_by);

-- device_registrations: last_user_id に FK制約追加（JOINを有効化）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'device_registrations_last_user_id_fkey'
  ) THEN
    ALTER TABLE device_registrations
      ADD CONSTRAINT device_registrations_last_user_id_fkey
      FOREIGN KEY (last_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
