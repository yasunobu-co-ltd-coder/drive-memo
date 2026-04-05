'use client';
import { useState } from 'react';
import { VoiceInput } from './VoiceInput';
import { User, Importance, AssignmentType, DealStatus } from '@/lib/types';

const IMP_LABEL: Record<Importance, string> = { high: '高', mid: '中', low: '低' };

type Props = {
  users: User[];
  currentUserId: string;
  deviceToken: string;
  onCreated: () => void;
};

const INITIAL = {
  client_name: '',
  contact_person: '',
  memo: '',
  due_date: '',
  importance: 'mid' as Importance,
  assignment_type: '任せる' as AssignmentType,
  assignee: '',
  status: '未着手' as DealStatus,
};

export function MemoTab({ users, currentUserId, deviceToken, onCreated }: Props) {
  const [form, setForm]       = useState(INITIAL);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  function setField<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.client_name.trim() && !form.memo.trim()) {
      return setError('会社名またはメモを入力してください');
    }
    setSaving(true);
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-token': deviceToken,
        },
        body: JSON.stringify({
          ...form,
          due_date: form.due_date || null,
          assignee: form.assignee || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? '登録に失敗しました');
        return;
      }
      setForm(INITIAL);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      onCreated();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content">
      {error   && <div className="error-msg">{error}</div>}
      {success && (
        <div style={{
          background: '#d1fae5', color: '#065f46',
          padding: '14px 16px', borderRadius: 12, marginBottom: 16,
          fontWeight: 600, fontSize: 16,
        }}>
          ✅ 登録しました
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 会社名 */}
        <div className="form-group">
          <label className="input-label">会社名</label>
          <VoiceInput
            value={form.client_name}
            onChange={v => setField('client_name', v)}
            placeholder="株式会社〇〇"
            withDict
          />
        </div>

        {/* 担当者 */}
        <div className="form-group">
          <label className="input-label">担当者</label>
          <VoiceInput
            value={form.contact_person}
            onChange={v => setField('contact_person', v)}
            placeholder="山田 様"
          />
        </div>

        {/* メモ内容 */}
        <div className="form-group">
          <label className="input-label">メモ</label>
          <div className="voice-row">
            <textarea
              className="input-field"
              value={form.memo}
              onChange={e => setField('memo', e.target.value)}
              placeholder="案件の内容、連絡事項など..."
            />
          </div>
        </div>

        {/* 優先度 */}
        <div className="form-group">
          <label className="input-label">優先度</label>
          <div className="segment-group">
            {(['high', 'mid', 'low'] as Importance[]).map(imp => (
              <button
                key={imp}
                type="button"
                className={`segment-btn ${form.importance === imp ? 'active' : ''}`}
                onClick={() => setField('importance', imp)}
              >
                {IMP_LABEL[imp]}
              </button>
            ))}
          </div>
        </div>

        {/* ステータス */}
        <div className="form-group">
          <label className="input-label">ステータス</label>
          <div className="segment-group">
            {(['未着手', '対応中'] as DealStatus[]).map(s => (
              <button
                key={s}
                type="button"
                className={`segment-btn ${form.status === s ? 'active' : ''}`}
                onClick={() => setField('status', s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* 担当区分 */}
        <div className="form-group">
          <label className="input-label">誰がやる？</label>
          <div className="segment-group">
            {(['任せる', '自分で'] as AssignmentType[]).map(a => (
              <button
                key={a}
                type="button"
                className={`segment-btn ${form.assignment_type === a ? 'active' : ''}`}
                onClick={() => setField('assignment_type', a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* 担当者（ユーザー） */}
        <div className="form-group">
          <label className="input-label">担当 → 誰が</label>
          <select
            className="input-field"
            value={form.assignee}
            onChange={e => setField('assignee', e.target.value)}
          >
            <option value="">未割当</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* 期日 */}
        <div className="form-group">
          <label className="input-label">期日</label>
          <input
            className="input-field"
            type="date"
            value={form.due_date}
            onChange={e => setField('due_date', e.target.value)}
          />
        </div>

        <button className="primary-btn" type="submit" disabled={saving}>
          {saving ? '登録中...' : '登録する'}
        </button>
      </form>
    </div>
  );
}
