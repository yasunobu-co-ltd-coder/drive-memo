'use client';
import { useState, useRef, useCallback } from 'react';
import { Mic, Square, Loader } from 'lucide-react';

type Props = {
  currentUserId: string;
  deviceToken: string;
  onCreated: () => void;
};

const INITIAL = { client_name: '', contact_person: '', memo: '', due_date: '' };

export function MemoTab({ currentUserId, deviceToken, onCreated }: Props) {
  const [form, setForm]           = useState(INITIAL);
  const [saving, setSaving]       = useState(false);
  const [recording, setRecording] = useState(false);
  const [parsing, setParsing]     = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);
  const recRef                    = useRef<any>(null);

  function setField(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  // AIで音声テキストを解析してフォームに反映
  const parseWithAI = useCallback(async (text: string) => {
    setParsing(true);
    try {
      const res = await fetch('/api/parse-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const parsed = await res.json();
      setForm(f => ({
        client_name:    parsed.client_name    || f.client_name,
        contact_person: parsed.contact_person || f.contact_person,
        memo:           parsed.memo           || f.memo,
        due_date:       parsed.due_date       || f.due_date,
      }));
    } catch {
      // AI解析失敗時はメモにそのまま入れる
      setForm(f => ({ ...f, memo: f.memo ? f.memo + '\n' + text : text }));
    } finally {
      setParsing(false);
    }
  }, [deviceToken]);

  // タップで録音開始/停止を切り替え
  const toggleVoice = useCallback(() => {
    if (recording) {
      // 停止
      recRef.current?.stop();
      return;
    }

    // 開始
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Chrome または Safari をお使いください'); return; }
    const r = new SR();
    r.lang = 'ja-JP';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = true;
    recRef.current = r;
    r.onstart  = () => setRecording(true);
    r.onend    = () => setRecording(false);
    r.onerror  = () => setRecording(false);
    r.onresult = (e: any) => {
      // 全結果を結合
      let fullText = '';
      for (let i = 0; i < e.results.length; i++) {
        fullText += e.results[i][0].transcript;
      }
      setVoiceText(fullText);
    };
    r.start();
  }, [recording]);

  // 録音停止後にAI解析を実行
  const handleStopAndParse = useCallback(() => {
    if (recording) {
      recRef.current?.stop();
      // onend 後に voiceText が確定するので少し待つ
      setTimeout(() => {
        setVoiceText(prev => {
          if (prev) parseWithAI(prev);
          return prev;
        });
      }, 300);
    }
  }, [recording, parseWithAI]);

  // タップハンドラ
  const handleMicClick = useCallback(() => {
    if (recording) {
      handleStopAndParse();
    } else {
      toggleVoice();
    }
  }, [recording, handleStopAndParse, toggleVoice]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
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
      setVoiceText('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      onCreated();
    } catch { setError('通信エラーが発生しました'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '28px 22px', flex: 1, overflowY: 'auto' }}>

      {/* マイクボタン（タップで切替） */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
        <button
          type="button"
          onClick={handleMicClick}
          disabled={parsing}
          style={{
            width: 96, height: 96,
            borderRadius: '50%',
            border: 'none',
            background: parsing ? '#94a3b8' : recording ? '#ef4444' : '#2563eb',
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: recording
              ? '0 0 0 14px rgba(239,68,68,.18), 0 6px 20px rgba(239,68,68,.4)'
              : '0 6px 24px rgba(37,99,235,.38)',
            cursor: parsing ? 'wait' : 'pointer',
            transition: 'background .2s, box-shadow .2s',
            animation: recording ? 'pulse 1.5s infinite' : 'none',
          }}
        >
          {parsing ? <Loader size={40} style={{ animation: 'spin .8s linear infinite' }} />
            : recording ? <Square size={32} fill="#fff" />
            : <Mic size={40} />}
        </button>
        <div style={{ marginTop: 14, fontSize: 16, color: '#94a3b8', fontWeight: 600 }}>
          {parsing ? 'AI解析中...' : recording ? '録音中… タップで停止' : 'タップで音声入力'}
        </div>
        {voiceText && (
          <div style={{
            marginTop: 14, padding: '12px 16px',
            background: '#eff6ff', borderRadius: 12,
            fontSize: 15, color: '#1e40af', maxWidth: '100%', textAlign: 'center',
            lineHeight: 1.6,
          }}>
            「{voiceText}」
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
          <label className="input-label" htmlFor="memo-client">会社名</label>
          <input
            id="memo-client"
            name="client_name"
            className="input-field"
            value={form.client_name}
            onChange={e => setField('client_name', e.target.value)}
            placeholder="株式会社〇〇"
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
            placeholder="山田 様"
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
            placeholder="案件の内容、連絡事項など..."
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
          />
        </div>

        <button className="primary-btn" type="submit" disabled={saving || parsing}>
          {saving ? '登録中...' : '登録する'}
        </button>
      </form>
    </div>
  );
}
