export default function KpiCard({ label, value, subtitle, color }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '16px 20px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--color-text)' }}>{value}</div>
      {subtitle && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}
