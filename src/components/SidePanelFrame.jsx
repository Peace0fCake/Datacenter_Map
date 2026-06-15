import { useState, useRef, useCallback } from 'react';

/**
 * Left-attached, resizable side-panel frame. Hosts whichever panel is on top of
 * the navigation stack (datacenter, operator, …). The child renders its own
 * `.details-panel` content; the frame owns the slide animation, width, and resize.
 */
export function SidePanelFrame({ open, children }) {
  const [width, setWidth] = useState(400);
  const widthRef = useRef(width);
  widthRef.current = width;

  const startResize = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    const onMove = (me) => setWidth(Math.max(280, Math.min(640, startW + me.clientX - startX)));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div className={`details-panel-wrapper ${open ? 'open' : ''}`} style={{ width }}>
      {children}
      {open && <div className="panel-resize-handle" onMouseDown={startResize} title="Drag to resize" />}
    </div>
  );
}
