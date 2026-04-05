'use client';
import { PenLine, List } from 'lucide-react';

type Tab = 'memo' | 'view';

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
};

export function Footer({ active, onChange }: Props) {
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
