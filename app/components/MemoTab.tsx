'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader, Volume2 } from 'lucide-react';

type Props = {
  currentUserId: string;
  deviceToken: string;
  onCreated: () => void;
};

type CorpHit = { name: string; furi: string };

const INITIAL = { client_name: '', contact_person: '', memo: '', due_date: '' };

export function MemoTab({ currentUserId, deviceToken, onCreated }: Props) {
  const [form, setForm]           = useState(INITIAL);
  const [saving, setSaving]       = useState(false);
  const [recording, setRecording] = useState(false);
  const [parsing, setParsing]     = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);

  // ボイスコマンドモード
  const [cmdMode, setCmdMode]         = useState(false);
  const [cmdText, setCmdText]         = useState('');    // コマンド認識テキスト
  const [corpHits, setCorpHits]       = useState<CorpHit[]>([]);
  const [corpIndex, setCorpIndex]     = useState(0);

  const recRef      = useRef<any>(null);
  const cmdRef      = useRef<any>(null);
  const textRef     = useRef('');

  function setField(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  // ─── 法人辞書検索 ───
  const searchCorp = useCallback(async (text: string): Promise<CorpHit[]> => {
    const firstPart = text.split(/[のにはをでがとへ、。]/)[0]?.trim() ?? '';
    if (firstPart.length < 2) return [];
    try {
      const res = await fetch(`/api/corp-search?q=${encodeURIComponent(firstPart)}`);
      const data = await res.json();
      return data.results ?? [];
    } catch { return []; }
  }, []);

  // ─── AIで音声テキストを解析 ───
  const parseWithAI = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const res = await fetch('/api/parse-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('parse failed');
      const parsed = await res.json();
      setForm(f => ({
        client_name:    parsed.client_name    || f.client_name,
        contact_person: parsed.contact_person || f.contact_person,
        memo:           parsed.memo           || f.memo,
        due_date:       parsed.due_date       || f.due_date,
      }));
    } catch {
      setForm(f => ({ ...f, memo: f.memo ? f.memo + '\n' + text : text }));
    } finally {
      setParsing(false);
    }
  }, [deviceToken]);

  // ─── ボイスコマンドモード開始 ───
  const startCmdMode = useCallback((hits: CorpHit[]) => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setCmdMode(true);
    setCmdText('');
    setCorpHits(hits);
    setCorpIndex(0);

    // 最初の候補を会社名に入れる（あれば）
    if (hits.length > 0) {
      setForm(f => ({ ...f, client_name: hits[0].name }));
    }

    const r = new SR();
    r.lang = 'ja-JP';
    r.interimResults = false;
    r.maxAlternatives = 3;
    r.continuous = true;
    cmdRef.current = r;

    r.onresult = (e: any) => {
      const last = e.results[e.results.length - 1];
      // 複数候補をチェック（認識精度向上）
      const candidates: string[] = [];
      for (let i = 0; i < last.length; i++) {
        candidates.push(last[i].transcript.trim());
      }
      const text = candidates[0];
      setCmdText(text);

      // コマンド判定（候補のどれかにマッチすればOK）
      const matchAny = (keywords: string[]) =>
        candidates.some(c => keywords.some(k => c.includes(k)));

      if (matchAny(['次', 'つぎ', '次の', 'つぎの'])) {
        setCorpIndex(prev => {
          const next = prev + 1;
          if (next < hits.length) {
            setForm(f => ({ ...f, client_name: hits[next].name }));
            return next;
          }
          return prev; // 最後なら動かない
        });
      } else if (matchAny(['戻る', 'もどる', '前', 'まえ'])) {
        setCorpIndex(prev => {
          const next = prev - 1;
          if (next >= 0) {
            setForm(f => ({ ...f, client_name: hits[next].name }));
            return next;
          }
          return prev;
        });
      } else if (matchAny(['登録', 'とうろく', 'OK', 'オッケー', 'おっけー', '確定', 'かくてい'])) {
        // 登録実行
        cmdRef.current?.stop();
        setCmdMode(false);
        // submitをトリガー
        document.getElementById('memo-submit')?.click();
      } else if (matchAny(['やり直し', 'やりなおし', 'クリア', 'くりあ', 'リセット'])) {
        cmdRef.current?.stop();
        setCmdMode(false);
        setForm(INITIAL);
        setDisplayText('');
        setCorpHits([]);
        setCorpIndex(0);
      }
    };

    r.onend = () => {
      // コマンドモード中なら自動再開（途切れ防止）
      if (cmdRef.current && cmdRef.current === r) {
        try { r.start(); } catch { setCmdMode(false); }
      }
    };

    r.onerror = (ev: any) => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') return;
      console.warn('cmd recognition error:', ev.error);
    };

    r.start();
  }, []);

  // ─── コマンドモード停止 ───
  function stopCmdMode() {
    cmdRef.current?.stop();
    cmdRef.current = null;
    setCmdMode(false);
    setCmdText('');
  }

  // ─── メモ録音 開始/停止 ───
  const handleMicClick = useCallback(() => {
    if (parsing) return;

    // コマンドモード中にタップ → コマンドモード終了
    if (cmdMode) {
      stopCmdMode();
      return;
    }

    if (recording) {
      recRef.current?.stop();
      return;
    }

    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Chrome または Safari をお使いください'); return; }

    const r = new SR();
    r.lang = 'ja-JP';
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.continuous = true;
    recRef.current = r;

    textRef.current = '';
    setDisplayText('');
    setCorpHits([]);
    setCorpIndex(0);

    r.onstart = () => setRecording(true);

    r.onresult = (e: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      textRef.current = finalText;
      setDisplayText(finalText + interimText);
    };

    r.onend = () => {
      setRecording(false);
      const captured = textRef.current;
      if (!captured.trim()) return;

      // AI解析と法人辞書検索を並列実行
      const aiPromise = parseWithAI(captured);
      const corpPromise = searchCorp(captured);

      // 両方完了したらコマンドモード開始
      Promise.all([aiPromise, corpPromise]).then(([, hits]) => {
        startCmdMode(hits);
      });
    };

    r.onerror = (ev: any) => {
      if (ev.error !== 'no-speech') {
        console.warn('SpeechRecognition error:', ev.error);
      }
      setRecording(false);
    };

    r.start();
  }, [recording, parsing, cmdMode, parseWithAI, searchCorp, startCmdMode]);

  useEffect(() => {
    return () => {
      recRef.current?.abort?.();
      cmdRef.current?.stop?.();
      cmdRef.current = null;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    stopCmdMode();
    if (!form.client_name.trim() && !form.memo.trim()) {
      return setError('会社名またはメモを入力してください');
    }
    setSaving(true);
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
        body: JSON.stringify({
          ...form,
          due_date:        form.due_date || null,
          importance:      'mid',
          assignment_type: '自分で',
          assignee:        currentUserId,
          status:          '未着手',
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? '登録失敗'); return; }
      setForm(INITIAL);
      setDisplayText('');
      setCorpHits([]);
      setCorpIndex(0);
      textRef.current = '';
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      onCreated();
    } catch { setError('通信エラーが発生しました'); }
    finally { setSaving(false); }
  }

  // ─── マイクボタンの状態 ───
  const micBg = cmdMode ? '#10b981' : parsing ? '#94a3b8' : recording ? '#ef4444' : '#2563eb';
  const micShadow = cmdMode
    ? '0 0 0 14px rgba(16,185,129,.18), 0 6px 20px rgba(16,185,129,.4)'
    : recording
    ? '0 0 0 14px rgba(239,68,68,.18), 0 6px 20px rgba(239,68,68,.4)'
    : '0 6px 24px rgba(37,99,235,.38)';
  const micLabel = cmdMode
    ? '音声コマンド待機中'
    : parsing ? 'AI解析中...'
    : recording ? '録音中… タップで停止'
    : 'タップで音声入力';

  return (
    <div style={{ padding: '28px 22px', flex: 1, overflowY: 'auto' }}>

      {/* マイクボタン */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
        <button
          type="button"
          onClick={handleMicClick}
          disabled={parsing}
          style={{
            width: 96, height: 96,
            borderRadius: '50%',
            border: 'none',
            background: micBg,
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: micShadow,
            cursor: parsing ? 'wait' : 'pointer',
            transition: 'background .2s, box-shadow .2s',
            animation: (recording || cmdMode) ? 'pulse 1.5s infinite' : 'none',
          }}
        >
          {parsing ? <Loader size={40} style={{ animation: 'spin .8s linear infinite' }} />
            : cmdMode ? <Volume2 size={40} />
            : recording ? <Square size={32} fill="#fff" />
            : <Mic size={40} />}
        </button>
        <div style={{ marginTop: 14, fontSize: 16, color: cmdMode ? '#10b981' : '#94a3b8', fontWeight: 600 }}>
          {micLabel}
        </div>

        {/* コマンドモード：使い方ガイド */}
        {cmdMode && (
          <div style={{
            marginTop: 10, padding: '10px 16px',
            background: '#ecfdf5', borderRadius: 12,
            fontSize: 14, color: '#065f46', textAlign: 'center',
            lineHeight: 1.8,
          }}>
            「<b>次</b>」→ 次の候補　「<b>戻る</b>」→ 前の候補<br />
            「<b>登録</b>」→ 送信　「<b>やり直し</b>」→ クリア
          </div>
        )}

        {/* コマンド認識テキスト */}
        {cmdMode && cmdText && (
          <div style={{
            marginTop: 8, fontSize: 14, color: '#10b981', fontWeight: 600,
          }}>
            🎤 「{cmdText}」
          </div>
        )}

        {/* 音声テキスト表示 */}
        {!cmdMode && displayText && (
          <div style={{
            marginTop: 14, padding: '12px 16px',
            background: '#eff6ff', borderRadius: 12,
            fontSize: 15, color: '#1e40af', maxWidth: '100%', textAlign: 'center',
            lineHeight: 1.6,
          }}>
            「{displayText}」
          </div>
        )}
      </div>

      {error   && <div className="error-msg">{error}</div>}
      {success && (
        <div style={{
          background: '#d1fae5', color: '#065f46',
          padding: '18px', borderRadius: 14, marginBottom: 24,
          fontWeight: 700, fontSize: 20, textAlign: 'center',
        }}>登録しました</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="input-label" htmlFor="memo-client">
            会社名
            {corpHits.length > 0 && (
              <span style={{ fontWeight: 500, fontSize: 13, color: '#94a3b8', marginLeft: 8 }}>
                候補 {corpIndex + 1}/{corpHits.length}
              </span>
            )}
          </label>
          <input
            id="memo-client"
            name="client_name"
            className="input-field"
            value={form.client_name}
            onChange={e => setField('client_name', e.target.value)}
            placeholder={parsing ? '解析中...' : '株式会社〇〇'}
            readOnly={parsing}
            style={corpHits.length > 0 ? { borderColor: '#10b981', background: '#f0fdf4' } : undefined}
          />
        </div>

        <div className="form-group">
          <label className="input-label" htmlFor="memo-contact">担当者</label>
          <input
            id="memo-contact"
            name="contact_person"
            className="input-field"
            value={form.contact_person}
            onChange={e => setField('contact_person', e.target.value)}
            placeholder={parsing ? '解析中...' : '山田 様'}
            readOnly={parsing}
          />
        </div>

        <div className="form-group">
          <label className="input-label" htmlFor="memo-text">メモ</label>
          <textarea
            id="memo-text"
            name="memo"
            className="input-field"
            value={form.memo}
            onChange={e => setField('memo', e.target.value)}
            placeholder={parsing ? '音声内容を解析しています...' : '案件の内容、連絡事項など...'}
            readOnly={parsing}
          />
        </div>

        <div className="form-group">
          <label className="input-label" htmlFor="memo-due">期日</label>
          <input
            id="memo-due"
            name="due_date"
            className="input-field"
            type="date"
            value={form.due_date}
            onChange={e => setField('due_date', e.target.value)}
            readOnly={parsing}
          />
        </div>

        <button id="memo-submit" className="primary-btn" type="submit" disabled={saving || parsing}>
          {saving ? '登録中...' : '登録する'}
        </button>
      </form>
    </div>
  );
}
