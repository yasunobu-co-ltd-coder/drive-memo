'use client';
import { useState } from 'react';
import { Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { Deal, User, DealStatus } from '@/lib/types';

const STATUS_TAG: Record<DealStatus, string> = {
  '対応中': 'tag tag-ongoing',
  'done':   'tag tag-done',
};

function fmtDate(d: string | null) {
  if (!d) return null;
  const [, m, day] = d.split('-');
  return `${m}/${day}`;
}

type Props = {
  deal: Deal;
  users: User[];
  deviceToken: string;
  onUpdated: (deal: Deal) => void;
  onDeleted: (id: string) => void;
};

export function DealCard({ deal, users, deviceToken, onUpdated, onDeleted }: Props) {
  const [expanded, setExpanded]   = useState(false);
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // 編集フォームの値
  const [form, setForm] = useState({
    client_name:     deal.client_name,
    contact_person:  deal.contact_person,
    memo:            deal.memo,
    due_date:        deal.due_date ?? '',
    assignment_type: deal.assignment_type,
    assignee:        deal.assignee ?? '',
    status:          deal.status,
  });

  function setField<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PATCH',
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
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      onUpdated(data.deal);
      setEditing(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'DELETE',
      headers: { 'x-device-token': deviceToken },
    });
    if (res.ok) onDeleted(deal.id);
  }

  // ステータスだけの素早い変更（展開なしで）
  async function quickStatus(status: DealStatus) {
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-device-token': deviceToken,
      },
      body: JSON.stringify({ ...deal, due_date: deal.due_date || null, assignee: deal.assignee || null, status }),
    });
    const data = await res.json();
    if (res.ok) onUpdated(data.deal);
  }

  const due = fmtDate(deal.due_date);

  return (
    <div className="deal-card">
      {/* ヘッダー行 */}
      <div onClick={() => setExpanded(v => !v)} style={{ cursor: 'pointer' }}>
        {due && <span className="due-badge">{due}</span>}
        <div className="deal-client" style={{ paddingRight: due ? 80 : 0 }}>
          {deal.client_name || '（会社名なし）'}
        </div>
        {deal.contact_person && (
          <div className="deal-contact">👤 {deal.contact_person}</div>
        )}
        <div className="deal-memo" style={{ marginBottom: 8 }}>
          {deal.memo}
        </div>
        <div className="indicators">
          <span className={STATUS_TAG[deal.status]}>
            {deal.status === 'done' ? '完了' : deal.status}
          </span>
          {deal.assignee_user && (
            <span className="tag" style={{ background: '#f0fdf4', color: '#166534' }}>
              → {deal.assignee_user.name}
            </span>
          )}
          {expanded
            ? <ChevronUp size={16} style={{ marginLeft: 'auto', color: '#94a3b8' }} />
            : <ChevronDown size={16} style={{ marginLeft: 'auto', color: '#94a3b8' }} />
          }
        </div>
      </div>

      {/* 展開エリア */}
      {expanded && !editing && (
        <div style={{ marginTop: 16 }}>
          <div className="assignee-row">
            <span>登録: {deal.created_user?.name ?? '—'}</span>
            <span style={{ fontSize: 12 }}>
              {new Date(deal.created_at).toLocaleDateString('ja-JP')}
            </span>
          </div>
          {/* ステータス素早き変更 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {(['対応中', 'done'] as DealStatus[]).map(s => (
              <button
                key={s}
                onClick={() => quickStatus(s)}
                style={{
                  padding: '9px 16px',
                  borderRadius: 10,
                  border: `2px solid ${deal.status === s ? '#2563eb' : '#e2e8f0'}`,
                  background: deal.status === s ? '#eff6ff' : '#fff',
                  color: deal.status === s ? '#2563eb' : '#64748b',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {deal.status === s && <Check size={14} />}
                {s === 'done' ? '完了' : s}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button
              className="primary-btn"
              style={{ padding: '14px', fontSize: 16 }}
              onClick={() => setEditing(true)}
            >
              編集
            </button>
            {confirmDel ? (
              <button
                className="primary-btn danger-btn"
                style={{ padding: '14px', fontSize: 16 }}
                onClick={handleDelete}
              >
                本当に削除
              </button>
            ) : (
              <button
                style={{
                  padding: '14px 18px',
                  borderRadius: 14,
                  border: '1.5px solid #e2e8f0',
                  background: '#fff',
                  color: '#ef4444',
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: 'pointer',
                }}
                onClick={() => setConfirmDel(true)}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 編集フォーム */}
      {expanded && editing && (
        <div style={{ marginTop: 16 }}>
          <div className="form-group">
            <label className="input-label">会社名</label>
            <input
              className="input-field"
              value={form.client_name}
              onChange={e => setField('client_name', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="input-label">担当者</label>
            <input
              className="input-field"
              value={form.contact_person}
              onChange={e => setField('contact_person', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="input-label">メモ</label>
            <textarea
              className="input-field"
              value={form.memo}
              onChange={e => setField('memo', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="input-label">期日</label>
            <input
              className="input-field"
              type="date"
              value={form.due_date}
              onChange={e => setField('due_date', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="input-label">ステータス</label>
            <div className="segment-group">
              {(['対応中', 'done'] as DealStatus[]).map(s => (
                <button
                  key={s}
                  type="button"
                  className={`segment-btn ${form.status === s ? 'active' : ''}`}
                  onClick={() => setField('status', s)}
                >
                  {s === 'done' ? '完了' : s}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="input-label">担当 → 誰が？</label>
            <div className="segment-group">
              <button
                type="button"
                className={`segment-btn ${form.assignment_type === '任せる' ? 'active' : ''}`}
                onClick={() => setField('assignment_type', '任せる')}
              >任せる</button>
              <button
                type="button"
                className={`segment-btn ${form.assignment_type === '自分で' ? 'active' : ''}`}
                onClick={() => setField('assignment_type', '自分で')}
              >自分で</button>
            </div>
          </div>
          <div className="form-group">
            <label className="input-label">担当者</label>
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
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="primary-btn"
              onClick={handleSave}
              disabled={saving}
              style={{ fontSize: 16, padding: '14px' }}
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => { setEditing(false); setForm({
                client_name: deal.client_name,
                contact_person: deal.contact_person,
                memo: deal.memo,
                due_date: deal.due_date ?? '',
                assignment_type: deal.assignment_type,
                assignee: deal.assignee ?? '',
                status: deal.status,
              }); }}
              style={{
                padding: '14px 18px',
                borderRadius: 14,
                border: '1.5px solid #e2e8f0',
                background: '#fff',
                color: '#64748b',
                fontWeight: 600,
                fontSize: 16,
                cursor: 'pointer',
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
