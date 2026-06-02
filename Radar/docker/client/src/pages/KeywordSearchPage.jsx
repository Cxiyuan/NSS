import TaskForm from '../components/TaskForm';
import ProgressPanel from '../components/ProgressPanel';
import LiveResultStream from '../components/LiveResultStream';
import ResultTable from '../components/ResultTable';
import TaskHistory from '../components/TaskHistory';
import TaskControls from '../components/TaskControls';
import TaskInfoPanel from '../components/TaskInfoPanel';
import { useToast } from '../components/ToastContext';
import { useTaskPage } from '../hooks/useTaskPage';
import useConfirm from '../hooks/useConfirm';

export default function KeywordSearchPage() {
  const ctx = useTaskPage({ showExternalCount: false, pdfPrefix: 'search-results' });
  const { confirm, ConfirmDialog } = useConfirm();
  const addToast = useToast();

  async function handleStatusChange(newStatus) {
    if (newStatus === 'cancelled') {
      const ok = await confirm('确定要取消当前任务吗？');
      if (!ok) return;
      await ctx.handleCancel();
    }
  }

  return (
    <div className="page">
      <div className="page__main">
        <h2>关键词搜索与爬取</h2>
        <TaskForm type="keyword_search" onSubmit={ctx.handleSubmit} disabled={ctx.status === 'running'} />

        {ctx.taskId && (
          <>
            <TaskInfoPanel taskConfig={ctx.taskConfig} startTime={ctx.startTime} />

            <div className="page__controls">
              <ProgressPanel status={ctx.status} stats={ctx.stats} />
              <TaskControls
                task={{ id: ctx.taskId, status: ctx.status }}
                onStatusChange={handleStatusChange}
                onExport={ctx.handleExportPDF}
              />
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
              error={ctx.resultsError}
              loading={ctx.loading}
            />
          </>
        )}
      </div>

      <aside className="page__sidebar">
        <TaskHistory onSelect={ctx.handleSelectTask} refreshKey={ctx.listRefreshKey} />
      </aside>

      {ConfirmDialog}
    </div>
  );
}
