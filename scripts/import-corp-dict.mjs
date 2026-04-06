// corp_names.csv を Supabase の corp_dict テーブルにバッチインポート
// 使い方: node scripts/import-corp-dict.mjs
//
// 環境変数は .env.local から読み込む

import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('環境変数が設定されていません（.env.local を確認）');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const BATCH_SIZE = 3000;
const CSV_PATH = '../corp_names.csv';

async function main() {
  console.log('corp_dict インポート開始...');

  const rl = createInterface({
    input: createReadStream(CSV_PATH, 'utf-8'),
    crlfDelay: Infinity,
  });

  let batch = [];
  let total = 0;
  let errors = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    // 最後のカンマで分割（法人名にカンマが含まれる可能性がある）
    const lastComma = line.lastIndexOf(',');
    if (lastComma === -1) continue;
    const name = line.slice(0, lastComma).trim();
    const furi = line.slice(lastComma + 1).trim();
    if (!name || !furi) continue;

    batch.push({ name, furi });

    if (batch.length >= BATCH_SIZE) {
      const { error } = await db.from('corp_dict').insert(batch);
      if (error) {
        errors++;
        if (errors <= 3) console.error('  insert error:', error.message);
      }
      total += batch.length;
      batch = [];
      if (total % 30000 === 0) {
        console.log(`  ${total.toLocaleString()} 件完了...`);
      }
    }
  }

  // 残り
  if (batch.length > 0) {
    const { error } = await db.from('corp_dict').insert(batch);
    if (error) console.error('  insert error:', error.message);
    total += batch.length;
  }

  console.log(`完了: ${total.toLocaleString()} 件インポート (エラー: ${errors})`);
}

main().catch(console.error);
