import './EmptyState.css';

export default function EmptyState({ onNewTask }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">📡</div>
      <h2 className="empty-state__title">雷达</h2>
      <p className="empty-state__desc">
        Web 爬虫与链接探测工具 — 输入目标 URL 或关键词，自动发现并分析外部链接。
      </p>
      <button onClick={onNewTask} className="empty-state__cta">
        开始新任务
      </button>
      <div className="empty-state__features">
        <div className="empty-state__feature"><strong>外链探测</strong><br/>输入 URL 自动发现外部链接</div>
        <div className="empty-state__feature"><strong>关键词搜索</strong><br/>通过 API 搜索并爬取匹配页</div>
      </div>
    </div>
  );
}
