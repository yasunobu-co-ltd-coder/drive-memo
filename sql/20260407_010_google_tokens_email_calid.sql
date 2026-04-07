-- google_tokensにemail（連携アカウント表示用）とcalendar_id（専用カレンダー）を追加
ALTER TABLE google_tokens ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE google_tokens ADD COLUMN IF NOT EXISTS calendar_id TEXT NOT NULL DEFAULT 'primary';
