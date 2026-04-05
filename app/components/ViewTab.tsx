'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DealCard } from './DealCard';
import { Deal, User, DealStatus } from '@/lib/types';

type OwnerFilter  = 'all' | 'mine';
type StatusFilter = 'active' | '未着手' | '対応中' | 'done';

type Props = {
  users: User[];
  currentUserId: string;
  deviceToken: string;
  refreshSignal: number;
  onSwitchUser: () => void;
  currentUserName: string;
};

export function ViewTab({
  users, currentUserId, deviceToken, refreshSignal, onSwitchUser, currentUserName,
}: Props) {
  const [deals, setDeals]             = useState<Deal[]>([]);
  const [loading, setLoading]         = useState(true);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const pullStartY  = useRef(0);
  const [pulling, setPulling]         = useState(false);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/deals', {
        headers: { 'x-device-token': deviceToken },
      });
      if (!res.ok) return;
      const { deals: data } = await res.json();
      setDeals(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [deviceToken]);

  useEffect(() => { fetchDeals(); }, [fetchDeals, refreshSignal]);

  // プルリフレッシュ
  function onTouchStart(e: React.TouchEvent) {
    pullStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const diff = e.changedTouches[0].clientY - pullStartY.current;
    if (diff > 60 && !loading) {
      setPulling(true);
      fetchDeals().finally(() => setPulling(false));
    }
  }

  // フィルタリング
  const filtered = deals.filter(d => {
    if (ownerFilter === 'mine' && d.assignee !== currentUserId && d.created_by !== currentUserId) {
      return false;
    }
    if (statusFilter === 'active') return d.status !== 'done';
    return d.status === (statusFilter as DealStatus);
  });

  // 期日でソート（近い順 → nullは後ろ）
  const sorted = [...filtered].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });

  function onUpdated(updated: Deal) {
    setDeals(ds => ds.map(d => d.id === updated.id ? updated : d));
  }
  function onDeleted(id: string) {
    setDeals(ds => ds.filter(d => d.id !== id));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* フィルターバー */}
      <div className="filter-bar">
        <button
          className={`filter-chip ${ownerFilter === 'all' ? 'active' : ''}`}
          onClick={() => setOwnerFilter('all')}
        >全員</button>
        <button
          className={`filter-chip ${ownerFilter === 'mine' ? 'active' : ''}`}
          onClick={() => setOwnerFilter('mine')}
        >自分 ({currentUserName})</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={onSwitchUser}
          style={{
            padding: '8px 14px',
            borderRadius: 99,
            border: '1.5px solid #e2e8f0',
            background: '#fff',
            color: '#475569',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          切替
        </button>
      </div>
      <div className="filter-bar" style={{ paddingTop: 0, borderBottom: '1px solid #e8edf5' }}>
        {(['active', '未着手', '対応中', 'done'] as StatusFilter[]).map(s => (
          <button
            key={s}
            className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}
            style={{ fontSize: 14, padding: '8px 14px' }}
          >
            {s === 'active' ? '対応中+未着手' : s === 'done' ? '完了' : s}
          </button>
        ))}
      </div>

      {/* リスト */}
      <div
        className="content"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {pulling && (
          <div className="pull-hint">
            <RefreshCw size={16} className="inline animate-spin mr-1" />
            更新中...
          </div>
        )}

        {loading && !pulling && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div className="spinner" />
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="empty-msg">
            {ownerFilter === 'mine' ? '自分の案件はありません' : '案件がありません'}
          </div>
        )}

        {sorted.map(deal => (
          <DealCard
            key={deal.id}
            deal={deal}
            users={users}
            deviceToken={deviceToken}
            onUpdated={onUpdated}
            onDeleted={onDeleted}
          />
        ))}
      </div>
    </div>
  );
}
