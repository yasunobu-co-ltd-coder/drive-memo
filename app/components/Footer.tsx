'use client';
import { useEffect, useState } from 'react';
import { PenLine, List } from 'lucide-react';

type Tab = 'memo' | 'view';

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
};

export function Footer({ active, onChange }: Props) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      // キーボードが画面の30%以上を占めたら非表示
      setKeyboardOpen(vv.height < window.innerHeight * 0.7);
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  if (keyboardOpen) return null;

  return (
    <nav className="bottom-nav">
      <button
        className={`nav-item ${active === 'memo' ? 'active' : ''}`}
        onClick={() => onChange('memo')}
      >
        <PenLine size={26} />
        メモ
      </button>
      <button
        className={`nav-item ${active === 'view' ? 'active' : ''}`}
        onClick={() => onChange('view')}
      >
        <List size={26} />
        閲覧
      </button>
    </nav>
  );
}
