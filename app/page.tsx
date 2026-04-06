'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Plus } from 'lucide-react';
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

  // ───────────────────────────────────────
  // 起動時：localStorage からトークン検証
  // ───────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) { setAuthState('auth'); return; }

    let stored: StoredAuth;
    try { stored = JSON.parse(raw); } catch { setAuthState('auth'); return; }

    fetch('/api/auth/validate', {
      headers: { 'x-device-token': stored.deviceToken },
    })
      .then(async res => {
        if (!res.ok) throw new Error('invalid');
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
        // validate がユーザー一覧も返すのでここでセット
        if (data.users) setUsers(data.users);
        setAuthState('app');
      })
      .catch(() => {
        localStorage.removeItem(AUTH_KEY);
        setAuthState('auth');
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

  // ─── ヘッダーの文字サイズ自動調整 ───
  const badgeRef = useRef<HTMLSpanElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const adjustBadgeSize = useCallback(() => {
    const badge = badgeRef.current;
    const header = headerRef.current;
    if (!badge || !header) return;
    // リセット
    badge.style.fontSize = '14px';
    // ヘッダーが1行に収まるまで縮小（最小10px）
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

  if (!session) return null;

  return (
    <div className="wrap">
      {/* ヘッダー */}
      <header className="topbar" ref={headerRef} style={{ flexWrap: 'nowrap', overflow: 'hidden' }}>
        <span className="brand">drive</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
          onSwitchUser={() => setShowUserSwitch(true)}
        />
      )}

      {/* フッター */}
      <Footer active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
