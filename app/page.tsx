'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Plus, Calendar, Settings } from 'lucide-react';
import { AuthScreen }   from './components/AuthScreen';
import { UserSelect }   from './components/UserSelect';
import { MemoTab }      from './components/MemoTab';
import { ViewTab }      from './components/ViewTab';
import { Footer }       from './components/Footer';
import { StoredAuth, User } from '@/lib/types';

const AUTH_KEY = 'drive_auth_v2';

type AuthState = 'loading' | 'auth' | 'user-select' | 'app';
type Tab = 'memo' | 'view';

// 初回登録後に渡される一時データ
type PendingAuth = {
  device_token: string;
  company_id: string;
  company_name: string;
  users: User[];
};

export default function Page() {
  const [authState, setAuthState]   = useState<AuthState>('loading');
  const [pending, setPending]       = useState<PendingAuth | null>(null);
  const [session, setSession]       = useState<StoredAuth | null>(null);
  const [users, setUsers]           = useState<User[]>([]);
  const [activeTab, setActiveTab]   = useState<Tab>('memo');
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [showUserSwitch, setShowUserSwitch] = useState(false);
  const [addUserName, setAddUserName]       = useState('');
  const [calConnected, setCalConnected]     = useState<boolean | null>(null);
  const [calLoading, setCalLoading]         = useState(false);
  const [syncing, setSyncing]               = useState(false);
  const [syncResult, setSyncResult]         = useState('');

  // ─── ヘッダーの文字サイズ自動調整（hooks は早期returnの前に置く） ───
  const badgeRef = useRef<HTMLSpanElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const adjustBadgeSize = useCallback(() => {
    const badge = badgeRef.current;
    const header = headerRef.current;
    if (!badge || !header) return;
    badge.style.fontSize = '14px';
    let size = 14;
    while (header.scrollHeight > header.clientHeight + 2 && size > 10) {
      size -= 0.5;
      badge.style.fontSize = `${size}px`;
    }
  }, []);

  useEffect(() => {
    adjustBadgeSize();
    window.addEventListener('resize', adjustBadgeSize);
    return () => window.removeEventListener('resize', adjustBadgeSize);
  }, [adjustBadgeSize, session]);

  // ───────────────────────────────────────
  // 起動時：localStorage から即座に復帰（オフラインファースト）
  // バックグラウンドで validate し、401 の場合のみログアウト
  // ───────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) { setAuthState('auth'); return; }

    let stored: StoredAuth;
    try { stored = JSON.parse(raw); } catch { setAuthState('auth'); return; }

    // 必須フィールドがなければ無効なデータ
    if (!stored.deviceToken || !stored.userId) {
      localStorage.removeItem(AUTH_KEY);
      setAuthState('auth');
      return;
    }

    // キャッシュデータで即座にアプリ表示（タスクキル後も即復帰）
    setSession(stored);
    setAuthState('app');

    // バックグラウンドでサーバー検証
    fetch('/api/auth/validate', {
      headers: { 'x-device-token': stored.deviceToken },
    })
      .then(async res => {
        if (res.status === 401) {
          // トークンが無効（削除された等）→ ログアウト
          localStorage.removeItem(AUTH_KEY);
          setSession(null);
          setAuthState('auth');
          return;
        }
        if (!res.ok) return; // サーバーエラー等はキャッシュで継続

        const data = await res.json();
        const updated: StoredAuth = {
          deviceToken:  stored.deviceToken,
          companyId:    data.companyId,
          companyName:  data.companyName,
          userId:       data.userId,
          userName:     data.userName,
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
        setSession(updated);
        if (data.users) setUsers(data.users);
      })
      .catch(() => {
        // ネットワークエラー → キャッシュデータで継続（ログアウトしない）
      });
  }, []);

  // ───────────────────────────────────────
  // 認証成功コールバック
  // ───────────────────────────────────────
  function onAuthSuccess(result: PendingAuth) {
    setPending(result);
    setAuthState('user-select');
  }

  function onUserSelected(userId: string, userName: string) {
    if (!pending) return;
    const stored: StoredAuth = {
      deviceToken: pending.device_token,
      companyId:   pending.company_id,
      companyName: pending.company_name,
      userId,
      userName,
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(stored));
    setSession(stored);
    setUsers(pending.users);
    setPending(null);
    setAuthState('app');
  }

  // ───────────────────────────────────────
  // ユーザー切り替え
  // ───────────────────────────────────────
  async function handleSwitchUser(userId: string, userName: string) {
    if (!session) return;
    await fetch('/api/auth/switch-user', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-device-token': session.deviceToken,
      },
      body: JSON.stringify({ user_id: userId }),
    });
    const updated: StoredAuth = { ...session, userId, userName };
    localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
    setSession(updated);
    setShowUserSwitch(false);
  }

  // ───────────────────────────────────────
  // ユーザー一覧取得（タスクキル後の復帰時用）
  // ───────────────────────────────────────
  async function fetchUsersIfEmpty() {
    if (users.length > 0 || !session) return;
    try {
      const res = await fetch('/api/auth/validate', {
        headers: { 'x-device-token': session.deviceToken },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.users) setUsers(data.users);
      }
    } catch { /* ネットワークエラーは無視 */ }
  }

  // ───────────────────────────────────────
  // ユーザー追加（一般ユーザーが自社にメンバーを追加）
  // ───────────────────────────────────────
  async function handleAddUser() {
    if (!session || !addUserName.trim()) return;
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-token': session.deviceToken,
      },
      body: JSON.stringify({ name: addUserName.trim() }),
    });
    if (res.ok) {
      const { user } = await res.json();
      setUsers(prev => [...prev, user]);
      setAddUserName('');
    }
  }

  // ───────────────────────────────────────
  // Googleカレンダー連携
  // ───────────────────────────────────────
  async function checkCalendarStatus() {
    if (!session) return;
    try {
      const res = await fetch('/api/auth/google/status', {
        headers: { 'x-device-token': session.deviceToken },
      });
      if (res.ok) {
        const { connected } = await res.json();
        setCalConnected(connected);
      }
    } catch { /* ignore */ }
  }

  async function handleCalendarConnect() {
    if (!session) return;
    setCalLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        headers: { 'x-device-token': session.deviceToken },
      });
      if (res.ok) {
        const { url } = await res.json();
        // OAuth画面を開く
        const popup = window.open(url, '_blank', 'width=500,height=700');
        // ポップアップが閉じたら状態を再チェック
        const timer = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(timer);
            setCalLoading(false);
            checkCalendarStatus();
          }
        }, 1000);
      } else {
        setCalLoading(false);
      }
    } catch {
      setCalLoading(false);
    }
  }

  async function handleCalendarDisconnect() {
    if (!session || !confirm('Googleカレンダー連携を解除しますか？')) return;
    await fetch('/api/auth/google/disconnect', {
      method: 'DELETE',
      headers: { 'x-device-token': session.deviceToken },
    });
    setCalConnected(false);
  }

  async function handleSyncCalendar() {
    if (!session) return;
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await fetch('/api/deals/sync-calendar', {
        method: 'POST',
        headers: { 'x-device-token': session.deviceToken },
      });
      if (res.ok) {
        const { synced, total } = await res.json();
        setSyncResult(`${synced}/${total}件をカレンダーに登録しました`);
      } else {
        setSyncResult('同期に失敗しました');
      }
    } catch {
      setSyncResult('通信エラー');
    } finally {
      setSyncing(false);
    }
  }

  // ───────────────────────────────────────
  // メモ登録後にリストを更新
  // ───────────────────────────────────────
  function onMemoCreated() {
    setRefreshSignal(v => v + 1);
    setActiveTab('view');
  }

  // ───────────────────────────────────────
  // ログアウト
  // ───────────────────────────────────────
  function handleLogout() {
    if (!confirm('この端末のログイン情報を削除しますか？')) return;
    localStorage.removeItem(AUTH_KEY);
    setSession(null);
    setAuthState('auth');
  }

  // ───────────────────────────────────────
  // レンダリング
  // ───────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (authState === 'auth') {
    return <AuthScreen onSuccess={onAuthSuccess} />;
  }

  if (authState === 'user-select' && pending) {
    return (
      <UserSelect
        users={pending.users}
        companyName={pending.company_name}
        deviceToken={pending.device_token}
        companyId={pending.company_id}
        onSelect={onUserSelected}
      />
    );
  }

  if (!session) return null;

  return (
    <div className="wrap">
      {/* ヘッダー */}
      <header className="topbar" ref={headerRef} style={{ flexWrap: 'nowrap', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="brand">drive</span>
          <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace', lineHeight: 1 }}>
            {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <button
            onClick={() => { fetchUsersIfEmpty(); checkCalendarStatus(); setShowUserSwitch(true); }}
            title="設定"
            style={{
              background: 'none',
              border: '1.5px solid #e2e8f0',
              borderRadius: 99,
              padding: '6px 10px',
              color: '#94a3b8',
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Settings size={16} />
          </button>
          <span className="user-badge" ref={badgeRef}>{session.companyName} / {session.userName}</span>
          <button
            onClick={handleLogout}
            title="ログアウト"
            style={{
              background: 'none',
              border: '1.5px solid #e2e8f0',
              borderRadius: 99,
              padding: '6px 10px',
              fontSize: 13,
              color: '#94a3b8',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ユーザー切替モーダル */}
      {showUserSwitch && (
        <div className="modal-overlay" onClick={() => setShowUserSwitch(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, textAlign: 'center' }}>
              設定
            </div>

            {/* 担当者切り替え */}
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: '#334155' }}>
              担当者を切り替える
            </div>
            <div className="user-grid">
              {users.map(u => (
                <button
                  key={u.id}
                  className={`user-card ${session.userId === u.id ? 'selected' : ''}`}
                  onClick={() => handleSwitchUser(u.id, u.name)}
                >
                  {u.name}
                </button>
              ))}
            </div>

            {/* 担当者追加 */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <input
                className="input-field"
                style={{ flex: 1, fontSize: 16, padding: '12px 14px' }}
                value={addUserName}
                onChange={e => setAddUserName(e.target.value)}
                placeholder="新しい担当者名"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddUser(); } }}
              />
              <button
                onClick={handleAddUser}
                style={{
                  padding: '12px 18px', borderRadius: 12,
                  border: 'none', background: '#2563eb', color: '#fff',
                  fontWeight: 700, fontSize: 16, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  opacity: addUserName.trim() ? 1 : 0.5,
                }}
                disabled={!addUserName.trim()}
              >
                <Plus size={18} /> 追加
              </button>
            </div>

            {/* Googleカレンダー連携 */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={18} /> Googleカレンダー連携
              </div>
              {calConnected === null ? (
                <div style={{ fontSize: 14, color: '#94a3b8' }}>確認中...</div>
              ) : calConnected ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 14, color: '#10b981', fontWeight: 600 }}>連携中</span>
                    <button
                      onClick={handleCalendarDisconnect}
                      style={{
                        padding: '8px 16px', borderRadius: 10,
                        border: '1.5px solid #fca5a5', background: '#fff',
                        color: '#ef4444', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                      }}
                    >解除</button>
                  </div>
                  <button
                    onClick={handleSyncCalendar}
                    disabled={syncing}
                    style={{
                      padding: '10px 16px', borderRadius: 10,
                      border: '1.5px solid #e2e8f0', background: '#fff',
                      color: '#334155', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                      opacity: syncing ? 0.6 : 1,
                    }}
                  >{syncing ? '同期中...' : '既存メモをカレンダーに一括登録'}</button>
                  {syncResult && (
                    <div style={{ fontSize: 13, color: '#10b981', marginTop: 6 }}>{syncResult}</div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleCalendarConnect}
                  disabled={calLoading}
                  style={{
                    padding: '12px 20px', borderRadius: 12,
                    border: 'none', background: '#4285f4', color: '#fff',
                    fontWeight: 700, fontSize: 15, cursor: 'pointer',
                    opacity: calLoading ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Calendar size={18} />
                  {calLoading ? '接続中...' : 'Googleカレンダーと連携'}
                </button>
              )}
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                期日付きメモがカレンダーに自動登録されます
              </div>
            </div>

            <button
              style={{
                width: '100%',
                marginTop: 16,
                padding: '14px',
                borderRadius: 14,
                border: '1.5px solid #e2e8f0',
                background: '#fff',
                color: '#64748b',
                fontWeight: 600,
                fontSize: 16,
                cursor: 'pointer',
              }}
              onClick={() => setShowUserSwitch(false)}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* コンテンツ */}
      {activeTab === 'memo' && (
        <MemoTab
          currentUserId={session.userId}
          deviceToken={session.deviceToken}
          onCreated={onMemoCreated}
        />
      )}

      {activeTab === 'view' && (
        <ViewTab
          deviceToken={session.deviceToken}
          refreshSignal={refreshSignal}
          currentUserName={session.userName}
          onSwitchUser={() => { fetchUsersIfEmpty(); checkCalendarStatus(); setShowUserSwitch(true); }}
        />
      )}

      {/* フッター */}
      <Footer active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
