export default function TaskControls({ status, onPause, onResume, onCancel, onExportPDF }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {status === 'running' && (
        <button onClick={onPause} className="btn">暂停</button>
      )}
      {status === 'paused' && (
        <button onClick={onResume} className="btn btn--primary">恢复</button>
      )}
      {(status === 'running' || status === 'paused') && (
        <button onClick={onCancel} className="btn btn--danger">取消</button>
      )}
      {status === 'completed' && onExportPDF && (
        <button onClick={onExportPDF} className="btn btn--primary">导出 PDF</button>
      )}
    </div>
  );
}
