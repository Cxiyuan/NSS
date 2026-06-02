import TaskForm from '../components/TaskForm';
import ProgressPanel from '../components/ProgressPanel';
import LiveResultStream from '../components/LiveResultStream';
import ResultTable from '../components/ResultTable';
import TaskHistory from '../components/TaskHistory';
import { useTaskPage } from '../hooks/useTaskPage';

export default function KeywordSearchPage() {
  const ctx = useTaskPage({ showExternalCount: false, pdfPrefix: 'search-results' });

  return (
    <div className="page">
      <div className="page__main">
        <h2>关键词搜索与爬取</h2>
        <TaskForm type="keyword_search" onSubmit={ctx.handleSubmit} disabled={ctx.status === 'running'} />

        {ctx.taskId && (
          <>
            <div className="page__controls">
              <ProgressPanel status={ctx.status} stats={ctx.stats} />
              {ctx.status === 'running' && <button onClick={ctx.handlePause} className="btn">暂停</button>}
              {ctx.status === 'paused' && <button onClick={ctx.handleResume} className="btn btn--primary">恢复</button>}
              {(ctx.status === 'running' || ctx.status === 'paused') && <button onClick={ctx.handleCancel} className="btn btn--danger">取消</button>}
              {ctx.status === 'completed' && (
                <button onClick={ctx.handleExportPDF} className="btn btn--primary">导出 PDF</button>
              )}
            </div>

            {ctx.logs.length > 0 && (
              <div className="crawl-logs">
                {ctx.logs.map((l, i) => (
                  <div key={i} className={`crawl-logs__entry crawl-logs__entry--${l.level}`}>
                    <span className="crawl-logs__level">{l.level}</span>
                    <span className="crawl-logs__msg">{l.message}</span>
                  </div>
                ))}
              </div>
            )}

            <LiveResultStream results={ctx.liveResults} />

            <h3>探测结果 ({ctx.resultsTotal})</h3>
            <ResultTable
              results={ctx.results}
              total={ctx.resultsTotal}
              page={ctx.page}
              limit={50}
              onPageChange={ctx.handlePageChange}
            />
          </>
        )}
      </div>

      <aside className="page__sidebar">
        <TaskHistory onSelect={ctx.handleSelectTask} refreshKey={ctx.listRefreshKey} />
      </aside>
    </div>
  );
}