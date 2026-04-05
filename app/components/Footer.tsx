'use client';

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
        <span className="nav-icon">✏️</span>
        メモ
      </button>
      <button
        className={`nav-item ${active === 'view' ? 'active' : ''}`}
        onClick={() => onChange('view')}
      >
        <span className="nav-icon">📋</span>
        閲覧
      </button>
    </nav>
  );
}
