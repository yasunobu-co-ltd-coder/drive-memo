'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Plus, Trash2, LogOut, Users, Building2, KeyRound } from 'lucide-react';

const ADMIN_KEY = 'drive_admin_token';

type Company = { id: string; code: string; name: string; created_at: string };
type User    = { id: string; name: string; sort_order: number };

export default function AdminDashboard() {
  const router = useRouter();
  const [token, setToken]               = useState('');
  const [companies, setCompanies]       = useState<Company[]>([]);
  const [loading, setLoading]           = useState(true);
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [users, setUsers]               = useState<Record<string, User[]>>({});
  const [showAdd, setShowAdd]           = useState(false);

  // フォーム
  const [newCode, setNewCode]           = useState('');
  const [newName, setNewName]           = useState('');
  const [newPass, setNewPass]           = useState('');
  const [newUsers, setNewUsers]         = useState('');
  const [addError, setAddError]         = useState('');
  const [adding, setAdding]             = useState(false);

  // ユーザー追加
  const [addUserName, setAddUserName]   = useState('');

  // パスワード変更
  const [changePwId, setChangePwId]     = useState<string | null>(null);
  const [newPw, setNewPw]               = useState('');
  const [pwMsg, setPwMsg]               = useState('');

  // ─── 認証チェック ───
  useEffect(() => {
    const t = localStorage.getItem(ADMIN_KEY);
    if (!t) { router.replace('/admin'); return; }
    setToken(t);
  }, [router]);

  // ─── API ヘルパー ───
  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-token': token,
  }), [token]);

  // ─── 会社一覧取得 ───
  const fetchCompanies = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch('/api/admin/companies', { headers: { 'x-admin-token': token } });
    if (res.status === 401) { localStorage.removeItem(ADMIN_KEY); router.replace('/admin'); return; }
    const data = await res.json();
    setCompanies(data.companies ?? []);
    setLoading(false);
  }, [token, router]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  // ─── ユーザー一覧取得 ───
  async function fetchUsers(companyId: string) {
    const res = await fetch(`/api/admin/companies/${companyId}/users`, {
      headers: { 'x-admin-token': token },
    });
    const data = await res.json();
    setUsers(prev => ({ ...prev, [companyId]: data.users ?? [] }));
  }

  function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!users[id]) fetchUsers(id);
  }

  // ─── 会社追加 ───
  async function handleAddCompany(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    if (!newCode.trim() || !newName.trim() || !newPass) {
      return setAddError('全項目を入力してください');
    }
    setAdding(true);
    const userList = newUsers.split(/[,、\n]/).map(s => s.trim()).filter(Boolean).map(name => ({ name }));
    const res = await fetch('/api/admin/companies', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ code: newCode, name: newName, password: newPass, users: userList }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) { setAddError(data.error ?? '登録失敗'); return; }
    setNewCode(''); setNewName(''); setNewPass(''); setNewUsers('');
    setShowAdd(false);
    fetchCompanies();
  }

  // ─── 会社削除 ───
  async function deleteCompany(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？\n関連する全データ（ユーザー・案件・端末登録）も削除されます。`)) return;
    await fetch(`/api/admin/companies/${id}`, { method: 'DELETE', headers: headers() });
    fetchCompanies();
    if (expanded === id) setExpanded(null);
  }

  // ─── ユーザー追加 ───
  async function addUser(companyId: string) {
    if (!addUserName.trim()) return;
    await fetch(`/api/admin/companies/${companyId}/users`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: addUserName.trim() }),
    });
    setAddUserName('');
    fetchUsers(companyId);
  }

  // ─── パスワード変更 ───
  async function changePassword(companyId: string) {
    if (!newPw || newPw.length < 4) { setPwMsg('4文字以上で入力してください'); return; }
    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ password: newPw }),
    });
    if (res.ok) {
      setPwMsg('変更しました');
      setNewPw('');
      setTimeout(() => { setChangePwId(null); setPwMsg(''); }, 1500);
    } else {
      const data = await res.json();
      setPwMsg(data.error ?? '変更失敗');
    }
  }

  // ─── ユーザー削除 ───
  async function deleteUser(companyId: string, userId: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    await fetch(`/api/admin/companies/${companyId}/users/${userId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    fetchUsers(companyId);
  }

  // ─── ログアウト ───
  function handleLogout() {
    localStorage.removeItem(ADMIN_KEY);
    router.replace('/admin');
  }

  if (!token) return null;

  return (
    <div style={{ minHeight: '100dvh', background: '#f1f5f9' }}>
      {/* ヘッダー */}
      <header style={{
        background: '#0f172a', color: '#fff', padding: '16px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Building2 size={22} />
          <span style={{ fontSize: 20, fontWeight: 700 }}>drive 管理者</span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff',
            borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 14,
          }}
        >
          <LogOut size={16} /> ログアウト
        </button>
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        {/* 会社追加ボタン */}
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            width: '100%', padding: '16px', borderRadius: 14,
            border: '2px dashed #cbd5e1', background: showAdd ? '#eff6ff' : '#fff',
            color: '#2563eb', fontWeight: 700, fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 20,
          }}
        >
          <Plus size={22} /> 会社を追加
        </button>

        {/* 会社追加フォーム */}
        {showAdd && (
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20,
            border: '1.5px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,.04)',
          }}>
            {addError && <div className="error-msg">{addError}</div>}
            <form onSubmit={handleAddCompany}>
              <div className="form-group">
                <label className="input-label" htmlFor="new-code">会社コード</label>
                <input id="new-code" name="code" className="input-field"
                  value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())}
                  placeholder="ANSIN001" autoComplete="off" />
              </div>
              <div className="form-group">
                <label className="input-label" htmlFor="new-name">会社名</label>
                <input id="new-name" name="name" className="input-field"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="安信工業株式会社" />
              </div>
              <div className="form-group">
                <label className="input-label" htmlFor="new-pass">パスワード</label>
                <input id="new-pass" name="password" className="input-field" type="password"
                  value={newPass} onChange={e => setNewPass(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="input-label" htmlFor="new-users">ユーザー（カンマ区切り）</label>
                <input id="new-users" name="users" className="input-field"
                  value={newUsers} onChange={e => setNewUsers(e.target.value)}
                  placeholder="田中, 佐藤, 鈴木" />
              </div>
              <button className="primary-btn" type="submit" disabled={adding}>
                {adding ? '登録中...' : '登録する'}
              </button>
            </form>
          </div>
        )}

        {/* 会社一覧 */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div className="spinner" />
          </div>
        ) : companies.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 18, padding: 60 }}>
            登録された会社がありません
          </div>
        ) : (
          companies.map(c => (
            <div key={c.id} style={{
              background: '#fff', borderRadius: 16, marginBottom: 14,
              border: '1.5px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,.04)',
              overflow: 'hidden',
            }}>
              {/* 会社ヘッダー */}
              <div
                onClick={() => toggleExpand(c.id)}
                style={{
                  padding: '18px 20px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{c.name}</div>
                  <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>
                    コード: {c.code}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={e => { e.stopPropagation(); setChangePwId(changePwId === c.id ? null : c.id); setNewPw(''); setPwMsg(''); }}
                    title="パスワード変更"
                    style={{
                      background: 'none', border: '1.5px solid #cbd5e1', borderRadius: 8,
                      padding: '6px 10px', color: '#64748b', cursor: 'pointer',
                    }}
                  >
                    <KeyRound size={16} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteCompany(c.id, c.name); }}
                    style={{
                      background: 'none', border: '1.5px solid #fca5a5', borderRadius: 8,
                      padding: '6px 10px', color: '#ef4444', cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                  {expanded === c.id ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
                </div>
              </div>

              {/* パスワード変更フォーム */}
              {changePwId === c.id && (
                <div style={{ borderTop: '1px solid #e8edf5', padding: '14px 20px', background: '#fafbfc' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <KeyRound size={16} /> パスワード変更
                  </div>
                  {pwMsg && (
                    <div style={{
                      padding: '10px 14px', borderRadius: 10, marginBottom: 10, fontSize: 14, fontWeight: 500,
                      background: pwMsg === '変更しました' ? '#d1fae5' : '#fee2e2',
                      color: pwMsg === '変更しました' ? '#065f46' : '#b91c1c',
                    }}>
                      {pwMsg}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="password"
                      className="input-field"
                      style={{ flex: 1, fontSize: 16, padding: '12px 14px' }}
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                      placeholder="新しいパスワード（4文字以上）"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); changePassword(c.id); } }}
                    />
                    <button
                      onClick={() => changePassword(c.id)}
                      style={{
                        padding: '12px 18px', borderRadius: 12,
                        border: 'none', background: '#2563eb', color: '#fff',
                        fontWeight: 700, fontSize: 16, cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      変更
                    </button>
                  </div>
                </div>
              )}

              {/* ユーザー管理（展開時） */}
              {expanded === c.id && (
                <div style={{ borderTop: '1px solid #e8edf5', padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, color: '#475569', fontWeight: 600, fontSize: 16 }}>
                    <Users size={18} /> ユーザー一覧
                  </div>

                  {!users[c.id] ? (
                    <div className="spinner" style={{ margin: '12px auto' }} />
                  ) : users[c.id].length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: 15, marginBottom: 12 }}>ユーザーなし</div>
                  ) : (
                    users[c.id].map(u => (
                      <div key={u.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', borderRadius: 10, background: '#f8fafc',
                        marginBottom: 8, fontSize: 17,
                      }}>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{u.name}</span>
                        <button
                          onClick={() => deleteUser(c.id, u.id, u.name)}
                          style={{
                            background: 'none', border: 'none', color: '#ef4444',
                            cursor: 'pointer', padding: '4px 8px',
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}

                  {/* ユーザー追加 */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input
                      className="input-field"
                      style={{ flex: 1, fontSize: 16, padding: '12px 14px' }}
                      value={addUserName}
                      onChange={e => setAddUserName(e.target.value)}
                      placeholder="新しいユーザー名"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUser(c.id); } }}
                    />
                    <button
                      onClick={() => addUser(c.id)}
                      style={{
                        padding: '12px 18px', borderRadius: 12,
                        border: 'none', background: '#2563eb', color: '#fff',
                        fontWeight: 700, fontSize: 16, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Plus size={18} /> 追加
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
