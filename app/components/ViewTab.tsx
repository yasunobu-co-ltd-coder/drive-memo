'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RefreshCw, Pencil, Check, Undo2, Trash2, X, Search, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { Deal } from '@/lib/types';

type Filter = 'active' | 'done';
type SortKey = 'due' | 'new' | 'old';

type Props = {
  deviceToken: string;
  refreshSignal: number;
  onSwitchUser: () => void;
  currentUserName: string;
};

function fmtDate(d: string | null) {
  if (!d) return null;
  const [, m, day] = d.split('-');
  return `${m}/${day}`;
}

export function ViewTab({ deviceToken, refreshSignal, onSwitchUser, currentUserName }: Props) {
  const [deals, setDeals]       = useState<Deal[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<Filter>('active');
  const [expanded, setExpanded] = useState<string | null>(null);
  const pullStartY              = useRef(0);
  const [pulling, setPulling]   = useState(false);
  const [editing, setEditing]   = useState<Deal | null>(null);
  const [editForm, setEditForm] = useState({
    client_name: '', contact_person: '', memo: '',
    due_date: '', due_start_time: '', due_end_time: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState('');
  const [search, setSearch]     = useState('');
  const [sort, setSort]         = useState<SortKey>('due');
  const listRef = useRef<HTMLDivElement>(null);
  const editMemoRef = useRef<HTMLTextAreaElement>(null);

  // 編集モーダルのメモ欄を内容に応じて自動拡張
  useLayoutEffect(() => {
    const el = editMemoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editForm.memo, editing]);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/deals', { headers: { 'x-device-token': deviceToken } });
      if (!res.ok) return;
      const { deals: data } = await res.json();
      setDeals(data ?? []);
    } finally { setLoading(false); }
  }, [deviceToken]);

  useEffect(() => { fetchDeals(); }, [fetchDeals, refreshSignal]);

  function onTouchStart(e: React.TouchEvent) { pullStartY.current = e.touches[0].clientY; }
  function onTouchEnd(e: React.TouchEvent) {
    const el = listRef.current;
    if (el && el.scrollTop > 0) return; // スクロール途中では発動しない
    if (e.changedTouches[0].clientY - pullStartY.current > 60 && !loading) {
      setPulling(true);
      fetchDeals().finally(() => setPulling(false));
    }
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/deals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { const { deal: u } = await res.json(); setDeals(ds => ds.map(d => d.id === id ? u : d)); setExpanded(null); }
  }

  async function deleteDeal(id: string) {
    if (!confirm('削除しますか？')) return;
    const res = await fetch(`/api/deals/${id}`, { method: 'DELETE', headers: { 'x-device-token': deviceToken } });
    if (res.ok) setDeals(ds => ds.filter(d => d.id !== id));
  }

  function startEdit(deal: Deal) {
    setEditing(deal);
    setEditForm({
      client_name:    deal.client_name ?? '',
      contact_person: deal.contact_person ?? '',
      memo:           deal.memo ?? '',
      due_date:       deal.due_date ?? '',
      due_start_time: deal.due_start_time ?? '',
      due_end_time:   deal.due_end_time ?? '',
    });
    setExpanded(null);
  }

  async function saveEdit() {
    if (!editing || editSaving) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/deals/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const { deal: u } = await res.json();
        setDeals(ds => ds.map(d => d.id === editing.id ? u : d));
        setEditing(null);
      } else {
        const body = await res.json().catch(() => ({}));
        setEditError(body.error ?? '保存に失敗しました');
      }
    } catch {
      setEditError('通信エラーが発生しました');
    } finally { setEditSaving(false); }
  }

  // モーダル表示時にbodyスクロールをロック
  useEffect(() => {
    if (editing) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [editing]);

  const today = new Date().toISOString().slice(0, 10);

  const SORT_LABELS: Record<SortKey, string> = { due: '期限順', new: '新しい順', old: '古い順' };
  const SORT_KEYS: SortKey[] = ['due', 'new', 'old'];

  // サーバー側で自分の案件のみ返すのでユーザーフィルタ不要
  const filtered = deals
    .filter(d => filter === 'done' ? d.status === 'done' : d.status !== 'done')
    .filter(d => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (d.client_name || '').toLowerCase().includes(q)
        || (d.contact_person || '').toLowerCase().includes(q)
        || (d.memo || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === 'new') return b.created_at.localeCompare(a.created_at);
      if (sort === 'old') return a.created_at.localeCompare(b.created_at);
      // due: 期限順（期限なしは末尾、同日は開始時刻順）
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      const byDate = a.due_date.localeCompare(b.due_date);
      if (byDate !== 0) return byDate;
      // 同じ日付: 開始時刻で並べる（時刻なしは先頭=朝8時想定扱い）
      return (a.due_start_time ?? '08:00').localeCompare(b.due_start_time ?? '08:00');
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

      {/* フィルター */}
      <div style={{
        display: 'flex', gap: 10, padding: '14px 18px',
        borderBottom: '1px solid #e8edf5', background: '#fafcff', alignItems: 'center',
      }}>
        <button
          onClick={() => setFilter('active')}
          style={{
            flex: 1, padding: '13px 0', borderRadius: 12,
            border: `2px solid ${filter === 'active' ? '#2563eb' : '#e2e8f0'}`,
            background: filter === 'active' ? '#eff6ff' : '#fff',
            color: filter === 'active' ? '#2563eb' : '#64748b',
            fontWeight: 700, fontSize: 18, cursor: 'pointer',
          }}
        >対応中</button>
        <button
          onClick={() => setFilter('done')}
          style={{
            flex: 1, padding: '13px 0', borderRadius: 12,
            border: `2px solid ${filter === 'done' ? '#10b981' : '#e2e8f0'}`,
            background: filter === 'done' ? '#d1fae5' : '#fff',
            color: filter === 'done' ? '#065f46' : '#64748b',
            fontWeight: 700, fontSize: 18, cursor: 'pointer',
          }}
        >完了</button>
        <button
          onClick={fetchDeals}
          style={{
            padding: '11px 13px', borderRadius: 12,
            border: '1.5px solid #e2e8f0', background: '#fff',
            color: '#94a3b8', cursor: 'pointer',
          }}
        ><RefreshCw size={20} /></button>
      </div>

      {/* 検索 + ソート */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 18px',
        borderBottom: '1px solid #e8edf5', background: '#fafcff', alignItems: 'center',
      }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            name="search"
            id="deal-search"
            placeholder="企業名・担当者・メモで検索"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '10px 10px 10px 32px', borderRadius: 10,
              border: '1.5px solid #e2e8f0', fontSize: 16, background: '#fff',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2,
              }}
            ><X size={16} /></button>
          )}
        </div>
        <button
          onClick={() => {
            const idx = SORT_KEYS.indexOf(sort);
            setSort(SORT_KEYS[(idx + 1) % SORT_KEYS.length]);
          }}
          style={{
            padding: '9px 12px', borderRadius: 10,
            border: '1.5px solid #e2e8f0', background: '#fff',
            color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <ArrowUpDown size={14} />
          {SORT_LABELS[sort]}
        </button>
      </div>

      {/* リスト */}
      <div
        style={{ padding: '16px 18px', flex: 1, overflowY: 'auto' }}
        ref={listRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {pulling && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14, marginBottom: 8 }}>
            更新中...
          </div>
        )}

        {loading && !pulling && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div className="spinner" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty-msg">
            {filter === 'done' ? '完了した案件はありません' : '対応中の案件はありません'}
          </div>
        )}

        {filtered.map(deal => {
          const due = fmtDate(deal.due_date);
          const isOpen     = expanded === deal.id;
          const isOverdue  = deal.due_date && deal.due_date < today && deal.status !== 'done';

          return (
            <div
              key={deal.id}
              style={{
                background: '#fff',
                borderRadius: 18,
                padding: '20px',
                marginBottom: 14,
                border: isOverdue ? '2px solid #fca5a5' : '1.5px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,.04)',
              }}
            >
              {/* 会社名 + 期日（タップで展開） */}
              <div
                onClick={() => setExpanded(isOpen ? null : deal.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}
              >
                <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, flex: 1, overflowWrap: 'break-word' }}>
                  {deal.client_name || '（会社名なし）'}
                </div>
                {due && (
                  <div style={{
                    flexShrink: 0, fontSize: 16, fontWeight: 600,
                    color: isOverdue ? '#ef4444' : '#64748b',
                    background: isOverdue ? '#fee2e2' : '#f8fafc',
                    border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`,
                    padding: '5px 12px', borderRadius: 8,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    lineHeight: 1.2,
                  }}>
                    <span>{due}</span>
                    {deal.due_start_time && (
                      <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>
                        {deal.due_start_time}{deal.due_end_time ? `–${deal.due_end_time}` : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 担当者（タップで展開） */}
              {deal.contact_person && (
                <div
                  onClick={() => setExpanded(isOpen ? null : deal.id)}
                  style={{ fontSize: 17, color: '#64748b', marginTop: 5, cursor: 'pointer' }}
                >
                  👤 {deal.contact_person}
                </div>
              )}

              {/* メモ（長押しでコピー可能） */}
              {deal.memo && (
                <div style={{
                  fontSize: 17, color: '#334155', lineHeight: 1.75,
                  marginTop: 10, whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
                  userSelect: 'text', WebkitUserSelect: 'text',
                }}>
                  {deal.memo}
                </div>
              )}

              {/* 展開トグルバー */}
              <div
                onClick={() => setExpanded(isOpen ? null : deal.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  marginTop: 10, padding: '8px 0', cursor: 'pointer',
                  color: '#94a3b8', fontSize: 13, fontWeight: 600,
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                {isOpen
                  ? <><ChevronUp size={16} /> 閉じる</>
                  : <><ChevronDown size={16} /> {filter === 'active' ? '完了・編集' : '戻す・削除'}</>
                }
              </div>

              {/* アクションボタン */}
              {isOpen && (
                <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                  {filter === 'active' ? (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); updateStatus(deal.id, 'done'); }}
                        style={{
                          flex: 1, padding: '15px', borderRadius: 14,
                          border: 'none', background: '#10b981', color: '#fff',
                          fontWeight: 700, fontSize: 18, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      ><Check size={20} /> 完了</button>
                      <button
                        onClick={e => { e.stopPropagation(); startEdit(deal); }}
                        style={{
                          padding: '15px 18px', borderRadius: 14,
                          border: '1.5px solid #e2e8f0', background: '#fff',
                          color: '#2563eb', fontWeight: 700, fontSize: 18, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      ><Pencil size={18} /> 編集</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); updateStatus(deal.id, '対応中'); }}
                        style={{
                          flex: 1, padding: '15px', borderRadius: 14,
                          border: 'none', background: '#2563eb', color: '#fff',
                          fontWeight: 700, fontSize: 18, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      ><Undo2 size={20} /> 対応中に戻す</button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteDeal(deal.id); }}
                        style={{
                          padding: '15px 18px', borderRadius: 14,
                          border: '1.5px solid #fca5a5', background: '#fff',
                          color: '#ef4444', fontWeight: 700, fontSize: 18, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      ><Trash2 size={18} /> 削除</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 編集モーダル */}
      {editing && (
        <div className="modal-overlay" onClick={() => { setEditing(null); setEditError(''); }}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>案件を編集</div>
              <button onClick={() => { setEditing(null); setEditError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={24} />
              </button>
            </div>
            {editError && <div className="error-msg" style={{ marginBottom: 12 }}>{editError}</div>}

            <label htmlFor="edit-client" style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>会社名</label>
            <input
              id="edit-client"
              name="client_name"
              className="input-field"
              style={{ width: '100%', fontSize: 16, padding: '12px 14px', marginBottom: 14, boxSizing: 'border-box' }}
              value={editForm.client_name}
              onChange={e => setEditForm(f => ({ ...f, client_name: e.target.value }))}
            />

            <label htmlFor="edit-contact" style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>担当者</label>
            <input
              id="edit-contact"
              name="contact_person"
              className="input-field"
              style={{ width: '100%', fontSize: 16, padding: '12px 14px', marginBottom: 14, boxSizing: 'border-box' }}
              value={editForm.contact_person}
              onChange={e => setEditForm(f => ({ ...f, contact_person: e.target.value }))}
            />

            <label htmlFor="edit-memo" style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>メモ</label>
            <textarea
              ref={editMemoRef}
              id="edit-memo"
              name="memo"
              className="input-field"
              style={{ width: '100%', fontSize: 16, padding: '12px 14px', marginBottom: 14, minHeight: 120, resize: 'none', overflow: 'hidden', boxSizing: 'border-box' }}
              value={editForm.memo}
              onChange={e => setEditForm(f => ({ ...f, memo: e.target.value }))}
            />

            <label htmlFor="edit-due" style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>期日</label>
            <input
              id="edit-due"
              name="due_date"
              className="input-field"
              type="date"
              style={{ width: '100%', fontSize: 16, padding: '12px 14px', marginBottom: 14, boxSizing: 'border-box' }}
              value={editForm.due_date}
              onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))}
            />

            <label style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>時間（任意）</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
              <input
                name="due_start_time"
                className="input-field"
                type="time"
                style={{ flex: 1, fontSize: 16, padding: '12px 14px', boxSizing: 'border-box' }}
                value={editForm.due_start_time}
                onChange={e => setEditForm(f => ({ ...f, due_start_time: e.target.value }))}
              />
              <span style={{ color: '#94a3b8', fontSize: 18, fontWeight: 600 }}>〜</span>
              <input
                name="due_end_time"
                className="input-field"
                type="time"
                style={{ flex: 1, fontSize: 16, padding: '12px 14px', boxSizing: 'border-box' }}
                value={editForm.due_end_time}
                onChange={e => setEditForm(f => ({ ...f, due_end_time: e.target.value }))}
              />
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20, lineHeight: 1.5 }}>
              未入力なら朝8:00通知。開始のみ入れると終了は+1時間。
            </div>

            <button
              onClick={saveEdit}
              disabled={editSaving}
              style={{
                width: '100%', padding: '15px', borderRadius: 14,
                border: 'none', background: '#2563eb', color: '#fff',
                fontWeight: 700, fontSize: 18, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: editSaving ? 0.6 : 1,
              }}
            ><Check size={20} /> {editSaving ? '保存中...' : '保存'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
