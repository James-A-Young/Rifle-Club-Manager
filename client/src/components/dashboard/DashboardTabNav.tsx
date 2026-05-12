import React from 'react';

type Tab = 'operations' | 'ammunition' | 'settings';

interface Props {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}

export default function DashboardTabNav({ activeTab, onChange }: Props) {
  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: '0.75rem 1.5rem',
    border: 'none',
    background: 'transparent',
    borderBottom: activeTab === tab ? '3px solid var(--primary-color, #3b82f6)' : 'none',
    color: activeTab === tab ? 'var(--primary-color, #3b82f6)' : 'var(--gray-600)',
    fontWeight: activeTab === tab ? '600' : '500',
    cursor: 'pointer',
    fontSize: '1rem',
    transition: 'all 0.2s ease',
  });

  const handleMouseEnter = (tab: Tab, e: React.MouseEvent<HTMLButtonElement>) => {
    if (activeTab !== tab) {
      e.currentTarget.style.color = 'var(--gray-800)';
    }
  };

  const handleMouseLeave = (tab: Tab, e: React.MouseEvent<HTMLButtonElement>) => {
    if (activeTab !== tab) {
      e.currentTarget.style.color = 'var(--gray-600)';
    }
  };

  return (
    <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--gray-300)', marginBottom: '2rem' }}>
      <button
        onClick={() => onChange('operations')}
        style={tabStyle('operations')}
        onMouseEnter={e => handleMouseEnter('operations', e)}
        onMouseLeave={e => handleMouseLeave('operations', e)}
      >
        Operations
      </button>
      <button
        onClick={() => onChange('ammunition')}
        style={tabStyle('ammunition')}
        onMouseEnter={e => handleMouseEnter('ammunition', e)}
        onMouseLeave={e => handleMouseLeave('ammunition', e)}
      >
        Ammunition Sales
      </button>
      <button
        onClick={() => onChange('settings')}
        style={tabStyle('settings')}
        onMouseEnter={e => handleMouseEnter('settings', e)}
        onMouseLeave={e => handleMouseLeave('settings', e)}
      >
        Settings
      </button>
    </div>
  );
}
