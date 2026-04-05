'use client';
import { useCallback, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

type DictResult = { company_name: string; reading: string; alias: string[] };

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  withDict?: boolean;          // 会社名辞書サジェストを使うか
  inputClassName?: string;
};

export function VoiceInput({ value, onChange, placeholder, withDict = false, inputClassName }: Props) {
  const [recording, setRecording]   = useState(false);
  const [suggests, setSuggests]     = useState<DictResult[]>([]);
  const recognitionRef              = useRef<SpeechRecognition | null>(null);

  const fetchSuggests = useCallback(async (q: string) => {
    if (!withDict || q.length < 1) return setSuggests([]);
    const res = await fetch(`/api/dict?q=${encodeURIComponent(q)}`);
    const { results } = await res.json();
    setSuggests(results ?? []);
  }, [withDict]);

  const startVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('このブラウザは音声入力に対応していません。Chrome または Safari をご利用ください。');
      return;
    }
    const r = new SR() as SpeechRecognition;
    r.lang = 'ja-JP';
    r.interimResults = false;
    r.maxAlternatives = 1;
    recognitionRef.current = r;

    r.onstart  = () => setRecording(true);
    r.onend    = () => setRecording(false);
    r.onerror  = () => setRecording(false);
    r.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript;
      onChange(text);
      fetchSuggests(text);
    };
    r.start();
  }, [onChange, fetchSuggests]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    setRecording(false);
  }, []);

  return (
    <div>
      <div className="voice-row">
        <input
          className={`input-field ${inputClassName ?? ''}`}
          value={value}
          onChange={e => { onChange(e.target.value); fetchSuggests(e.target.value); }}
          placeholder={placeholder}
        />
        <button
          type="button"
          className={`voice-btn ${recording ? 'recording' : ''}`}
          onPointerDown={startVoice}
          onPointerUp={stopVoice}
          onPointerLeave={stopVoice}
          title="長押しで音声入力"
        >
          {recording ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
      </div>
      {suggests.length > 0 && (
        <div className="suggest-row">
          {suggests.map(s => (
            <button
              key={s.company_name}
              type="button"
              className="suggest-chip"
              onClick={() => { onChange(s.company_name); setSuggests([]); }}
            >
              {s.company_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
