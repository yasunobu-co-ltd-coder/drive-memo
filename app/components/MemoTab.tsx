'use client';
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { Mic, Square, Loader, Volume2, Ear, Mail, Sparkles, X, RotateCcw, Calendar } from 'lucide-react';

type Props = {
  currentUserId: string;
  deviceToken: string;
  onCreated: () => void;
  wakeWordEnabled: boolean;
  calConnected: boolean;
};

type FormData = {
  client_name: string;
  contact_person: string;
  memo: string;
  due_date: string;
  due_start_time: string;
  due_end_time: string;
};
const INITIAL: FormData = {
  client_name: '', contact_person: '', memo: '',
  due_date: '', due_start_time: '', due_end_time: '',
};

// ウェイクワード
const WAKE_WORDS = ['メモ', 'めも', 'memo'];

export function MemoTab({ currentUserId, deviceToken, onCreated, wakeWordEnabled, calConnected }: Props) {
  const [form, setForm]           = useState<FormData>(INITIAL);
  const [registerToCalendar, setRegisterToCalendar] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [recording, setRecording] = useState(false);
  const [parsing, setParsing]     = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);

  // 音声編集モード
  const [editMode, setEditMode]       = useState(false);
  const [editStatus, setEditStatus]   = useState('');
  const [correcting, setCorrecting]   = useState(false);

  // ウェイクワード待機
  const [listening, setListening]     = useState(false);

  // 経過秒数（録音中に表示）
  const [elapsed, setElapsed] = useState(0);

  // メール/テキスト貼り付けモード
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // refs
  const mediaRef     = useRef<MediaRecorder | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);      // チャンク間で使い回す
  const mimeTypeRef  = useRef<string>('');                    // 同上
  const speechRef    = useRef<any>(null);
  const cmdRef       = useRef<any>(null);
  const wakeRef      = useRef<any>(null);
  const formRef      = useRef<FormData>(INITIAL);
  const busyRef      = useRef(false); // 録音中・解析中・編集中のフラグ
  const mountedRef   = useRef(true);  // アンマウント検出用

  // ─── 長尺録音のためのチャンク管理 ───
  const CHUNK_SECONDS = 180; // 3分ごとに区切る（iOS 128kbpsでも2.9MBで安全）
  const stopReqRef    = useRef(false);                        // ユーザー停止要求フラグ
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkTextsRef = useRef<Array<string | null>>([]);     // 順番保持（nullは未完了）
  const pendingRef    = useRef<Promise<void>[]>([]);          // 全チャンクの完了待ち
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef  = useRef(0);

  useEffect(() => { formRef.current = form; }, [form]);

  // メモ欄の高さを内容に応じて自動拡張
  const memoRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = memoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [form.memo]);

  function setField(k: keyof FormData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  // ─── Whisper文字起こし ───
  const transcribeWithWhisper = useCallback(async (audioBlob: Blob): Promise<string> => {
    const ext = audioBlob.type.includes('mp4') ? 'm4a' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
    const fd = new FormData();
    fd.append('file', audioBlob, `recording.${ext}`);
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'x-device-token': deviceToken },
      body: fd,
    });
    if (!res.ok) throw new Error('transcribe failed');
    const { text } = await res.json();
    return text ?? '';
  }, [deviceToken]);

  // ─── AI解析（初回） ───
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
      setForm({
        client_name:    parsed.client_name     || '',
        contact_person: parsed.contact_person  || '',
        memo:           parsed.memo            || '',
        due_date:       parsed.due_date        || '',
        due_start_time: parsed.due_start_time  || '',
        due_end_time:   parsed.due_end_time    || '',
      });
    } catch {
      setForm(f => ({ ...f, memo: f.memo ? f.memo + '\n' + text : text }));
    } finally {
      setParsing(false);
    }
  }, [deviceToken]);

  // ─── メール/テキスト貼り付けをAIで解析 ───
  const handleParsePaste = useCallback(async () => {
    const text = pasteText.trim();
    if (!text || parsing) return;
    setError('');
    setDisplayText(text.slice(0, 80) + (text.length > 80 ? '…' : ''));
    await parseWithAI(text);
    // 成功時はペーストUIを閉じてフォームへ誘導
    setPasteText('');
    setShowPaste(false);
  }, [pasteText, parsing, parseWithAI]);

  // ─── AI修正（音声編集モード） ───
  const correctWithAI = useCallback(async (instruction: string) => {
    if (!instruction.trim()) return;
    setCorrecting(true);
    setEditStatus('修正中...');
    try {
      const res = await fetch('/api/correct-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
        body: JSON.stringify({ current: formRef.current, instruction }),
      });
      if (!res.ok) throw new Error('correct failed');
      const { changes } = await res.json();
      if (Object.keys(changes).length > 0) {
        setForm(f => ({ ...f, ...changes }));
        const fields: Record<string, string> = {
          client_name: '会社名', contact_person: '担当者', memo: 'メモ', due_date: '期日',
        };
        const changed = Object.keys(changes).map(k => fields[k] || k).join('・');
        setEditStatus(`✓ ${changed}を修正しました`);
      } else {
        setEditStatus('変更箇所が見つかりませんでした');
      }
    } catch {
      setEditStatus('修正に失敗しました');
    } finally {
      setCorrecting(false);
      setTimeout(() => setEditStatus(''), 2500);
    }
  }, [deviceToken]);

  // ─── 音声編集モード開始 ───
  const startEditMode = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    busyRef.current = true;
    setEditMode(true);
    setEditStatus('');

    const r = new SR();
    r.lang = 'ja-JP';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = true;
    cmdRef.current = r;

    r.onresult = (e: any) => {
      const last = e.results[e.results.length - 1];
      const text = last[0].transcript.trim();
      if (!text) return;

      setEditStatus(`🎤 「${text}」`);

      if (/登録|とうろく|OK|オッケー|おっけー|確定|かくてい/.test(text)) {
        cmdRef.current?.stop();
        cmdRef.current = null;
        setEditMode(false);
        busyRef.current = false;
        document.getElementById('memo-submit')?.click();
        return;
      }
      if (/やり直し|やりなおし|クリア|くりあ|リセット|全部消して/.test(text)) {
        setForm(INITIAL);
        setDisplayText('');
        setEditStatus('✓ クリアしました。続けて話してください');
        setTimeout(() => setEditStatus(''), 2500);
        // 編集モードは維持（登録するまで戻らない）
        return;
      }

      correctWithAI(text);
    };

    r.onend = () => {
      if (!mountedRef.current) return;
      if (cmdRef.current && cmdRef.current === r) {
        try { r.start(); } catch {
          setEditMode(false);
          busyRef.current = false;
        }
      }
    };

    r.onerror = (ev: any) => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') return;
    };

    r.start();
  }, [correctWithAI]);

  function stopEditMode() {
    cmdRef.current?.stop();
    cmdRef.current = null;
    setEditMode(false);
    busyRef.current = false;
    setEditStatus('');
  }

  // ─── Web Speech API（リアルタイム表示用 + 「終了」検知） ───
  function startSpeechPreview() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'ja-JP';
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.continuous = true;
    speechRef.current = r;
    r.onresult = (e: any) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setDisplayText(text);

      // 「停止」「終了」で録音を停止（セッション全体）
      const last = e.results[e.results.length - 1];
      if (last.isFinal) {
        const finalText = last[0].transcript.trim();
        if (/停止|ていし|終了|しゅうりょう|ストップ|おわり|終わり/.test(finalText)) {
          stopRecording();
          r.stop();
          speechRef.current = null;
        }
      }
    };
    r.onend = () => {};
    r.onerror = () => {};
    r.start();
  }

  // ─── 録音セッション全体の後処理 ───
  const finalizeRecording = useCallback(async () => {
    if (!mountedRef.current) return;
    setRecording(false);

    // ストリーム停止（全チャンク録音終了後）
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    // 経過時間タイマー停止
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    // 全チャンクの文字起こし完了待ち
    setParsing(true);
    setDisplayText('文字起こし中...');
    try {
      await Promise.all(pendingRef.current);
    } catch { /* 個別チャンクの失敗は下で処理 */ }

    if (!mountedRef.current) return;
    const fullText = chunkTextsRef.current
      .map(t => t ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!fullText) {
      setParsing(false);
      busyRef.current = false;
      startWakeListener();
      return;
    }

    setDisplayText(fullText);
    try {
      await parseWithAI(fullText);
      if (!mountedRef.current) return;
      startEditMode();
    } catch {
      if (!mountedRef.current) return;
      setError('AI解析に失敗しました');
      setParsing(false);
      busyRef.current = false;
      startWakeListener();
    }
  }, [parseWithAI, startEditMode]);

  // ─── 1チャンク分のMediaRecorderを起動 ───
  const startChunk = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = mimeTypeRef.current;
    const mr = new MediaRecorder(
      stream,
      // 32kbpsはWhisperが音声認識するのに十分な品質。iOS Safariは無視する可能性あり
      mimeType
        ? { mimeType, audioBitsPerSecond: 32000 }
        : { audioBitsPerSecond: 32000 },
    );
    mediaRef.current = mr;
    const localChunks: Blob[] = [];
    const idx = chunkTextsRef.current.length;
    chunkTextsRef.current.push(null); // 順番確保用プレースホルダ

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) localChunks.push(e.data);
    };

    mr.onstop = () => {
      if (chunkTimerRef.current) {
        clearTimeout(chunkTimerRef.current);
        chunkTimerRef.current = null;
      }

      const actualType = mr.mimeType || 'audio/webm';
      const blob = new Blob(localChunks, { type: actualType });

      if (blob.size >= 1000) {
        // 文字起こしをバックグラウンドで実行（次のチャンク録音を待たせない）
        const p = transcribeWithWhisper(blob)
          .then(text => { chunkTextsRef.current[idx] = text; })
          .catch(() => { chunkTextsRef.current[idx] = ''; });
        pendingRef.current.push(p);
      } else {
        chunkTextsRef.current[idx] = '';
      }

      // ユーザー停止済みなら最終処理、そうでなければ次のチャンクを開始
      if (stopReqRef.current) {
        finalizeRecording();
      } else {
        startChunk();
      }
    };

    mr.start();
    // CHUNK_SECONDS経過で自動ローテ
    chunkTimerRef.current = setTimeout(() => {
      if (mediaRef.current === mr && mr.state === 'recording' && !stopReqRef.current) {
        mr.stop();
      }
    }, CHUNK_SECONDS * 1000);
  }, [transcribeWithWhisper, finalizeRecording]);

  // ─── 録音開始（チャンク分割対応） ───
  const startRecording = useCallback(async () => {
    busyRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // iOS Safari: audio/webm未対応 → audio/mp4を使用
      mimeTypeRef.current = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      // セッション状態をリセット
      stopReqRef.current      = false;
      chunkTextsRef.current   = [];
      pendingRef.current      = [];

      setDisplayText('');
      setError('');
      setRecording(true);
      setElapsed(0);

      // 経過時間タイマー（UI表示用）
      startedAtRef.current = Date.now();
      elapsedTimerRef.current = setInterval(() => {
        if (mountedRef.current) {
          setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
        }
      }, 1000);

      startChunk();
      startSpeechPreview();
    } catch {
      setError('マイクの使用が許可されていません');
      busyRef.current = false;
    }
  }, [startChunk]);

  // ─── ユーザーによる録音停止 ───
  const stopRecording = useCallback(() => {
    stopReqRef.current = true;
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    const mr = mediaRef.current;
    if (mr && mr.state === 'recording') {
      mr.stop(); // onstopでstopReqRef=true判定→finalize
    }
  }, []);

  // ─── ウェイクワード待機 ───
  const startWakeListener = useCallback(() => {
    // 設定でOFFならマイクを起動しない（権限確認ダイアログ・ピコ音を抑止）
    if (!wakeWordEnabled) { setListening(false); return; }
    // 既に録音中・解析中・編集中なら開始しない
    if (busyRef.current) return;

    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    // 既存のウェイクリスナーを停止
    wakeRef.current?.stop();

    const r = new SR();
    r.lang = 'ja-JP';
    r.interimResults = false;
    r.maxAlternatives = 3;
    r.continuous = true;
    wakeRef.current = r;

    r.onstart = () => setListening(true);

    r.onresult = (e: any) => {
      const last = e.results[e.results.length - 1];
      // 複数候補からウェイクワードを検出
      for (let i = 0; i < last.length; i++) {
        const text = last[i].transcript.trim();
        if (WAKE_WORDS.some(w => text.includes(w))) {
          // ウェイクワード検出 → 録音開始
          r.stop();
          wakeRef.current = null;
          setListening(false);
          startRecording();
          return;
        }
      }
    };

    r.onend = () => {
      // アンマウント済みなら何もしない
      if (!mountedRef.current) return;
      // ウェイクリスナーが有効 & busyでなければ自動再開
      if (wakeRef.current && wakeRef.current === r && !busyRef.current) {
        try { r.start(); } catch { setListening(false); }
      } else {
        setListening(false);
      }
    };

    r.onerror = (ev: any) => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') return;
      // 権限エラー等はリトライしない
      if (ev.error === 'not-allowed') {
        setListening(false);
        wakeRef.current = null;
      }
    };

    r.start();
  }, [startRecording, wakeWordEnabled]);

  // 設定トグルのライブ反映：ONにしたら待機開始、OFFにしたら停止
  useEffect(() => {
    if (!mountedRef.current) return;
    if (wakeWordEnabled) {
      if (!busyRef.current) startWakeListener();
    } else {
      wakeRef.current?.stop();
      wakeRef.current = null;
      setListening(false);
    }
  }, [wakeWordEnabled, startWakeListener]);

  function stopWakeListener() {
    wakeRef.current?.stop();
    wakeRef.current = null;
    setListening(false);
  }

  // ─── アンマウント時のクリーンアップ（真のunmountだけで実行） ───
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (chunkTimerRef.current)   { clearTimeout(chunkTimerRef.current);    chunkTimerRef.current = null; }
      if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
      stopReqRef.current = true;
      wakeRef.current?.stop();
      wakeRef.current = null;
      try { mediaRef.current?.stop(); } catch {}
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      speechRef.current?.stop?.();
      cmdRef.current?.stop?.();
      cmdRef.current = null;
    };
  }, []);

  // ─── マウント時にウェイクワード待機を開始（トグル変更で再実行OK） ───
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!busyRef.current) startWakeListener();
    }, 1000);
    return () => clearTimeout(timer);
  }, [startWakeListener]);

  // ─── 登録完了後にウェイクワード待機に戻る ───
  const handleSubmitAndResume = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return; // 多重送信防止（音声「登録」コマンドの連続発火対策）
    setError('');
    stopEditMode();
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
          assignment_type: '自分で',
          assignee:        currentUserId,
          status:          '対応中',
          register_to_calendar: registerToCalendar && !!form.due_date && calConnected,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? '登録失敗'); return; }
      setForm(INITIAL);
      setRegisterToCalendar(false);
      setDisplayText('');
      setSuccess(true);
      setTimeout(() => {
        if (!mountedRef.current) return;
        setSuccess(false);
        // 登録完了後にウェイクワード待機に戻る
        startWakeListener();
      }, 2500);
      onCreated();
    } catch { setError('通信エラーが発生しました'); }
    finally { setSaving(false); }
  }, [form, deviceToken, currentUserId, onCreated, startWakeListener, saving, registerToCalendar, calConnected]);

  // ─── クリア（登録せずに全フィールドをリセット） ───
  const handleReset = useCallback(() => {
    const hasInput =
      form.client_name || form.contact_person || form.memo ||
      form.due_date || form.due_start_time || form.due_end_time || displayText;
    if (!hasInput) return;
    if (!confirm('入力内容をすべてクリアしますか？')) return;
    // 録音・音声編集中なら停止
    if (recording) {
      stopRecording();
      speechRef.current?.stop();
      speechRef.current = null;
    }
    if (editMode) stopEditMode();
    setForm(INITIAL);
    setRegisterToCalendar(false);
    setDisplayText('');
    setError('');
  }, [form, displayText, recording, editMode]);

  // ─── マイクタップ ───
  const handleMicClick = useCallback(async () => {
    if (parsing || correcting) return;

    if (editMode) {
      stopEditMode();
      // 手動編集に切り替え（ウェイク待機には戻さない）
      return;
    }

    if (recording) {
      stopRecording();
      speechRef.current?.stop();
      speechRef.current = null;
      return;
    }

    // 待機中 → 録音開始
    stopWakeListener();
    startRecording();
  }, [recording, parsing, correcting, editMode, startRecording, stopRecording, startWakeListener]);

  // ─── ボタン表示 ───
  const micBg = editMode ? '#10b981'
    : correcting ? '#f59e0b'
    : parsing ? '#94a3b8'
    : recording ? '#ef4444'
    : listening ? '#6366f1'
    : '#2563eb';
  const micShadow = editMode
    ? '0 0 0 14px rgba(16,185,129,.18), 0 6px 20px rgba(16,185,129,.4)'
    : recording
    ? '0 0 0 14px rgba(239,68,68,.18), 0 6px 20px rgba(239,68,68,.4)'
    : listening
    ? '0 0 0 14px rgba(99,102,241,.15), 0 6px 20px rgba(99,102,241,.3)'
    : '0 6px 24px rgba(37,99,235,.38)';
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const micLabel = editMode
    ? '音声で修正できます'
    : correcting ? '修正を反映中...'
    : parsing ? 'Whisper解析中...'
    : recording ? `録音中 ${mmss(elapsed)} … タップで停止`
    : listening ? '「メモ」と言うと録音開始'
    : 'タップで音声入力';

  return (
    <div style={{ padding: '28px 22px', flex: 1, overflowY: 'auto' }}>

      {/* マイクボタン */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
        <button
          type="button"
          onClick={handleMicClick}
          disabled={parsing || correcting}
          style={{
            width: 96, height: 96,
            borderRadius: '50%',
            border: 'none',
            background: micBg,
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: micShadow,
            cursor: (parsing || correcting) ? 'wait' : 'pointer',
            transition: 'background .2s, box-shadow .2s',
            animation: (recording || editMode) ? 'pulse 1.5s infinite'
              : listening ? 'pulse 2s infinite' : 'none',
          }}
        >
          {(parsing || correcting) ? <Loader size={40} style={{ animation: 'spin .8s linear infinite' }} />
            : editMode ? <Volume2 size={40} />
            : recording ? <Square size={32} fill="#fff" />
            : listening ? <Ear size={40} />
            : <Mic size={40} />}
        </button>
        <div style={{
          marginTop: 14, fontSize: 16, fontWeight: 600,
          color: editMode ? '#10b981' : listening ? '#6366f1' : '#94a3b8',
        }}>
          {micLabel}
        </div>

        {/* 音声編集モード：ガイド */}
        {editMode && !editStatus && (
          <div style={{
            marginTop: 10, padding: '10px 16px',
            background: '#ecfdf5', borderRadius: 12,
            fontSize: 14, color: '#065f46', textAlign: 'center',
            lineHeight: 1.8,
          }}>
            修正例：「担当者は佐々木さん」「期日は今週金曜」<br />
            「<b>登録</b>」で送信　「<b>やり直し</b>」でクリア<br />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>マイクタップで手動編集に戻る</span>
          </div>
        )}

        {/* 修正ステータス */}
        {editStatus && (
          <div style={{
            marginTop: 10, padding: '10px 16px',
            background: editStatus.startsWith('✓') ? '#ecfdf5' : '#eff6ff',
            borderRadius: 12, fontSize: 15, fontWeight: 600,
            color: editStatus.startsWith('✓') ? '#065f46' : '#1e40af',
            textAlign: 'center',
          }}>
            {editStatus}
          </div>
        )}

        {/* 録音中テキスト */}
        {!editMode && displayText && (
          <div style={{
            marginTop: 14, padding: '12px 16px',
            background: '#eff6ff', borderRadius: 12,
            fontSize: 15, color: '#1e40af', maxWidth: '100%', textAlign: 'center',
            lineHeight: 1.6,
          }}>
            「{displayText}」
          </div>
        )}

        {/* メール/テキストから作成 */}
        {!recording && !editMode && !parsing && !correcting && (
          <div style={{ marginTop: 18, width: '100%' }}>
            {!showPaste ? (
              <button
                type="button"
                onClick={() => setShowPaste(true)}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12,
                  border: '1.5px dashed #cbd5e1', background: '#fafcff',
                  color: '#64748b', fontWeight: 600, fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Mail size={16} /> メール・テキストから作成
              </button>
            ) : (
              <div style={{
                padding: 14, borderRadius: 14,
                border: '1.5px solid #e2e8f0', background: '#fafcff',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 10,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 14, fontWeight: 700, color: '#334155',
                  }}>
                    <Mail size={16} /> メール・テキストから作成
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowPaste(false); setPasteText(''); }}
                    style={{
                      background: 'none', border: 'none', color: '#94a3b8',
                      cursor: 'pointer', padding: 4,
                    }}
                  ><X size={18} /></button>
                </div>
                <textarea
                  id="paste-memo-source"
                  name="paste_text"
                  aria-label="メール・テキスト本文"
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="メール本文や会話メモをここに貼り付けてください。AIが会社名・担当者・要点・期日を抽出します。"
                  style={{
                    width: '100%', minHeight: 120, padding: '12px 14px',
                    borderRadius: 10, border: '1.5px solid #e2e8f0',
                    fontSize: 15, lineHeight: 1.6, background: '#fff',
                    boxSizing: 'border-box', resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={handleParsePaste}
                  disabled={!pasteText.trim() || parsing}
                  style={{
                    width: '100%', marginTop: 10, padding: '13px',
                    borderRadius: 12, border: 'none',
                    background: pasteText.trim() && !parsing ? '#2563eb' : '#cbd5e1',
                    color: '#fff', fontWeight: 700, fontSize: 16,
                    cursor: pasteText.trim() && !parsing ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Sparkles size={18} /> {parsing ? 'AI解析中...' : 'AIで解析してフォームに反映'}
                </button>
              </div>
            )}
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

      <form onSubmit={handleSubmitAndResume}>
        <div className="form-group">
          <label className="input-label" htmlFor="memo-client">会社名</label>
          <input
            id="memo-client"
            name="client_name"
            className="input-field"
            value={form.client_name}
            onChange={e => setField('client_name', e.target.value)}
            placeholder={parsing ? '解析中...' : '株式会社〇〇'}
            readOnly={parsing}
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
            ref={memoRef}
            id="memo-text"
            name="memo"
            className="input-field"
            value={form.memo}
            onChange={e => setField('memo', e.target.value)}
            placeholder={parsing ? '音声内容を解析しています...' : '案件の内容、連絡事項など...'}
            readOnly={parsing}
            style={{ resize: 'none', overflow: 'hidden' }}
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

        <div className="form-group">
          <div id="memo-time-group-label" className="input-label">時間（任意）</div>
          <div role="group" aria-labelledby="memo-time-group-label" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              id="memo-start-time"
              name="due_start_time"
              aria-label="開始時刻"
              className="input-field"
              type="time"
              style={{ flex: 1 }}
              value={form.due_start_time}
              onChange={e => setField('due_start_time', e.target.value)}
              readOnly={parsing}
            />
            <span style={{ color: '#94a3b8', fontSize: 18, fontWeight: 600 }}>〜</span>
            <input
              id="memo-end-time"
              name="due_end_time"
              aria-label="終了時刻"
              className="input-field"
              type="time"
              style={{ flex: 1 }}
              value={form.due_end_time}
              onChange={e => setField('due_end_time', e.target.value)}
              readOnly={parsing}
            />
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>
            未入力なら朝8:00に通知。開始だけ入れると終了は自動で1時間後になります。
          </div>
        </div>

        {/* Googleカレンダー登録セクション（連携済みの時だけ表示） */}
        {calConnected && (
          <div style={{
            marginBottom: 14, padding: '12px 14px',
            background: '#fafcff', border: '1.5px solid #e2e8f0', borderRadius: 12,
          }}>
            <label
              htmlFor="register-to-calendar"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: form.due_date ? 'pointer' : 'not-allowed',
                opacity: form.due_date ? 1 : 0.55,
              }}
            >
              <input
                id="register-to-calendar"
                type="checkbox"
                checked={registerToCalendar && !!form.due_date}
                disabled={!form.due_date}
                onChange={e => setRegisterToCalendar(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: '#2563eb', flexShrink: 0 }}
              />
              <Calendar size={18} style={{ color: '#2563eb', flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: '#334155' }}>
                Googleカレンダーにも登録する
              </span>
            </label>
            {!form.due_date && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, paddingLeft: 30 }}>
                期日を入力すると登録できます
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || parsing}
            aria-label="入力内容をクリア"
            style={{
              padding: '14px 18px', borderRadius: 14,
              border: '1.5px solid #e2e8f0', background: '#fff',
              color: '#64748b', fontWeight: 700, fontSize: 16,
              cursor: (saving || parsing) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              flexShrink: 0, opacity: (saving || parsing) ? 0.5 : 1,
            }}
          >
            <RotateCcw size={18} /> クリア
          </button>
          <button
            id="memo-submit"
            className="primary-btn"
            type="submit"
            disabled={saving || parsing}
            style={{ flex: 1 }}
          >
            {saving ? '登録中...' : '登録する'}
          </button>
        </div>
      </form>
    </div>
  );
}
