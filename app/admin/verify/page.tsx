'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

function VerifyContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError]   = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setError('トークンがありません');
      return;
    }

    fetch('/api/admin/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '認証失敗');
        // セッショントークンを保存
        localStorage.setItem('drive_admin_token', data.token);
        setStatus('success');
        // 少し待ってからダッシュボードへ
        setTimeout(() => router.replace('/admin/dashboard'), 1000);
      })
      .catch(err => {
        setStatus('error');
        setError(err.message);
      });
  }, [searchParams, router]);

  return (
    <div className="login-screen">
      <div className="login-card" style={{ textAlign: 'center' }}>
        {status === 'verifying' && (
          <>
            <div className="spinner" style={{ margin: '20px auto' }} />
            <div style={{ fontSize: 18, fontWeight: 600, color: '#64748b' }}>
              認証を確認中...
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#065f46' }}>
              認証完了
            </div>
            <div style={{ fontSize: 15, color: '#64748b', marginTop: 12 }}>
              管理者画面に移動しています...
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#10007;</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#dc2626', marginBottom: 12 }}>
              認証失敗
            </div>
            <div style={{ fontSize: 15, color: '#64748b', lineHeight: 1.7 }}>
              {error}
            </div>
            <button
              onClick={() => router.replace('/admin')}
              className="primary-btn"
              style={{ marginTop: 28 }}
            >
              管理者ログインに戻る
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminVerifyPage() {
  return (
    <Suspense fallback={
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '20px auto' }} />
        </div>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
