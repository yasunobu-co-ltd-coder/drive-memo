// 音声テキストを各フィールドに自動解析するユーティリティ
// 「会社名はXXX、担当者はXXX、メモはXXX、期日はXXX」形式に対応

export type ParsedVoice = {
  client_name: string;
  contact_person: string;
  memo: string;
  due_date: string;
};

function parseJapaneseDate(str: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (/今日/.test(str)) return fmt(today);
  if (/明後日/.test(str)) { const d = new Date(today); d.setDate(d.getDate() + 2); return fmt(d); }
  if (/明日/.test(str))   { const d = new Date(today); d.setDate(d.getDate() + 1); return fmt(d); }

  // X月Y日
  const mdMatch = str.match(/(\d+)月(\d+)日/);
  if (mdMatch) {
    const m = parseInt(mdMatch[1]) - 1;
    const day = parseInt(mdMatch[2]);
    let d = new Date(today.getFullYear(), m, day);
    if (d < today) d = new Date(today.getFullYear() + 1, m, day);
    return fmt(d);
  }

  // 来週/今週 + 曜日
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const wMatch = str.match(/(来週|今週)?([月火水木金土日])曜/);
  if (wMatch) {
    const target = weekdays.indexOf(wMatch[2]);
    const cur    = today.getDay();
    let diff     = target - cur;
    if (wMatch[1] === '来週' || diff <= 0) diff += 7;
    const d = new Date(today);
    d.setDate(d.getDate() + diff);
    return fmt(d);
  }

  return '';
}

export function parseVoiceText(text: string): ParsedVoice {
  // テキストを区切り文字で分割してフィールドを抽出
  const result: ParsedVoice = { client_name: '', contact_person: '', memo: '', due_date: '' };

  // 会社名
  const clientM = text.match(/会社名?[はが]([\s\S]+?)(?=担当|メモ|内容|期日|期限|締め切り|$)/);
  if (clientM) result.client_name = clientM[1].replace(/[、。,\.です]$/g, '').trim();

  // 担当者
  const contactM = text.match(/担当者?[はが]([\s\S]+?)(?=会社|メモ|内容|期日|期限|締め切り|$)/);
  if (contactM) result.contact_person = contactM[1].replace(/[、。,\.です]$/g, '').trim();

  // メモ・内容
  const memoM = text.match(/(?:メモ|内容)[はが]([\s\S]+?)(?=会社|担当|期日|期限|締め切り|$)/);
  if (memoM) result.memo = memoM[1].replace(/[。]$/g, '').trim();

  // 期日・期限・締め切り
  const dueM = text.match(/(?:期日|期限|締め切り)[はが]([\s\S]+?)(?=会社|担当|メモ|内容|$)/);
  if (dueM) result.due_date = parseJapaneseDate(dueM[1].trim());

  return result;
}
