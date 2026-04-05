'use client';
import { useState } from 'react';
import { User as UserIcon } from 'lucide-react';
import { User } from '@/lib/types';

type Props = {
  users: User[];
  companyName: string;
  deviceToken: string;
  companyId: string;
  onSelect: (userId: string, userName: string) => void;
};

export function UserSelect({ users, companyName, deviceToken, companyId, onSelect }: Props) {
  const [selected, setSelected] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleConfirm() {
    if (!selected) return setError('担当者を選んでください');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/select-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_token: deviceToken, user_id: selected, company_id: companyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '登録に失敗しました');
        return;
      }
      onSelect(data.user_id, data.user_name);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: 400 }}>
        <div className="login-logo"><UserIcon size={48} color="#2563eb" /></div>
        <div className="login-title" style={{ fontSize: 22 }}>担当者を選択</div>
        <div className="login-sub">{companyName}</div>

        {error && <div className="error-msg">{error}</div>}

        {users.length === 0 ? (
          <div className="empty-msg" style={{ padding: '20px 0' }}>
            ユーザーが登録されていません。<br />管理者に連絡してください。
          </div>
        ) : (
          <div className="user-grid">
            {users.map(u => (
              <button
                key={u.id}
                className={`user-card ${selected === u.id ? 'selected' : ''}`}
                onClick={() => setSelected(u.id)}
              >
                {u.name}
              </button>
            ))}
          </div>
        )}

        {users.length > 0 && (
          <button
            className="primary-btn"
            style={{ marginTop: 24 }}
            onClick={handleConfirm}
            disabled={loading || !selected}
          >
            {loading ? '登録中...' : 'この端末で使う'}
          </button>
        )}
      </div>
    </div>
  );
}
