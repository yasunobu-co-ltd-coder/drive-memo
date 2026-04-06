'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function AdminLoginPage() {
  const [code, setCode]       = useState('');
  const [pass, setPass]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!code.trim() || !pass) return setError('管理者コードとパスワードを入力してください');

    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '認証失敗'); return; }
      setSent(data.email);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9993;</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
            認証メールを送信しました
          </div>
          <div style={{ fontSize: 16, color: '#64748b', lineHeight: 1.8 }}>
            <strong>{sent}</strong> に承認リンクを送信しました。<br />
            メールのリンクをクリックして管理者画面にアクセスしてください。
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 20 }}>
            リンクの有効期限は10分間です。
          </div>
          <button
            onClick={() => { setSent(''); setError(''); }}
            style={{
              marginTop: 28, padding: '12px 24px', borderRadius: 12,
              border: '1.5px solid #e2e8f0', background: '#fff',
              color: '#64748b', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            }}
          >
            やり直す
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-title">drive</div>
        <div className="login-sub" style={{ marginBottom: 4 }}>管理者ログイン</div>
        <div style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>
          認証後、指定メールアドレスに承認リンクを送信します
        </div>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="input-label" htmlFor="admin-code">管理者コード</label>
            <input
              id="admin-code"
              name="admin_code"
              className="input-field"
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="form-group">
            <label className="input-label" htmlFor="admin-password">パスワード</label>
            <input
              id="admin-password"
              name="admin_password"
              className="input-field"
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? '確認中...' : '認証メールを送信'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <Link href="/" style={{ color: '#94a3b8', fontSize: 14, textDecoration: 'none' }}>
            ← ユーザーログインに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
