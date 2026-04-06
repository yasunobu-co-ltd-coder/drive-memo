'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Deal } from '@/lib/types';

type Filter = 'active' | 'done';

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

  const today = new Date().toISOString().slice(0, 10);

  // サーバー側で自分の案件のみ返すのでユーザーフィルタ不要
  const filtered = deals
    .filter(d => filter === 'done' ? d.status === 'done' : d.status !== 'done')
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
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

      {/* リスト */}
      <div
        style={{ padding: '16px 18px', flex: 1, overflowY: 'auto' }}
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
              onClick={() => setExpanded(isOpen ? null : deal.id)}
              style={{
                background: '#fff',
                borderRadius: 18,
                padding: '20px',
                marginBottom: 14,
                border: isOverdue ? '2px solid #fca5a5' : '1.5px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,.04)',
                cursor: 'pointer',
              }}
            >
              {/* 会社名 + 期日 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, flex: 1, wordBreak: 'break-all' }}>
                  {deal.client_name || '（会社名なし）'}
                </div>
                {due && (
                  <div style={{
                    flexShrink: 0, fontSize: 16, fontWeight: 600,
                    color: isOverdue ? '#ef4444' : '#64748b',
                    background: isOverdue ? '#fee2e2' : '#f8fafc',
                    border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`,
                    padding: '5px 12px', borderRadius: 8,
                  }}>{due}</div>
                )}
              </div>

              {/* 担当者 */}
              {deal.contact_person && (
                <div style={{ fontSize: 17, color: '#64748b', marginTop: 5 }}>
                  👤 {deal.contact_person}
                </div>
              )}

              {/* メモ */}
              {deal.memo && (
                <div style={{
                  fontSize: 17, color: '#334155', lineHeight: 1.75,
                  marginTop: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {deal.memo}
                </div>
              )}

              {/* 展開ボタン */}
              {isOpen && (
                <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                  {filter === 'active' ? (
                    <button
                      onClick={e => { e.stopPropagation(); updateStatus(deal.id, 'done'); }}
                      style={{
                        flex: 1, padding: '15px', borderRadius: 14,
                        border: 'none', background: '#10b981', color: '#fff',
                        fontWeight: 700, fontSize: 18, cursor: 'pointer',
                      }}
                    >✅ 完了にする</button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); updateStatus(deal.id, '未着手'); }}
                      style={{
                        flex: 1, padding: '15px', borderRadius: 14,
                        border: 'none', background: '#2563eb', color: '#fff',
                        fontWeight: 700, fontSize: 18, cursor: 'pointer',
                      }}
                    >↩ 対応中に戻す</button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); deleteDeal(deal.id); }}
                    style={{
                      padding: '15px 18px', borderRadius: 14,
                      border: '1.5px solid #fca5a5', background: '#fff',
                      color: '#ef4444', fontWeight: 700, fontSize: 18, cursor: 'pointer',
                    }}
                  >削除</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
