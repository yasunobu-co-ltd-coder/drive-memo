-- 期日に時間帯を持たせる（時刻指定カレンダー登録対応）
-- 実行: Supabase Dashboard → SQL Editor に貼り付けて Run

ALTER TABLE deals ADD COLUMN IF NOT EXISTS due_start_time TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS due_end_time   TEXT;

-- どちらもHH:MM形式（24時間）。既存レコードはNULLで、カレンダーは8:00-8:30にフォールバックされる
COMMENT ON COLUMN deals.due_start_time IS '期日の開始時刻 HH:MM形式（24h）。NULLなら時刻指定なし。';
COMMENT ON COLUMN deals.due_end_time   IS '期日の終了時刻 HH:MM形式（24h）。NULLなら開始+1時間がカレンダー登録される。';
