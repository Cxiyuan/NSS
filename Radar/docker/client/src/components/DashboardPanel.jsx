import { useRef, useEffect, useState, useCallback } from 'react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Colors } from 'chart.js';
import { api } from '../lib/api';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Colors);

const LIMIT_OPTIONS = [5, 10, 20, 50];

function useChartData(taskId, fetcher, limit) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    setLoading(true);
    fetcher(taskId, limit)
      .then(rows => { if (!cancelled) setData(rows || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, limit, fetcher]);

  return { data, loading };
}

function BarChart({ data, label, valueLabel, loading }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.domain ?? d.url),
        datasets: [{
          label,
          data: data.map(d => d.count),
          backgroundColor: [
            'rgba(37, 99, 235, 0.8)',
            'rgba(59, 130, 246, 0.7)',
            'rgba(96, 165, 250, 0.6)',
            'rgba(147, 197, 253, 0.5)',
            'rgba(191, 219, 254, 0.4)',
            'rgba(226, 232, 240, 0.3)',
          ],
          borderColor: 'rgba(37, 99, 235, 1)',
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.parsed.x} ${valueLabel}`,
            },
          },
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { ticks: { font: { size: 11 } } },
        },
      },
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, label, valueLabel]);

  return (
    <div className="dashboard-chart__body">
      {loading ? (
        <p className="dashboard-chart__empty">加载中...</p>
      ) : data.length === 0 ? (
        <p className="dashboard-chart__empty">暂无数据</p>
      ) : null}
      <canvas
        ref={canvasRef}
        style={{
          display: data.length > 0 ? 'block' : 'none',
          height: Math.max(200, Math.min(data.length * 32, 500)),
        }}
      />
    </div>
  );
}

function TopDomainsChart({ taskId }) {
  const [limit, setLimit] = useState(5);
  const fetcher = useCallback((id, n) => api.getTopDomains(id, n), []);
  const { data, loading } = useChartData(taskId, fetcher, limit);

  return (
    <div className="dashboard-chart">
      <div className="dashboard-chart__header">
        <span>外链域名排名</span>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))}>
          {LIMIT_OPTIONS.map(n => <option key={n} value={n}>前{n}</option>)}
        </select>
      </div>
      <BarChart data={data} label="外链数" valueLabel="条外链" loading={loading} />
    </div>
  );
}

function TopUrlsChart({ taskId }) {
  const [limit, setLimit] = useState(5);
  const fetcher = useCallback((id, n) => api.getTopUrls(id, n), []);
  const { data, loading } = useChartData(taskId, fetcher, limit);

  return (
    <div className="dashboard-chart">
      <div className="dashboard-chart__header">
        <span>外链 URL 排名（被多次引用）</span>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))}>
          {LIMIT_OPTIONS.map(n => <option key={n} value={n}>前{n}</option>)}
        </select>
      </div>
      <BarChart data={data} label="引用数" valueLabel="次引用" loading={loading} />
    </div>
  );
}

export default function DashboardPanel({ taskId }) {
  if (!taskId) return null;

  return (
    <div className="dashboard">
      <h3>外链统计仪表盘</h3>
      <div className="dashboard__grid">
        <TopDomainsChart taskId={taskId} />
        <TopUrlsChart taskId={taskId} />
      </div>
    </div>
  );
}