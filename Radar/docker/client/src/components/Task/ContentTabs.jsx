export default function ContentTabs({ tabs, activeTab, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 16, flexShrink: 0 }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-muted)', borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent', transition: 'all 0.15s' }}>
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
