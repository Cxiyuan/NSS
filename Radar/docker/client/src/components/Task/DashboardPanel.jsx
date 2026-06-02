import { useRef, useEffect, useState } from 'react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

const COLORS = [
  'rgba(37, 99, 235, 0.8)', 'rgba(59, 130, 246, 0.7)',
  'rgba(96, 165, 250, 0.6)', 'rgba(147, 197, 253, 0.5)',
  'rgba(191, 219, 254, 0.4)', 'rgba(226, 232, 240, 0.3)',
];

function BarChart({ data, label, valueLabel, loading }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');
    const bgColors = data.map((_, i) => COLORS[i % COLORS.length]);
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.domain ?? d.url),
        datasets: [{ label, data: data.map(d => d.count), backgroundColor: bgColors, borderColor: 'rgba(37, 99, 235, 1)', borderWidth: 1, borderRadius: 3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} ${valueLabel}` } } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { ticks: { font: { size: 11 } } } },
      },
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, label, valueLabel]);

  return (
    <div className="dc-body">
      {loading ? <p className="dc-empty">加载中...</p> : data.length === 0 ? <p className="dc-empty">暂无数据</p> : null}
      <canvas ref={canvasRef} style={{ display: data.length > 0 ? 'block' : 'none', height: Math.max(200, Math.min(data.length * 32, 500)) }} />
    </div>
  );
}

export default function DashboardPanel({ topDomains = [], topUrls = [], loading = false }) {
  return (
    <div className="dc-grid">
      <div className="dc-card">
        <div className="dc-card__header">外链域名排名</div>
        <BarChart data={topDomains} label="外链数" valueLabel="条外链" loading={loading} />
      </div>
      <div className="dc-card">
        <div className="dc-card__header">外链 URL 排名</div>
        <BarChart data={topUrls} label="引用数" valueLabel="次引用" loading={loading} />
      </div>
    </div>
  );
}
