import { useState, useRef, useCallback } from 'react';

export default function ResizableDivider({ onResize, position = 'horizontal' }) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startWidth = document.documentElement.style.getPropertyValue('--right-panel-width').trim() || '40%';

    function onMove(ev) {
      const parent = ref.current?.parentElement?.parentElement; // main-content__inner
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const pct = ((parentRect.right - ev.clientX) / parentRect.width) * 100;
      const clamped = Math.min(Math.max(pct, 25), 50);
      document.documentElement.style.setProperty('--right-panel-width', clamped + '%');
      onResize?.(clamped);
    }

    function onUp() {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onResize]);

  return (
    <div ref={ref} onMouseDown={handleMouseDown}
      className={'resizable-divider' + (dragging ? ' resizable-divider--dragging' : '')}
      style={{ width: 4, cursor: 'col-resize', flexShrink: 0, background: dragging ? 'var(--color-primary)' : 'transparent', transition: 'background 0.15s' }}
    />
  );
}
