'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { User } from '@/lib/types';

type AuthResult = {
  device_token: string;
  company_id: string;
  company_name: string;
  users: User[];
};

type Props = {
  onSuccess: (result: AuthResult) => void;
};

export function AuthScreen({ onSuccess }: Props) {
  const [code, setCode]       = useState('');
  const [pass, setPass]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!code.trim() || !pass) return setError('会社コードとパスワードを入力してください');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_code: code, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'ログインに失敗しました');
        return;
      }
      onSuccess(data as AuthResult);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-title">drive</div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginBottom: 4, fontFamily: 'monospace' }}>
          {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'}
        </div>
        <div className="login-sub">会社コードでログイン</div>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="input-label" htmlFor="company-code">会社コード</label>
            <input
              id="company-code"
              name="company_code"
              className="input-field"
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder=""
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="form-group">
            <label className="input-label" htmlFor="company-password">パスワード</label>
            <div style={{ position: 'relative' }}>
              <input
                id="company-password"
                name="password"
                className="input-field"
                type={showPw ? 'text' : 'password'}
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ paddingRight: 44 }}
              />
              {pass && (
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4,
                  }}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              )}
            </div>
          </div>

          <button
            className="primary-btn"
            type="submit"
            disabled={loading}
          >
            {loading ? '確認中...' : 'ログイン'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 28, display: 'flex', justifyContent: 'center', gap: 16 }}>
          <Link href="/admin" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
            管理者はこちら
          </Link>
          <Link href="/privacy" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
            プライバシーポリシー
          </Link>
          <Link href="/terms" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
            利用規約
          </Link>
        </div>
      </div>
    </div>
  );
}
